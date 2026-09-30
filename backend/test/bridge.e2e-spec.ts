import request from 'supertest';
import { of } from 'rxjs';
import { Keypair } from '@stellar/stellar-sdk';
import { decodeFunctionData } from 'viem';
import { createTestApp, TestApp } from './utils/test-app';
import { createTestUser, signJwtFor } from './utils/auth-helpers';
import { BridgeService } from '../src/modules/bridge/bridge.service';
import { ConfigService } from '@nestjs/config';
import {
  buildCctpForwarderHookData,
  hexToBuffer,
  stellarContractToBytes32,
} from '../src/modules/bridge/cctp-encoding.util';

const toBytes32 = (hex: string) => hexToBuffer(hex.replace(/^0x/, '').padStart(64, '0'));

/** Builds a CCTP v2 burn message with the byte layout Circle attests to (see decodeCctpV2BurnMessage). */
function encodeBurnMessage(opts: {
  sourceDomain: number;
  destinationDomain: number;
  burnToken: string;
  mintRecipient: string;
  amount: bigint;
  messageSender: string;
  hookData: string;
}): string {
  const header = Buffer.alloc(148);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(opts.sourceDomain, 4);
  header.writeUInt32BE(opts.destinationDomain, 8);
  const body = Buffer.alloc(228);
  body.writeUInt32BE(1, 0);
  toBytes32(opts.burnToken).copy(body, 4);
  toBytes32(opts.mintRecipient).copy(body, 36);
  toBytes32(opts.amount.toString(16)).copy(body, 68);
  toBytes32(opts.messageSender).copy(body, 100);
  return `0x${Buffer.concat([header, body, hexToBuffer(opts.hookData)]).toString('hex')}`;
}

// Mirrors the private ABI in EvmRelayerService — only what's needed to
// decode calldata for assertions.
const TOKEN_MESSENGER_ABI = [
  {
    type: 'function',
    name: 'depositForBurnWithHook',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'destinationDomain', type: 'uint32' },
      { name: 'mintRecipient', type: 'bytes32' },
      { name: 'burnToken', type: 'address' },
      { name: 'destinationCaller', type: 'bytes32' },
      { name: 'maxFee', type: 'uint256' },
      { name: 'minFinalityThreshold', type: 'uint32' },
      { name: 'hookData', type: 'bytes' },
    ],
    outputs: [{ type: 'uint64' }],
  },
] as const;

// Standard ERC-20 approve — used to decode the source-token approve tx built
// ahead of ZeroXSwapQuoteService's swap calldata.
const ERC20_APPROVE_ABI = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const;

describe('USDC bridge infra — Phase 1: inbound CCTP to Stellar (e2e)', () => {
  let ctx: TestApp;
  let token: string;
  let userId: string;
  const destination = Keypair.random().publicKey();
  // Well-formed 20-byte hex addresses — depositForBurnWithHook's calldata is
  // now really ABI-encoded (not just passed to a mocked signer), so these
  // have to be valid, unlike the old shorthand placeholders.
  const evmUsdcAddress = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const evmTokenMessengerAddress = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const evmSourceAddress = '0x000000000000000000000000000000000000cc';
  const evmUsdtAddress = '0xffffffffffffffffffffffffffffffffffffffff';
  const zeroXAllowanceTarget = '0x1111111111111111111111111111111111111111';
  const zeroXSwapRouter = '0x2222222222222222222222222222222222222222';
  const evmEthereumUsdcAddress = '0x3333333333333333333333333333333333333333';
  const evmEthereumTokenMessengerAddress = '0x4444444444444444444444444444444444444444';
  const evmBrzAddress = '0x5555555555555555555555555555555555555555';
  const evmSellerAddress = '0x000000000000000000000000000000000000ee';

  beforeAll(async () => {
    ctx = await createTestApp('bridge-e2e');
    const user = await createTestUser(ctx.prisma as any);
    token = signJwtFor(user);
    userId = user.id;

    const baseChain = await (ctx.prisma as any).chain.create({
      data: {
        name: 'base',
        chainType: 'EVM',
        cctpDomain: 6,
        usdcAddress: evmUsdcAddress,
        tokenMessengerAddress: evmTokenMessengerAddress,
        messageTransmitterAddress: '0xdddddddddddddddddddddddddddddddddddddddd',
        isActive: true,
      },
    });

    await (ctx.prisma as any).chainToken.create({
      data: { chainId: baseChain.id, tokenCode: 'USDT', address: evmUsdtAddress, decimals: 6, fiatCurrency: 'USD', isActive: true },
    });

    const ethereumChain = await (ctx.prisma as any).chain.create({
      data: {
        name: 'ethereum',
        chainType: 'EVM',
        cctpDomain: 0,
        usdcAddress: evmEthereumUsdcAddress,
        tokenMessengerAddress: evmEthereumTokenMessengerAddress,
        messageTransmitterAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        isActive: true,
      },
    });

    await (ctx.prisma as any).chainToken.create({
      data: { chainId: ethereumChain.id, tokenCode: 'BRZ', address: evmBrzAddress, decimals: 18, fiatCurrency: 'BRL', isActive: true },
    });
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  describe('GET /bridge/chains', () => {
    it('is public and lists active chains, including stellar (auto-seeded) and base', async () => {
      const res = await request(ctx.app.getHttpServer()).get('/bridge/chains');

      expect(res.status).toBe(200);
      const names = res.body.map((c: any) => c.name);
      expect(names).toEqual(expect.arrayContaining(['stellar', 'base']));
    });
  });

  describe('POST /bridge/transfers', () => {
    it('requires authentication', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/bridge/transfers')
        .send({ sourceChain: 'base', destinationAddress: destination, sourceAddress: evmSourceAddress });
      expect(res.status).toBe(401);
    });

    it('rejects an EVM source with no sourceAddress', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/bridge/transfers')
        .set('Authorization', `Bearer ${token}`)
        .send({ sourceChain: 'base', destinationAddress: destination, expectedAmount: 50 });
      expect(res.status).toBe(400);
    });

    it('creates a transfer intent with unsigned, funds-safe approve/burn transactions', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/bridge/transfers')
        .set('Authorization', `Bearer ${token}`)
        .send({ sourceChain: 'base', destinationAddress: destination, expectedAmount: 50, sourceAddress: evmSourceAddress });

      expect(res.status).toBe(201);
      expect(res.body.reference).toEqual(expect.stringMatching(/^txn_ref_/));
      expect(res.body.approveTransaction.to.toLowerCase()).toBe(evmUsdcAddress);
      expect(res.body.burnTransaction.to.toLowerCase()).toBe(evmTokenMessengerAddress);

      // Decode the real calldata — mintRecipient/destinationCaller MUST be
      // the forwarder's raw 32 bytes, or funds are unrecoverable.
      const decoded = decodeFunctionData({ abi: TOKEN_MESSENGER_ABI, data: res.body.burnTransaction.data });
      const [, destinationDomain, mintRecipient, , destinationCaller, , , hookData] = decoded.args;
      expect(destinationDomain).toBe(27);
      expect(mintRecipient).toBe(destinationCaller);
      expect(mintRecipient).toEqual(expect.stringMatching(/^0x[0-9a-f]{64}$/));
      expect(hookData).toEqual(expect.stringMatching(/^0x/));

      const row = await (ctx.prisma as any).bridgeTransfer.findUnique({
        where: { reference: res.body.reference },
      });
      expect(row.status).toBe('PENDING_BURN');
      expect(row.sourceChain).toBe('base');
      // Non-custodial — nothing server-held should ever be written for an EVM source.
      expect(row.collectionAddress).toBeNull();
      expect(row.collectionAddressEncryptedKey).toBeNull();
    });

    it('rejects an unregistered source chain', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/bridge/transfers')
        .set('Authorization', `Bearer ${token}`)
        .send({ sourceChain: 'arbitrum', destinationAddress: destination, sourceAddress: evmSourceAddress });
      expect(res.status).toBe(404);
    });

    it('rejects a malformed Stellar destination address', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/bridge/transfers')
        .set('Authorization', `Bearer ${token}`)
        .send({ sourceChain: 'base', destinationAddress: 'not-a-stellar-address', sourceAddress: evmSourceAddress });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /bridge/transfers/:reference/register-burn', () => {
    async function createPendingTransfer() {
      const res = await request(ctx.app.getHttpServer())
        .post('/bridge/transfers')
        .set('Authorization', `Bearer ${token}`)
        .send({ sourceChain: 'base', destinationAddress: destination, sourceAddress: evmSourceAddress });
      return res.body.reference as string;
    }

    it('moves a transfer from PENDING_BURN to BURNED', async () => {
      const reference = await createPendingTransfer();

      const res = await request(ctx.app.getHttpServer())
        .post(`/bridge/transfers/${reference}/register-burn`)
        .set('Authorization', `Bearer ${token}`)
        .send({ burnTxHash: 'a'.repeat(64) });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('BURNED');
      expect(res.body.burnTxHash).toBe('a'.repeat(64));
    });

    it('rejects a malformed burn tx hash', async () => {
      const reference = await createPendingTransfer();
      const res = await request(ctx.app.getHttpServer())
        .post(`/bridge/transfers/${reference}/register-burn`)
        .set('Authorization', `Bearer ${token}`)
        .send({ burnTxHash: 'not-a-hash' });
      expect(res.status).toBe(400);
    });

    it('returns 404 for an unknown reference', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/bridge/transfers/txn_ref_doesnotexist/register-burn')
        .set('Authorization', `Bearer ${token}`)
        .send({ burnTxHash: 'b'.repeat(64) });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /bridge/transfers/:reference', () => {
    it('returns the current status', async () => {
      const createRes = await request(ctx.app.getHttpServer())
        .post('/bridge/transfers')
        .set('Authorization', `Bearer ${token}`)
        .send({ sourceChain: 'base', destinationAddress: destination, sourceAddress: evmSourceAddress });

      const res = await request(ctx.app.getHttpServer())
        .get(`/bridge/transfers/${createRes.body.reference}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('PENDING_BURN');
    });
  });

  describe('BridgeService.findAndCompletePendingTransfers (relayer, no client callback)', () => {
    it('completes a BURNED transfer once Circle attestation is ready, minting on Stellar', async () => {
      const createRes = await request(ctx.app.getHttpServer())
        .post('/bridge/transfers')
        .set('Authorization', `Bearer ${token}`)
        .send({ sourceChain: 'base', destinationAddress: destination, sourceAddress: evmSourceAddress });
      const reference = createRes.body.reference;

      await request(ctx.app.getHttpServer())
        .post(`/bridge/transfers/${reference}/register-burn`)
        .set('Authorization', `Bearer ${token}`)
        .send({ burnTxHash: 'c'.repeat(64) });

      ctx.httpService.get.mockReturnValue(
        of({
          data: {
            messages: [{ status: 'complete', message: '0xdeadbeef', attestation: '0xcafebabe' }],
          },
        }),
      );
      ctx.stellarService.mintCctpTransfer.mockResolvedValue('stellarMintHash1');

      const bridgeService = ctx.app.get(BridgeService);
      const result = await bridgeService.findAndCompletePendingTransfers();

      expect(result.completed).toBeGreaterThanOrEqual(1);
      expect(ctx.stellarService.mintCctpTransfer).toHaveBeenCalledWith({
        cctpForwarderAddress: 'CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ',
        message: Buffer.from('deadbeef', 'hex'),
        attestation: Buffer.from('cafebabe', 'hex'),
      });

      const row = await (ctx.prisma as any).bridgeTransfer.findUnique({ where: { reference } });
      expect(row.status).toBe('COMPLETED');
      expect(row.mintTxHash).toBe('stellarMintHash1');
    });

    it('leaves a BURNED transfer alone when no attestation is ready yet', async () => {
      const createRes = await request(ctx.app.getHttpServer())
        .post('/bridge/transfers')
        .set('Authorization', `Bearer ${token}`)
        .send({ sourceChain: 'base', destinationAddress: destination, sourceAddress: evmSourceAddress });
      const reference = createRes.body.reference;

      await request(ctx.app.getHttpServer())
        .post(`/bridge/transfers/${reference}/register-burn`)
        .set('Authorization', `Bearer ${token}`)
        .send({ burnTxHash: 'd'.repeat(64) });

      ctx.httpService.get.mockReturnValue(of({ data: { messages: [] } }));

      const bridgeService = ctx.app.get(BridgeService);
      await bridgeService.findAndCompletePendingTransfers();

      const row = await (ctx.prisma as any).bridgeTransfer.findUnique({ where: { reference } });
      expect(row.status).toBe('BURNED');
    });
  });

  describe('Swap tab: payoutStablecoinCode quoting + slippage floor', () => {
    // These two call BridgeService directly (same DI instance the relayer
    // describe block above already uses) rather than through HTTP — the
    // controller/route wiring for POST /bridge/transfers is already
    // covered by the "creates a transfer intent..." test above, and this
    // file's suite is already close to the global ThrottlerGuard's 10/min
    // budget for that route by this point in the run; what's actually
    // under test here (createTransferIntent's up-front quote + floor
    // logic) lives in the service either way.
    it('requires expectedAmount when payoutStablecoinCode is set', async () => {
      const bridgeService = ctx.app.get(BridgeService);
      await expect(
        bridgeService.createTransferIntent({
          sourceChain: 'base',
          destinationAddress: destination,
          sourceAddress: evmSourceAddress,
          payoutStablecoinCode: 'CNGN',
        } as any),
      ).rejects.toThrow(/expectedAmount is required/);
    });

    it('quotes the payout up front and persists a slippage floor', async () => {
      ctx.stellarService.getStrictSendQuote.mockResolvedValue({ sourceAmount: '100', destinationAmount: '95000' });

      const bridgeService = ctx.app.get(BridgeService);
      const result = await bridgeService.createTransferIntent({
        sourceChain: 'base',
        destinationAddress: destination,
        sourceAddress: evmSourceAddress,
        expectedAmount: 100,
        payoutStablecoinCode: 'cngn',
      } as any);

      expect(result.estimatedPayoutAmount).toBe('95000');
      expect(result.exchangeRate).toBeCloseTo(950);

      const row = await (ctx.prisma as any).bridgeTransfer.findUnique({ where: { reference: result.reference } });
      expect(row.payoutStablecoinCode).toBe('CNGN');
      expect(Number(row.quotedPayoutAmount)).toBe(95000);
      // Default 5% slippage: floor is 95% of the quote.
      expect(Number(row.minPayoutAmount)).toBeCloseTo(90250);
    });

    let swapBurnHashCounter = 0;

    /**
     * Inserts a BURNED BridgeTransfer row directly, skipping the HTTP
     * create/register-burn endpoints entirely — those are already covered
     * above and by the register-burn describe block; going through them
     * again here just burns into the global ThrottlerGuard's request
     * budget (10/min, shared across this whole suite) for no test value,
     * since what's under test here is payoutCorridorStablecoin's
     * quote-vs-floor decision inside findAndCompletePendingTransfers, not
     * the HTTP layer.
     */
    async function createBurnedSwapTransfer(quotedDestinationAmount: string): Promise<string> {
      swapBurnHashCounter += 1;
      const reference = `test_swap_ref_${swapBurnHashCounter}`;
      const burnTxHash = swapBurnHashCounter.toString(16).padStart(64, 'e');
      const minPayoutAmount = parseFloat(quotedDestinationAmount) * 0.95;

      await (ctx.prisma as any).bridgeTransfer.create({
        data: {
          reference,
          sourceChain: 'base',
          sourceAddress: evmSourceAddress,
          destinationChain: 'stellar',
          destinationAddress: destination,
          expectedAmount: 100,
          payoutStablecoinCode: 'CNGN',
          payoutSlippage: 0.05,
          quotedPayoutAmount: quotedDestinationAmount,
          minPayoutAmount,
          burnTxHash,
          status: 'BURNED',
        },
      });

      // A genuine-shaped attested burn: 100 USDC from evmSourceAddress on
      // Base, minting via the forwarder into AutoRamp's distribution
      // account — payout verification rejects anything less specific.
      const stellarChain = await (ctx.prisma as any).chain.findUnique({ where: { name: 'stellar' } });
      const distributionAccount = ctx.app.get(ConfigService).get<string>('STELLAR_DISTRIBUTION_PUBLIC_KEY') as string;
      const message = encodeBurnMessage({
        sourceDomain: 6,
        destinationDomain: stellarChain.cctpDomain,
        burnToken: evmUsdcAddress,
        mintRecipient: stellarContractToBytes32(stellarChain.cctpForwarderAddress),
        amount: 100_000_000n,
        messageSender: evmSourceAddress,
        hookData: buildCctpForwarderHookData(distributionAccount),
      });

      ctx.httpService.get.mockReturnValue(
        of({ data: { messages: [{ status: 'complete', message, attestation: '0xcafebabe' }] } }),
      );
      ctx.stellarService.mintCctpTransfer.mockResolvedValue(`stellarMintHash_${reference}`);

      return reference;
    }

    it('pays out normally when the live quote at completion is still within the floor', async () => {
      const reference = await createBurnedSwapTransfer('95000');
      // Live quote at completion time is slightly better than the original
      // 95000 estimate — well within the 90250 floor.
      ctx.stellarService.getStrictSendQuote.mockResolvedValue({ sourceAmount: '100', destinationAmount: '96000' });
      ctx.stellarService.sendFromDistribution.mockResolvedValue('payoutTxHash1');

      const bridgeService = ctx.app.get(BridgeService);
      await bridgeService.findAndCompletePendingTransfers();

      const row = await (ctx.prisma as any).bridgeTransfer.findUnique({ where: { reference } });
      expect(row.status).toBe('COMPLETED');
      expect(row.payoutTxHash).toBe('payoutTxHash1');
      expect(Number(row.payoutAmount)).toBe(96000);
    });

    it('holds the payout instead of paying out short when the live quote falls below the floor', async () => {
      // Clear call history from the previous test's sendFromDistribution
      // call — mocks in this file aren't reset between tests.
      ctx.stellarService.sendFromDistribution.mockClear();
      const reference = await createBurnedSwapTransfer('95000');
      // Rate moved against the user during the bridge wait — well below
      // the 90250 floor captured at intent-creation time.
      ctx.stellarService.getStrictSendQuote.mockResolvedValue({ sourceAmount: '100', destinationAmount: '80000' });

      const bridgeService = ctx.app.get(BridgeService);
      await bridgeService.findAndCompletePendingTransfers();

      const row = await (ctx.prisma as any).bridgeTransfer.findUnique({ where: { reference } });
      expect(row.status).toBe('PAYOUT_HELD');
      expect(row.payoutTxHash).toBeNull();
      expect(row.payoutAmount).toBeNull();
      expect(row.errorMessage).toEqual(expect.stringContaining('80000'));
      expect(ctx.stellarService.sendFromDistribution).not.toHaveBeenCalled();
    });
  });

  describe('Multi-stablecoin bridge-in: sourceTokenCode swap-before-burn', () => {
    // Calls BridgeService directly (same pattern as the payout-quoting
    // tests above) rather than through HTTP — none of these three exercise
    // controller/route wiring (already covered by "creates a transfer
    // intent..." above), and this suite is already close to the global
    // ThrottlerGuard's 10/min budget for POST /bridge/transfers by this
    // point in the run.
    it('rejects sourceTokenCode on a Stellar source', async () => {
      const bridgeService = ctx.app.get(BridgeService);
      await expect(
        bridgeService.createTransferIntent({
          sourceChain: 'stellar',
          destinationChain: 'base',
          destinationAddress: '0x000000000000000000000000000000000000dd',
          sourceAddress: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37',
          expectedAmount: 100,
          sourceTokenCode: 'USDT',
        } as any),
      ).rejects.toThrow(/sourceTokenCode requires an EVM sourceChain/);
    });

    it('rejects an unregistered sourceTokenCode', async () => {
      const bridgeService = ctx.app.get(BridgeService);
      await expect(
        bridgeService.createTransferIntent({
          sourceChain: 'base',
          destinationAddress: destination,
          sourceAddress: evmSourceAddress,
          expectedAmount: 100,
          sourceTokenCode: 'DAI', // only USDT is seeded for base
        } as any),
      ).rejects.toThrow(/No active token "DAI"/);
    });

    it('quotes and builds a swap-then-approve-then-burn sequence for a non-USDC source token', async () => {
      // 100 USDT -> 99.5 USDC point estimate, 98.505 USDC guaranteed minimum
      // (1% slippage) — all 6-decimal raw units.
      ctx.httpService.get.mockReturnValueOnce(
        of({
          data: {
            liquidityAvailable: true,
            buyAmount: '99500000',
            minBuyAmount: '98505000',
            transaction: { to: zeroXSwapRouter, data: '0x1234abcd', value: '0x0' },
            issues: { allowance: { spender: zeroXAllowanceTarget } },
          },
        }),
      );

      const bridgeService = ctx.app.get(BridgeService);
      const result = await bridgeService.createTransferIntent({
        sourceChain: 'base',
        destinationAddress: destination,
        sourceAddress: evmSourceAddress,
        expectedAmount: 100,
        sourceTokenCode: 'usdt',
      } as any);

      expect(result.estimatedSourceSwapUsdc).toBe('98.505');

      // Step 1: approve USDT to 0x's allowance target for the full 100 USDT.
      expect(result.sourceSwapApproveTransaction!.to.toLowerCase()).toBe(evmUsdtAddress);
      const approveDecoded = decodeFunctionData({ abi: ERC20_APPROVE_ABI, data: result.sourceSwapApproveTransaction!.data as `0x${string}` });
      expect((approveDecoded.args[0] as string).toLowerCase()).toBe(zeroXAllowanceTarget);
      expect(approveDecoded.args[1]).toBe(100_000_000n);

      // Step 2: the 0x swap calldata, passed through unmodified.
      expect(result.sourceSwapTransaction!.to.toLowerCase()).toBe(zeroXSwapRouter);
      expect(result.sourceSwapTransaction!.data).toBe('0x1234abcd');

      // Step 3/4: the usual USDC approve + burn — but sized to the swap's
      // guaranteed-minimum USDC output (98.505), not the original 100 USDT.
      expect(result.approveTransaction!.to.toLowerCase()).toBe(evmUsdcAddress);
      const burnDecoded = decodeFunctionData({ abi: TOKEN_MESSENGER_ABI, data: result.burnTransaction!.data as `0x${string}` });
      expect(burnDecoded.args[0]).toBe(98_505_000n);

      const row = await (ctx.prisma as any).bridgeTransfer.findUnique({ where: { reference: result.reference } });
      expect(row.sourceTokenCode).toBe('USDT');
      expect(Number(row.sourceSwapQuote)).toBe(99.5);
      expect(Number(row.sourceSwapMinUsdc)).toBe(98.505);
      expect(Number(row.expectedAmount)).toBe(98.505);
    });
  });

  describe('payoutTokenCode + POST /bridge/transfers/:reference/build-destination-swap', () => {
    // Validation-only cases call BridgeService directly rather than through
    // HTTP — same reasoning as the "Swap tab"/"Multi-stablecoin" blocks
    // above: POST /bridge/transfers' own 10/min ThrottlerGuard budget is
    // already spent by the earlier HTTP-level describe blocks in this file
    // (which do cover the controller/route wiring for that endpoint), and
    // what's under test here (createTransferIntent's payoutTokenCode
    // validation) lives in the service either way.
    it('rejects payoutTokenCode against a Stellar destinationChain', async () => {
      const bridgeService = ctx.app.get(BridgeService);
      await expect(
        bridgeService.createTransferIntent({
          sourceChain: 'base',
          destinationAddress: destination,
          sourceAddress: evmSourceAddress,
          payoutTokenCode: 'BRZ',
        } as any),
      ).rejects.toThrow(/payoutTokenCode requires an EVM destinationChain/);
    });

    it('rejects an unregistered payoutTokenCode on the destination chain', async () => {
      const bridgeService = ctx.app.get(BridgeService);
      await expect(
        bridgeService.createTransferIntent({
          sourceChain: 'base',
          destinationChain: 'ethereum',
          destinationAddress: evmSellerAddress,
          sourceAddress: evmSourceAddress,
          payoutTokenCode: 'DAI', // only BRZ is seeded on ethereum
        } as any),
      ).rejects.toThrow(/No active token "DAI"/);
    });

    it('creates a transfer with payoutTokenCode persisted, then builds a live destination swap once COMPLETED', async () => {
      const bridgeService = ctx.app.get(BridgeService);
      const created = await bridgeService.createTransferIntent({
        sourceChain: 'base',
        destinationChain: 'ethereum',
        destinationAddress: evmSellerAddress,
        sourceAddress: evmSourceAddress,
        expectedAmount: 200,
        payoutTokenCode: 'brz',
      } as any);
      const reference = created.reference;

      const row = await (ctx.prisma as any).bridgeTransfer.findUnique({ where: { reference } });
      expect(row.payoutTokenCode).toBe('BRZ');
      expect(row.status).toBe('PENDING_BURN');

      // build-destination-swap requires the transfer to be COMPLETED first
      // — this and the swap call below DO go through HTTP, since the
      // controller/route wiring for this endpoint is exactly what's under
      // test (it has its own, still-fresh ThrottlerGuard budget).
      const tooEarlyRes = await request(ctx.app.getHttpServer())
        .post(`/bridge/transfers/${reference}/build-destination-swap`)
        .set('Authorization', `Bearer ${token}`);
      expect(tooEarlyRes.status).toBe(400);

      await (ctx.prisma as any).bridgeTransfer.update({ where: { reference }, data: { status: 'COMPLETED' } });

      ctx.httpService.get.mockReturnValueOnce(
        of({
          data: {
            liquidityAvailable: true,
            buyAmount: '550000000000000000000', // 550 BRZ (18 decimals)
            minBuyAmount: '540000000000000000000', // 540 BRZ
            transaction: { to: zeroXSwapRouter, data: '0xswapdata', value: '0x0' },
            issues: { allowance: { spender: zeroXAllowanceTarget } },
          },
        }),
      );

      const swapRes = await request(ctx.app.getHttpServer())
        .post(`/bridge/transfers/${reference}/build-destination-swap`)
        .set('Authorization', `Bearer ${token}`);

      expect(swapRes.status).toBe(201);
      expect(swapRes.body.estimatedOutput).toBe('550');
      expect(swapRes.body.minOutput).toBe('540');
      expect(swapRes.body.swapTransaction.to.toLowerCase()).toBe(zeroXSwapRouter);
      expect(swapRes.body.approveTransaction.to.toLowerCase()).toBe(evmEthereumUsdcAddress);
    });

    it('returns 404 for build-destination-swap on an unknown reference', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/bridge/transfers/txn_ref_doesnotexist/build-destination-swap')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /bridge/evm-swap (same-chain, no bridging)', () => {
    it('quotes and builds unsigned approve + swap calldata for a same-chain pair', async () => {
      ctx.httpService.get.mockReturnValueOnce(
        of({
          data: {
            liquidityAvailable: true,
            buyAmount: '990000',
            minBuyAmount: '970000',
            transaction: { to: zeroXSwapRouter, data: '0xswapdata2', value: '0x0' },
            issues: { allowance: { spender: zeroXAllowanceTarget } },
          },
        }),
      );

      const res = await request(ctx.app.getHttpServer())
        .post('/bridge/evm-swap')
        .set('Authorization', `Bearer ${token}`)
        .send({ chainName: 'base', sellTokenCode: 'USDC', buyTokenCode: 'USDT', sellAmount: 100, takerAddress: evmSourceAddress });

      expect(res.status).toBe(201);
      expect(res.body.estimatedOutput).toBe('0.99');
      expect(res.body.minOutput).toBe('0.97');
      expect(res.body.approveTransaction.to.toLowerCase()).toBe(evmUsdcAddress);
      expect(res.body.swapTransaction.to.toLowerCase()).toBe(zeroXSwapRouter);
    });

    it('rejects a Stellar chainName', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/bridge/evm-swap')
        .set('Authorization', `Bearer ${token}`)
        .send({ chainName: 'stellar', sellTokenCode: 'USDC', buyTokenCode: 'USDT', sellAmount: 100, takerAddress: evmSourceAddress });
      expect(res.status).toBe(400);
    });

    it('rejects identical sell/buy tokens', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/bridge/evm-swap')
        .set('Authorization', `Bearer ${token}`)
        .send({ chainName: 'base', sellTokenCode: 'USDC', buyTokenCode: 'usdc', sellAmount: 100, takerAddress: evmSourceAddress });
      expect(res.status).toBe(400);
    });
  });

  describe('payoutFiat (Sell tab, any chain to fiat)', () => {
    // Same reasoning as the payoutTokenCode block above — POST
    // /bridge/transfers' ThrottlerGuard budget for this file is already
    // spent by the earlier HTTP-level tests, so these call BridgeService
    // directly; controller/route wiring for this endpoint is already
    // covered by the "creates a transfer intent..." HTTP test near the top
    // of this file.
    it('requires bank details', async () => {
      const bridgeService = ctx.app.get(BridgeService);
      await expect(
        bridgeService.createTransferIntent(
          { sourceChain: 'base', sourceAddress: evmSourceAddress, expectedAmount: 100, payoutFiat: true } as any,
          userId,
        ),
      ).rejects.toThrow(/payoutBankCode, payoutAccountNumber, and payoutFiatCurrency are all required/);
    });

    it('rejects an EVM destinationChain', async () => {
      const bridgeService = ctx.app.get(BridgeService);
      await expect(
        bridgeService.createTransferIntent(
          {
            sourceChain: 'base',
            destinationChain: 'ethereum',
            destinationAddress: evmSellerAddress,
            sourceAddress: evmSourceAddress,
            expectedAmount: 100,
            payoutFiat: true,
            payoutBankCode: '058',
            payoutAccountNumber: '0123456789',
            payoutFiatCurrency: 'NGN',
          } as any,
          userId,
        ),
      ).rejects.toThrow(/payoutFiat requires destinationChain to be stellar/);
    });

    it('quotes the fiat payout up front, defaulting destinationAddress to the distribution account, with no destinationAddress supplied', async () => {
      ctx.stellarService.getStrictSendQuote.mockResolvedValue({ sourceAmount: '100', destinationAmount: '160000' });

      const bridgeService = ctx.app.get(BridgeService);
      const result = await bridgeService.createTransferIntent(
        {
          sourceChain: 'base',
          sourceAddress: evmSourceAddress,
          expectedAmount: 100,
          payoutFiat: true,
          payoutBankCode: '058',
          payoutAccountNumber: '0123456789',
          payoutFiatCurrency: 'ngn',
        } as any,
        userId,
      );

      expect(result.estimatedPayoutAmount).toBe('160000');

      const row = await (ctx.prisma as any).bridgeTransfer.findUnique({ where: { reference: result.reference } });
      expect(row.payoutFiat).toBe(true);
      expect(row.payoutFiatCurrency).toBe('NGN');
      expect(row.payoutBankCode).toBe('058');
      expect(row.destinationChain).toBe('stellar');
      // destinationAddress defaults to the configured distribution account
      // since nothing is ever actually delivered there for a fiat payout.
      expect(row.destinationAddress).toEqual(expect.stringMatching(/^[GMC][A-Z2-7]{54,68}$/));
    });
  });
});
