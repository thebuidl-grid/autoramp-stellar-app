import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Asset,
  BASE_FEE,
  Contract,
  Horizon,
  Keypair,
  Memo,
  nativeToScVal,
  Operation,
  rpc,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { STELLAR_CONFIG } from './stellar.constants';

export interface PathPaymentQuote {
  sourceAmount: string;
  destinationAmount: string;
  path: Asset[];
}

export interface BuiltTransaction {
  xdr: string;
  networkPassphrase: string;
}

/**
 * StellarService
 *
 * Thin wrapper around Horizon for everything the app needs on Stellar:
 * balances, trustlines, path-payment quoting/building, distribution-account
 * payments (onramp minting), and memo-based incoming-payment lookup
 * (offramp deposit detection).
 *
 * Swap/path-payment execution is signed client-side by the user's wallet —
 * this service only builds unsigned XDR for the frontend to sign, mirroring
 * how the previous Base implementation left execution to the frontend.
 */
@Injectable()
export class StellarService {
  private readonly logger = new Logger(StellarService.name);
  private readonly server: Horizon.Server;

  constructor(private readonly configService: ConfigService) {
    const horizonUrl =
      this.configService.get<string>('STELLAR_HORIZON_URL') ||
      STELLAR_CONFIG.horizonUrl;
    this.server = new Horizon.Server(horizonUrl);
  }

  get networkPassphrase(): string {
    return (
      this.configService.get<string>('STELLAR_NETWORK_PASSPHRASE') ||
      STELLAR_CONFIG.networkPassphrase
    );
  }

  /**
   * Get the balance of a single asset for an account.
   * Returns null if the account has no trustline for the asset (or no balance).
   */
  async getBalance(publicKey: string, asset: Asset): Promise<string | null> {
    try {
      const account = await this.server.loadAccount(publicKey);
      const line = account.balances.find((b: any) =>
        asset.isNative()
          ? b.asset_type === 'native'
          : b.asset_code === asset.getCode() &&
            b.asset_issuer === asset.getIssuer(),
      );
      return line ? line.balance : null;
    } catch (error: any) {
      this.logger.error(
        `Error fetching balance for ${publicKey}: ${error.message}`,
      );
      throw new BadRequestException(
        `Failed to fetch balance: ${error.message}`,
      );
    }
  }

  async getBalances(
    publicKey: string,
    assets: Record<string, Asset>,
  ): Promise<Record<string, string | null>> {
    const keys = Object.keys(assets);
    const balances = await Promise.all(keys.map((key) => this.getBalance(publicKey, assets[key])));
    return Object.fromEntries(keys.map((key, i) => [key, balances[i]]));
  }

  /**
   * Whether an account already has a trustline for the given asset
   * (native XLM is always "trusted").
   */
  async hasTrustline(publicKey: string, asset: Asset): Promise<boolean> {
    if (asset.isNative()) return true;
    const balance = await this.getBalance(publicKey, asset);
    return balance !== null;
  }

  /**
   * Get the best available path-payment quote for a fixed send amount.
   * Mirrors what the Aerodrome quoter previously did, using Stellar's
   * native DEX/liquidity-pool routing instead of a custom AMM contract.
   */
  async getStrictSendQuote(
    sourceAsset: Asset,
    sourceAmount: string,
    destAsset: Asset,
  ): Promise<PathPaymentQuote> {
    try {
      const paths = await this.server
        .strictSendPaths(sourceAsset, sourceAmount, [destAsset])
        .call();

      const best = paths.records[0];
      if (!best) {
        throw new Error('No payment path found for this asset pair/amount');
      }

      return {
        sourceAmount: best.source_amount,
        destinationAmount: best.destination_amount,
        path: best.path.map((p: any) =>
          p.asset_type === 'native'
            ? Asset.native()
            : new Asset(p.asset_code, p.asset_issuer),
        ),
      };
    } catch (error: any) {
      this.logger.error(`Error getting strict-send quote: ${error.message}`);
      throw new BadRequestException(
        `Failed to get swap quote: ${error.message}`,
      );
    }
  }

  /**
   * Build an unsigned PathPaymentStrictSend transaction for the user's
   * wallet to sign and submit. `sourcePublicKey` is the account paying in
   * (and, for a plain swap, also receiving the output).
   */
  async buildPathPaymentTransaction(params: {
    sourcePublicKey: string;
    sendAsset: Asset;
    sendAmount: string;
    destAsset: Asset;
    destMin: string;
    destination: string;
    path?: Asset[];
    memo?: string;
  }): Promise<BuiltTransaction> {
    try {
      const account = await this.server.loadAccount(params.sourcePublicKey);

      const builder = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      }).addOperation(
        Operation.pathPaymentStrictSend({
          sendAsset: params.sendAsset,
          sendAmount: params.sendAmount,
          destination: params.destination,
          destAsset: params.destAsset,
          destMin: params.destMin,
          path: params.path,
        }),
      );

      if (params.memo) {
        builder.addMemo(Memo.text(params.memo));
      }

      const tx = builder.setTimeout(180).build();

      return { xdr: tx.toXDR(), networkPassphrase: this.networkPassphrase };
    } catch (error: any) {
      this.logger.error(
        `Error building path payment transaction: ${error.message}`,
      );
      throw new BadRequestException(
        `Failed to build swap transaction: ${error.message}`,
      );
    }
  }

  /**
   * Build a trustline transaction where AutoRamp's distribution account
   * sponsors the reserve — the user signs and submits, but never has to
   * fund the ~0.5 XLM reserve a new trustline normally requires. The
   * user's own account is the transaction source (their own sequence
   * number, so concurrent requests from different users never collide on
   * a shared account); only the base fee (negligible) is paid by the
   * user, from their existing balance.
   *
   * Requires the user's account to already exist on-chain (i.e. be
   * funded with at least the minimum reserve) — sponsoring account
   * *creation* itself is a further step this doesn't cover.
   */
  async buildSponsoredTrustlineTransaction(params: {
    userPublicKey: string;
    asset: Asset;
  }): Promise<BuiltTransaction> {
    const distributionSecret = this.configService.get<string>(
      'STELLAR_DISTRIBUTION_SECRET',
    );
    if (!distributionSecret) {
      throw new BadRequestException(
        'STELLAR_DISTRIBUTION_SECRET is required in config',
      );
    }

    try {
      const distributionKeypair = Keypair.fromSecret(distributionSecret);
      const userAccount = await this.server.loadAccount(params.userPublicKey);

      const tx = new TransactionBuilder(userAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          Operation.beginSponsoringFutureReserves({
            sponsoredId: params.userPublicKey,
            source: distributionKeypair.publicKey(),
          }),
        )
        .addOperation(Operation.changeTrust({ asset: params.asset }))
        .addOperation(Operation.endSponsoringFutureReserves({}))
        .setTimeout(180)
        .build();

      // Partial signature covering the begin-sponsoring op (attributed to
      // the distribution account) — the user still needs to sign for
      // their own ops (changeTrust, endSponsoring) before submitting.
      tx.sign(distributionKeypair);

      return { xdr: tx.toXDR(), networkPassphrase: this.networkPassphrase };
    } catch (error: any) {
      this.logger.error(
        `Error building sponsored trustline transaction: ${error.message}`,
      );
      throw new BadRequestException(
        `Failed to build sponsored trustline transaction: ${error.message}`,
      );
    }
  }

  /**
   * Send CNGN from AutoRamp's distribution account to a user's wallet
   * (the "mint" step of an onramp, once NGN payment is confirmed).
   * Signed and submitted server-side — the distribution account is ours.
   */
  async sendFromDistribution(params: {
    asset: Asset;
    amount: string;
    destination: string;
    memo?: string;
  }): Promise<string> {
    const distributionSecret = this.configService.get<string>(
      'STELLAR_DISTRIBUTION_SECRET',
    );
    if (!distributionSecret) {
      throw new BadRequestException(
        'STELLAR_DISTRIBUTION_SECRET is required in config',
      );
    }

    try {
      const keypair = Keypair.fromSecret(distributionSecret);
      const account = await this.server.loadAccount(keypair.publicKey());

      const builder = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      }).addOperation(
        Operation.payment({
          destination: params.destination,
          asset: params.asset,
          amount: params.amount,
        }),
      );

      if (params.memo) {
        builder.addMemo(Memo.text(params.memo));
      }

      const tx = builder.setTimeout(180).build();
      tx.sign(keypair);

      const result = await this.server.submitTransaction(tx);
      return result.hash;
    } catch (error: any) {
      this.logger.error(
        `Error sending from distribution account: ${error.message}`,
      );
      throw new BadRequestException(`Failed to send payment: ${error.message}`);
    }
  }

  /**
   * Convert one asset AutoRamp's distribution account already holds into
   * another, in place — same account is both source and destination, via
   * PathPaymentStrictSend routed over Stellar's own DEX/liquidity pools.
   * Signed and submitted server-side, same custody model as
   * sendFromDistribution (this account is ours), just a swap instead of a
   * plain payment. Used to convert a freshly-minted corridor stablecoin
   * into USDC (or back) as part of an automatic Buy/Sell cross-chain leg.
   */
  async swapFromDistribution(params: {
    sendAsset: Asset;
    sendAmount: string;
    destAsset: Asset;
    destMin: string;
    path?: Asset[];
  }): Promise<string> {
    const distributionSecret = this.configService.get<string>(
      'STELLAR_DISTRIBUTION_SECRET',
    );
    if (!distributionSecret) {
      throw new BadRequestException(
        'STELLAR_DISTRIBUTION_SECRET is required in config',
      );
    }

    try {
      const keypair = Keypair.fromSecret(distributionSecret);
      const account = await this.server.loadAccount(keypair.publicKey());

      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          Operation.pathPaymentStrictSend({
            sendAsset: params.sendAsset,
            sendAmount: params.sendAmount,
            destination: keypair.publicKey(),
            destAsset: params.destAsset,
            destMin: params.destMin,
            path: params.path,
          }),
        )
        .setTimeout(180)
        .build();

      tx.sign(keypair);

      const result = await this.server.submitTransaction(tx);
      return result.hash;
    } catch (error: any) {
      this.logger.error(
        `Error swapping from distribution account: ${error.message}`,
      );
      throw new BadRequestException(`Failed to swap: ${error.message}`);
    }
  }

  /**
   * Custodial counterpart to buildCctpApproveTransaction/buildCctpBurnTransaction
   * — instead of returning unsigned XDR for a connected wallet, signs and
   * submits both steps server-side with STELLAR_DISTRIBUTION_SECRET,
   * mirroring mintCctpTransfer's sign+submit+poll shape. Used for an
   * automatic Buy delivering to a non-Stellar chain: the distribution
   * account burns USDC it already holds (from a prior swapFromDistribution
   * hop) to bridge it out on the user's behalf — the same custody window
   * that already exists the instant a corridor stablecoin is minted,
   * extended one hop further, not a new custody model.
   *
   * The Soroban contract's require_auth() only cares that whoever is named
   * `caller` actually signs the transaction — it doesn't care whether
   * that's a user's Freighter key or a server-held one, so this reuses the
   * exact same contract calls buildCctpApproveTransaction/
   * buildCctpBurnTransaction make, just with the distribution keypair as
   * both `caller` and transaction source instead of the end user's.
   */
  async executeCctpBurnFromDistribution(params: {
    tokenMessengerAddress: string;
    usdcContractAddress: string;
    amount: string; // human units, e.g. "10.5"
    destinationDomain: number;
    mintRecipient: Buffer; // bytes32
    destinationCaller: Buffer; // bytes32
    hookData?: Buffer;
  }): Promise<string> {
    const distributionSecret = this.configService.get<string>('STELLAR_DISTRIBUTION_SECRET');
    if (!distributionSecret) {
      throw new BadRequestException('STELLAR_DISTRIBUTION_SECRET is required in config');
    }
    const sorobanRpcUrl = this.configService.get<string>('STELLAR_SOROBAN_RPC_URL');
    if (!sorobanRpcUrl) {
      throw new BadRequestException('STELLAR_SOROBAN_RPC_URL is required in config');
    }

    const server = new rpc.Server(sorobanRpcUrl);
    const keypair = Keypair.fromSecret(distributionSecret);
    const amountStroops = BigInt(Math.round(parseFloat(params.amount) * 10_000_000));

    const signAndSubmit = async (tx: any): Promise<string> => {
      const prepared = await server.prepareTransaction(tx);
      prepared.sign(keypair);

      const sendResult = await server.sendTransaction(prepared);
      if (sendResult.status === 'ERROR') {
        throw new Error(`Soroban transaction rejected: ${JSON.stringify(sendResult.errorResult)}`);
      }

      const result = await server.pollTransaction(sendResult.hash, {
        attempts: 60,
        sleepStrategy: rpc.LinearSleepStrategy,
      });
      if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
        throw new Error(`Transaction did not succeed: ${result.status}`);
      }
      return sendResult.hash;
    };

    try {
      // Step 1: approve — same TokenMessenger allowance the self-custodial
      // path needs, granted by the distribution account over its own USDC
      // instead of a user's.
      const account = await server.getAccount(keypair.publicKey());
      const usdcContract = new Contract(params.usdcContractAddress);
      const latestLedger = await server.getLatestLedger();
      const expirationLedger = latestLedger.sequence + 100;

      const approveTx = new TransactionBuilder(account, {
        fee: '10000000',
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          usdcContract.call(
            'approve',
            nativeToScVal(keypair.publicKey(), { type: 'address' }),
            nativeToScVal(params.tokenMessengerAddress, { type: 'address' }),
            nativeToScVal(amountStroops, { type: 'i128' }),
            nativeToScVal(expirationLedger, { type: 'u32' }),
          ),
        )
        .setTimeout(120)
        .build();
      await signAndSubmit(approveTx);

      // Step 2: burn — must be built fresh (fresh account/sequence) after
      // the approve is confirmed, same ordering constraint as the
      // self-custodial path (simulating before the allowance exists on-chain
      // fails with HostError Contract #9).
      const burnAccount = await server.getAccount(keypair.publicKey());
      const tokenMessengerContract = new Contract(params.tokenMessengerAddress);
      const hasHookData = !!params.hookData && params.hookData.length > 0;
      const baseArgs = [
        nativeToScVal(keypair.publicKey(), { type: 'address' }), // caller
        nativeToScVal(amountStroops, { type: 'i128' }), // amount
        nativeToScVal(params.destinationDomain, { type: 'u32' }), // destination_domain
        nativeToScVal(params.mintRecipient, { type: 'bytes' }), // mint_recipient
        nativeToScVal(params.usdcContractAddress, { type: 'address' }), // burn_token
        nativeToScVal(params.destinationCaller, { type: 'bytes' }), // destination_caller
        nativeToScVal(0n, { type: 'i128' }), // max_fee — Standard (non-Fast) transfer
        nativeToScVal(2000, { type: 'u32' }), // min_finality_threshold
      ];

      const burnTx = new TransactionBuilder(burnAccount, {
        fee: '10000000',
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          hasHookData
            ? tokenMessengerContract.call(
                'deposit_for_burn_with_hook',
                ...baseArgs,
                nativeToScVal(params.hookData, { type: 'bytes' }),
              )
            : tokenMessengerContract.call('deposit_for_burn', ...baseArgs),
        )
        .setTimeout(120)
        .build();

      return await signAndSubmit(burnTx);
    } catch (error: any) {
      this.logger.error(`Error executing custodial CCTP burn: ${error.message}`);
      throw new BadRequestException(`Failed to execute CCTP burn: ${error.message}`);
    }
  }

  /**
   * Look up a submitted transaction by hash — used to sanity-check a
   * client-reported swap execution before trusting it.
   */
  async getTransactionByHash(
    hash: string,
  ): Promise<{ successful: boolean } | null> {
    try {
      const tx = await this.server.transactions().transaction(hash).call();
      return { successful: tx.successful };
    } catch (error: any) {
      this.logger.warn(
        `Could not verify transaction ${hash}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Find a recent incoming payment to `accountId` tagged with `memo`,
   * for the given asset. Used to detect offramp deposits, which (unlike
   * Base's unique-address-per-transaction model) all land on one shared
   * AutoRamp-controlled account and are disambiguated by memo.
   *
   * Polling-based for now (called on-demand / by a periodic check) —
   * a persistent Horizon payment stream is the natural production upgrade
   * and can replace the polling loop without changing this method's shape.
   */
  async findIncomingPaymentByMemo(
    accountId: string,
    memo: string,
    asset: Asset,
    limit = 50,
  ): Promise<{ amount: string; transactionHash: string } | null> {
    try {
      const payments = await this.server
        .payments()
        .forAccount(accountId)
        .order('desc')
        .limit(limit)
        .call();

      for (const payment of payments.records as any[]) {
        const isMatchingAsset =
          payment.type === 'payment' &&
          payment.to === accountId &&
          payment.asset_code === asset.getCode() &&
          payment.asset_issuer === asset.getIssuer();

        if (!isMatchingAsset) continue;

        const tx = await payment.transaction();
        if (tx.memo === memo) {
          return {
            amount: payment.amount,
            transactionHash: payment.transaction_hash,
          };
        }
      }

      return null;
    } catch (error: any) {
      this.logger.error(`Error searching payments by memo: ${error.message}`);
      return null;
    }
  }

  /**
   * Completes a CCTP transfer's Stellar leg by calling
   * `CctpForwarder.mint_and_forward(message, attestation)` — a Soroban
   * contract invocation, unlike every other method on this service (all
   * classic Horizon operations). Anyone can submit this call once a valid
   * attestation exists (same permissionless-relay property CCTP has on
   * EVM chains via `destinationCaller`), which is what lets
   * BridgeRelayerService complete transfers without the recipient ever
   * signing anything on Stellar.
   *
   * Signed with STELLAR_BRIDGE_RELAYER_SECRET — deliberately a separate
   * key from STELLAR_DISTRIBUTION_SECRET, so a bug in this newer code
   * path can't touch the funds backing fiat corridor payouts.
   */
  async mintCctpTransfer(params: {
    cctpForwarderAddress: string;
    message: Buffer;
    attestation: Buffer;
  }): Promise<string> {
    const relayerSecret = this.configService.get<string>('STELLAR_BRIDGE_RELAYER_SECRET');
    if (!relayerSecret) {
      throw new BadRequestException('STELLAR_BRIDGE_RELAYER_SECRET is required in config');
    }
    const sorobanRpcUrl = this.configService.get<string>('STELLAR_SOROBAN_RPC_URL');
    if (!sorobanRpcUrl) {
      throw new BadRequestException('STELLAR_SOROBAN_RPC_URL is required in config');
    }

    try {
      const server = new rpc.Server(sorobanRpcUrl);
      const relayerKeypair = Keypair.fromSecret(relayerSecret);
      const account = await server.getAccount(relayerKeypair.publicKey());
      const contract = new Contract(params.cctpForwarderAddress);

      const tx = new TransactionBuilder(account, {
        fee: '10000000', // Soroban ops need a higher ceiling than BASE_FEE; actual fee is set by simulation below
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          contract.call(
            'mint_and_forward',
            nativeToScVal(params.message, { type: 'bytes' }),
            nativeToScVal(params.attestation, { type: 'bytes' }),
          ),
        )
        .setTimeout(120)
        .build();

      const prepared = await server.prepareTransaction(tx);
      prepared.sign(relayerKeypair);

      const sendResult = await server.sendTransaction(prepared);
      if (sendResult.status === 'ERROR') {
        throw new Error(`Soroban transaction rejected: ${JSON.stringify(sendResult.errorResult)}`);
      }

      const result = await server.pollTransaction(sendResult.hash, {
        attempts: 60,
        sleepStrategy: rpc.LinearSleepStrategy,
      });
      if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
        throw new Error(`CCTP mint transaction did not succeed: ${result.status}`);
      }

      return sendResult.hash;
    } catch (error: any) {
      this.logger.error(`Error minting CCTP transfer on Stellar: ${error.message}`);
      throw new BadRequestException(`Failed to mint CCTP transfer: ${error.message}`);
    }
  }

  /**
   * Builds (unsigned) the approve() call granting the CCTP
   * TokenMessengerMinter an allowance over the caller's USDC — step 1 of
   * 2 for the Stellar-as-source leg of BridgeService.createTransferIntent
   * (step 2 is buildCctpBurnTransaction below). Returns XDR for the
   * user's own connected wallet to sign, never signed or submitted
   * server-side.
   *
   * Split into two independently-built/signed/submitted transactions,
   * not one, for two compounding reasons:
   *  1. The USDC SAC is a SEP-41 token — deposit_for_burn pulls funds via
   *     transfer_from, which requires a prior approve() from the caller,
   *     exactly like ERC-20.
   *  2. Unlike an ordinary classic-operation Stellar transaction, a
   *     Soroban transaction is protocol-limited to exactly one
   *     invokeHostFunction operation, so approve and deposit_for_burn
   *     can't even be batched into one transaction the way two
   *     Base/Ethereum calls could share a single EIP-5792 wallet session.
   *  3. buildCctpBurnTransaction's `server.prepareTransaction` call
   *     simulates against real on-chain state to compute the resource
   *     footprint — which means the approve() must have already been
   *     submitted and confirmed before the burn transaction can be built
   *     at all, or simulation sees a stale zero allowance and the
   *     contract rejects it (HostError Contract #9 "not enough allowance
   *     to spend"). This is why the two transactions are built by two
   *     separate methods/endpoints rather than both up front in
   *     createTransferIntent — see BridgeService.buildBurnTransaction.
   */
  async buildCctpApproveTransaction(params: {
    userPublicKey: string;
    tokenMessengerAddress: string;
    usdcContractAddress: string;
    amount: string; // human units, e.g. "10.5"
  }): Promise<BuiltTransaction> {
    const sorobanRpcUrl = this.configService.get<string>('STELLAR_SOROBAN_RPC_URL');
    if (!sorobanRpcUrl) {
      throw new BadRequestException('STELLAR_SOROBAN_RPC_URL is required in config');
    }

    try {
      const server = new rpc.Server(sorobanRpcUrl);
      const account = await server.getAccount(params.userPublicKey);
      const usdcContract = new Contract(params.usdcContractAddress);
      // USDC on Stellar uses 7 decimals — see buildCctpBurnTransaction's
      // doc comment for the source.
      const amountStroops = BigInt(Math.round(parseFloat(params.amount) * 10_000_000));

      const latestLedger = await server.getLatestLedger();
      const expirationLedger = latestLedger.sequence + 100;

      const tx = new TransactionBuilder(account, {
        fee: '10000000',
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          usdcContract.call(
            'approve',
            nativeToScVal(params.userPublicKey, { type: 'address' }), // from
            nativeToScVal(params.tokenMessengerAddress, { type: 'address' }), // spender
            nativeToScVal(amountStroops, { type: 'i128' }), // amount
            nativeToScVal(expirationLedger, { type: 'u32' }), // expiration_ledger
          ),
        )
        .setTimeout(120)
        .build();

      const prepared = await server.prepareTransaction(tx);
      return { xdr: prepared.toXDR(), networkPassphrase: this.networkPassphrase };
    } catch (error: any) {
      this.logger.error(`Error building CCTP approve transaction: ${error.message}`);
      throw new BadRequestException(`Failed to build CCTP approve transaction: ${error.message}`);
    }
  }

  /**
   * Builds (unsigned) the Soroban call to burn USDC out of Stellar via
   * CCTP — the outbound counterpart to mintCctpTransfer, and step 2 of 2
   * for the Stellar-as-source leg (see buildCctpApproveTransaction above
   * for step 1 and why they're separate transactions/calls). Returns
   * XDR for the user's own connected wallet to sign (their own USDC,
   * self-custodial — same "we build, the frontend signs" contract as
   * buildPathPaymentTransaction/buildSponsoredTrustlineTransaction), never
   * signed or submitted server-side. MUST only be called after the
   * approve transaction has been submitted and confirmed on-chain —
   * calling it before that fails simulation with HostError Contract #9
   * ("not enough allowance to spend").
   *
   * Argument list/order verified against circlefin/stellar-cctp's actual
   * trait definition (packages/cctp-interfaces/src/token_messenger.rs) —
   * an earlier version of this guessed at the signature from the EVM ABI
   * alone and was missing `caller`/`max_fee`/`min_finality_threshold`
   * entirely, which a real testnet call rejected outright
   * (HostError: MismatchingParameterLen). `caller` is the account this
   * transaction is built for and gets signed by, satisfying the
   * contract's require_auth(); max_fee=0/min_finality_threshold=2000
   * mirror EvmRelayerService's own "Standard" (non-Fast) transfer
   * constants for consistency across both chain families.
   *
   * Calls the plain `deposit_for_burn` (no hook data) unless real
   * hook data is supplied — `deposit_for_burn_with_hook` requires
   * non-empty hook_data (rejects with HostError Contract #7107
   * HookDataEmpty otherwise), matching the same non-empty-hookData
   * requirement on the EVM side's `depositForBurnWithHook`.
   *
   * USDC on Stellar uses 7 decimals (Stellar's native stroop precision),
   * unlike every other CCTP chain's 6 — verified against Circle's
   * published Stellar CCTP quickstart example (AMOUNT = 10_000_000n
   * // 1 USDC, "Stellar has 7 decimals").
   */
  async buildCctpBurnTransaction(params: {
    userPublicKey: string;
    tokenMessengerAddress: string;
    usdcContractAddress: string;
    amount: string; // human units, e.g. "10.5"
    destinationDomain: number;
    mintRecipient: Buffer; // bytes32
    destinationCaller: Buffer; // bytes32
    hookData?: Buffer;
  }): Promise<BuiltTransaction> {
    const sorobanRpcUrl = this.configService.get<string>('STELLAR_SOROBAN_RPC_URL');
    if (!sorobanRpcUrl) {
      throw new BadRequestException('STELLAR_SOROBAN_RPC_URL is required in config');
    }

    try {
      const server = new rpc.Server(sorobanRpcUrl);
      const account = await server.getAccount(params.userPublicKey);
      const contract = new Contract(params.tokenMessengerAddress);
      const amountStroops = BigInt(Math.round(parseFloat(params.amount) * 10_000_000));

      const hasHookData = !!params.hookData && params.hookData.length > 0;
      const baseArgs = [
        nativeToScVal(params.userPublicKey, { type: 'address' }), // caller
        nativeToScVal(amountStroops, { type: 'i128' }), // amount
        nativeToScVal(params.destinationDomain, { type: 'u32' }), // destination_domain
        nativeToScVal(params.mintRecipient, { type: 'bytes' }), // mint_recipient
        nativeToScVal(params.usdcContractAddress, { type: 'address' }), // burn_token
        nativeToScVal(params.destinationCaller, { type: 'bytes' }), // destination_caller
        nativeToScVal(0n, { type: 'i128' }), // max_fee — 0 = Standard (non-Fast) transfer
        nativeToScVal(2000, { type: 'u32' }), // min_finality_threshold — Circle's documented "Standard" threshold
      ];

      const tx = new TransactionBuilder(account, {
        fee: '10000000',
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          hasHookData
            ? contract.call(
                'deposit_for_burn_with_hook',
                ...baseArgs,
                nativeToScVal(params.hookData, { type: 'bytes' }), // hook_data
              )
            : contract.call('deposit_for_burn', ...baseArgs),
        )
        .setTimeout(120)
        .build();

      const prepared = await server.prepareTransaction(tx);
      return { xdr: prepared.toXDR(), networkPassphrase: this.networkPassphrase };
    } catch (error: any) {
      this.logger.error(`Error building CCTP burn transaction: ${error.message}`);
      throw new BadRequestException(`Failed to build CCTP burn transaction: ${error.message}`);
    }
  }
}
