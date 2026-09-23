/**
 * Seeds the corridor registry. Idempotent (upsert on the
 * countryCode/fiatCurrency unique key) so it's safe to re-run.
 *
 * Run with: npm run seed
 */
import { PrismaClient, LicensingStatus, Chain } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const issuer = process.env.CNGN_ISSUER_PUBLIC_KEY;
  if (!issuer) {
    throw new Error('CNGN_ISSUER_PUBLIC_KEY must be set to seed the corridor registry');
  }

  await prisma.corridor.upsert({
    where: { countryCode_fiatCurrency: { countryCode: 'NG', fiatCurrency: 'NGN' } },
    update: {},
    create: {
      countryCode: 'NG',
      fiatCurrency: 'NGN',
      stablecoinCode: 'CNGN',
      stablecoinIssuer: issuer,
      rampProcessorProvider: process.env.RAMP_PROCESSOR_PROVIDER || 'safehaven',
      licensingStatus: LicensingStatus.PARTNERED,
      isActive: true,
      notes: 'AutoRamp operates as the Stellar anchor for NGN; bank rail via SafeHaven (signed partner) or Paystack/Flint.',
    },
  });

  // Second corridor, proving the hub-and-spoke model: same issuing account
  // as CNGN (a Stellar issuer can issue multiple asset codes), a different
  // stablecoin code, and Paystack as the bank rail (Paystack genuinely
  // supports Ghana — DVAs + GhIPSS transfers, both confirmed against their
  // docs — see PaystackRampProcessor). UNLICENSED: this proves the
  // technical path, not a real Ghanaian licensing/partnership status.
  await prisma.corridor.upsert({
    where: { countryCode_fiatCurrency: { countryCode: 'GH', fiatCurrency: 'GHS' } },
    update: {},
    create: {
      countryCode: 'GH',
      fiatCurrency: 'GHS',
      stablecoinCode: 'CGHS',
      stablecoinIssuer: issuer,
      rampProcessorProvider: 'paystack',
      licensingStatus: LicensingStatus.UNLICENSED,
      isActive: true,
      notes: 'Proves the stable-to-stable hub-and-spoke path (CGHS <-> USDC <-> CNGN). No real GH licensing/partnership yet.',
    },
  });

  // Third corridor: KE/KES. Same hub-and-spoke path (CKES <-> USDC <-> CNGN)
  // and same issuer/Paystack processor as GH, but structurally different
  // onramp: Paystack Dedicated Virtual Accounts only support NGN/GHS
  // (confirmed against their docs), so KES onramp goes through Paystack's
  // Charge API instead (M-Pesa STK push, `mobile_money`/`provider: 'mpesa'`)
  // — see MOBILE_MONEY_ONRAMP_CURRENCIES / initiateMobileMoneyCharge in
  // PaystackRampProcessor. Offramp uses Transfers, same as NGN/GHS, via
  // 'mobile_money' recipients — https://paystack.com/blog/product/transfers-in-ke.
  // UNLICENSED, same as GH: proves the technical path, not a real KE
  // licensing/partnership.
  await prisma.corridor.upsert({
    where: { countryCode_fiatCurrency: { countryCode: 'KE', fiatCurrency: 'KES' } },
    update: {},
    create: {
      countryCode: 'KE',
      fiatCurrency: 'KES',
      stablecoinCode: 'CKES',
      stablecoinIssuer: issuer,
      rampProcessorProvider: 'paystack',
      licensingStatus: LicensingStatus.UNLICENSED,
      isActive: true,
      notes:
        'Onramp (buy) collects via M-Pesa STK push through Paystack\'s Charge API (Paystack DVAs, used for NGN/GHS onramp, don\'t support KES). Offramp (sell) uses Paystack Transfers (mobile_money/M-Pesa), same as GH. No real KE licensing/partnership.',
    },
  });

  console.log('Seeded corridor registry: NG/NGN, GH/GHS, KE/KES');

  // USDC bridge infra (Phase 1: inbound CCTP -> Stellar). Toggled by the
  // same STELLAR_NETWORK flag EvmRelayerService.isMainnet() already uses —
  // one switch controls which contract set every chain in the registry
  // gets. Mainnet addresses verified against Circle's official docs
  // (developers.circle.com/cctp/evm-smart-contracts,
  // developers.circle.com/cctp/references/stellar-contracts) — the
  // pre-existing testnet CctpForwarder address below independently matched
  // those same docs exactly, which is why the mainnet set is trusted here.
  // Re-verify both before trusting either with real funds regardless.
  const isMainnet = process.env.STELLAR_NETWORK === 'mainnet';

  // TokenMessengerV2/MessageTransmitterV2 are deployed at the same address
  // on every EVM chain CCTP supports (deterministic deployment) — Base and
  // Ethereum share both, on testnet and mainnet alike.
  const evmTokenMessengerAddress = isMainnet
    ? '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d'
    : '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA'; // Sepolia
  const evmMessageTransmitterAddress = isMainnet
    ? '0x81D40F21F12A8F0E3252Bccb954D722d4c464B64'
    : '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275'; // Sepolia

  // Payloads built once and reused as both `create` and `update` — without
  // this, re-running the seed after flipping STELLAR_NETWORK (testnet ->
  // mainnet) would silently leave already-seeded rows on their old
  // network's contract addresses, since upsert's `update` only ever ran
  // as an empty no-op before.
  const stellarChainData = {
    chainType: 'STELLAR' as const,
    cctpDomain: 27,
    // Circle's real USDC Soroban Asset Contract (SAC) address — NOT
    // USDC_ISSUER_PUBLIC_KEY (AutoRamp's own self-issued testnet stand-in
    // asset used elsewhere in the app). The CCTP TokenMessengerMinter only
    // recognizes this SAC address as burn_token; passing the classic G-address
    // issuer key fails at simulation with HostError Contract #7120
    // (TokenDecimalConfigNotSet). Deterministically derived and verified via
    // `new Asset('USDC', issuer).contractId(networkPassphrase)` — testnet
    // matches Circle's published quickstart address exactly; mainnet computed
    // from Circle's official mainnet USDC issuer (GA5ZSEJY...4K4KZVN).
    usdcAddress: isMainnet
      ? 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75'
      : 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
    tokenMessengerAddress: isMainnet
      ? 'CAE2G5Z77UP7GYPYGFOWFGW7C7J6I4YP2AFGSADRKQY62SYUFLPNFTXL'
      : 'CDNG7HXAPBWICI2E3AUBP3YZWZELJLYSB6F5CC7WLDTLTHVM74SLRTHP',
    messageTransmitterAddress: isMainnet
      ? 'CACMENFFJPJMSDAJQLX4R7K3SFZIW2LJSE3R2UMLGSWHFHS353FVXAZV'
      : 'CBJ6MTCKKZG73PMDZCJMSFRD7DQEMI4FKDH7CGDSV4W6FHCRBCQAVVJY',
    cctpForwarderAddress: isMainnet
      ? 'CBZL2IH7F6BIDAA3WBNXYKIXSATJGMSW7K5P5MJ6STX5RXN47TZJDF5T'
      : 'CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ',
    isActive: true,
  };
  await prisma.chain.upsert({
    where: { name: 'stellar' },
    update: stellarChainData,
    create: { name: 'stellar', ...stellarChainData },
  });

  const baseChainData = {
    chainType: 'EVM' as const,
    cctpDomain: 6,
    usdcAddress: isMainnet
      ? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
      : '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // Base Sepolia
    tokenMessengerAddress: evmTokenMessengerAddress,
    messageTransmitterAddress: evmMessageTransmitterAddress,
    isActive: true,
  };
  await prisma.chain.upsert({
    where: { name: 'base' },
    update: baseChainData,
    create: { name: 'base', ...baseChainData },
  });

  const ethereumChainData = {
    chainType: 'EVM' as const,
    cctpDomain: 0,
    usdcAddress: isMainnet
      ? '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
      : '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // Ethereum Sepolia
    tokenMessengerAddress: evmTokenMessengerAddress,
    messageTransmitterAddress: evmMessageTransmitterAddress,
    isActive: true,
  };
  await prisma.chain.upsert({
    where: { name: 'ethereum' },
    update: ethereumChainData,
    create: { name: 'ethereum', ...ethereumChainData },
  });

  // Second wave of EVM chains — same TokenMessengerV2/MessageTransmitterV2
  // addresses as base/ethereum (deterministic across every chain CCTP V2
  // supports — re-confirmed against developers.circle.com/cctp/
  // evm-smart-contracts while adding these). USDC addresses are each
  // chain's own official Circle-issued deployment (NOT the same across
  // chains, unlike TokenMessenger) — cross-checked against each chain's
  // own block explorer (Arbiscan/Optimistic Etherscan/PolygonScan/
  // Snowtrace), not just Circle's docs page, since that page's rendered
  // address table has been observed to scramble individual characters on
  // at least one prior lookup. Domain ids per Circle's supported-chains
  // reference: ethereum=0, avalanche=1, opMainnet=2, arbitrum=3, base=6,
  // polygonPos=7 (stellar=27, already above).
  const arbitrumChainData = {
    chainType: 'EVM' as const,
    cctpDomain: 3,
    usdcAddress: isMainnet
      ? '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
      : '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', // Arbitrum Sepolia
    tokenMessengerAddress: evmTokenMessengerAddress,
    messageTransmitterAddress: evmMessageTransmitterAddress,
    isActive: true,
  };
  await prisma.chain.upsert({
    where: { name: 'arbitrum' },
    update: arbitrumChainData,
    create: { name: 'arbitrum', ...arbitrumChainData },
  });

  const optimismChainData = {
    chainType: 'EVM' as const,
    cctpDomain: 2,
    usdcAddress: isMainnet
      ? '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85'
      : '0x5fd84259d66Cd46123540766Be93DFE6D43130D7', // OP Sepolia
    tokenMessengerAddress: evmTokenMessengerAddress,
    messageTransmitterAddress: evmMessageTransmitterAddress,
    isActive: true,
  };
  await prisma.chain.upsert({
    where: { name: 'optimism' },
    update: optimismChainData,
    create: { name: 'optimism', ...optimismChainData },
  });

  const polygonChainData = {
    chainType: 'EVM' as const,
    cctpDomain: 7,
    usdcAddress: isMainnet
      ? '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'
      : '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582', // Polygon Amoy
    tokenMessengerAddress: evmTokenMessengerAddress,
    messageTransmitterAddress: evmMessageTransmitterAddress,
    isActive: true,
  };
  await prisma.chain.upsert({
    where: { name: 'polygon' },
    update: polygonChainData,
    create: { name: 'polygon', ...polygonChainData },
  });

  const avalancheChainData = {
    chainType: 'EVM' as const,
    cctpDomain: 1,
    usdcAddress: isMainnet
      ? '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E'
      : '0x5425890298aed601595a70AB815c96711a31Bc65', // Avalanche Fuji
    tokenMessengerAddress: evmTokenMessengerAddress,
    messageTransmitterAddress: evmMessageTransmitterAddress,
    isActive: true,
  };
  await prisma.chain.upsert({
    where: { name: 'avalanche' },
    update: avalancheChainData,
    create: { name: 'avalanche', ...avalancheChainData },
  });

  console.log(
    `Seeded chain registry: stellar, base, ethereum, arbitrum, optimism, polygon, avalanche (${isMainnet ? 'MAINNET' : 'testnet'} contract addresses)`,
  );

  // Multi-stablecoin bridge-in (Swap tab, sourceTokenCode): non-USDC
  // stablecoins swapped to USDC (via 0x) ahead of the CCTP burn — see
  // ChainTokenRegistryService/ZeroXSwapQuoteService. Mainnet-only (no
  // official testnet deployment exists for most of these — nothing to
  // verify one way or the other, so skipped rather than guessed), and
  // every address+decimals pair below was read directly from the live
  // deployed contract (decimals()/symbol()/name(), via a public RPC), not
  // taken from any webpage — the strongest verification available short of
  // a manual Etherscan click-through. Only tokens genuinely pegged to a
  // real national currency and issued by a regulated, redeemable entity
  // are included — see each block's own note for why a chain was skipped.
  // byChain values are normally just the address (using the row's own
  // `decimals`) — but a chain whose deployment genuinely uses different
  // decimals (e.g. IDRT: 2 on Ethereum, 6 on Polygon — confirmed on-chain,
  // not a typo) can override with `{ address, decimals }` instead.
  const chainTokens: {
    tokenCode: string;
    decimals: number;
    fiatCurrency: string;
    byChain: Record<string, string | { address: string; decimals: number }>;
  }[] = [];

  if (isMainnet) {
    // USDT (Tether, USD) — Ethereum/Polygon/Avalanche confirmed native/
    // Tether-issued. Arbitrum, Optimism, Base skipped: third-party bridged
    // tokens explicitly disclaimed as "not issued by, redeemable by, or
    // affiliated with Tether" on their own block explorers; Arbitrum's
    // result was even ambiguous between two different tokens (legacy
    // bridged USDT vs the newer USD₮0 standard).
    chainTokens.push({
      tokenCode: 'USDT',
      decimals: 6,
      fiatCurrency: 'USD',
      byChain: {
        ethereum: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        polygon: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        avalanche: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
      },
    });

    // EURC (Circle, EUR) — MiCA-compliant, same issuer/trust tier as USDC.
    // Circle also gives EURC its own native CCTP-style burn/mint (separate
    // from USDC's) on some chains, which could make it a real second
    // currency hub later; for now it's wired in the simple way, same as
    // every other entry here — swapped to USDC via 0x ahead of the burn.
    chainTokens.push({
      tokenCode: 'EURC',
      decimals: 6,
      fiatCurrency: 'EUR',
      byChain: {
        ethereum: '0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c',
        base: '0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42',
        avalanche: '0xC891EB4cbdEFf6e073e859e987815Ed1505c2ACD',
      },
    });

    // PYUSD (Paxos, for PayPal — USD) — NYDFS-regulated. Adds USD
    // redundancy/liquidity alongside USDC/USDT, on two chains it's
    // actually deployed on.
    chainTokens.push({
      tokenCode: 'PYUSD',
      decimals: 6,
      fiatCurrency: 'USD',
      byChain: {
        ethereum: '0x6c3ea9036406852006290770BEdFcAbA0e23A0e8',
        arbitrum: '0x46850aD61C2B7d64d08c9C754F45254596696984',
      },
    });

    // GBPT (poundtoken, issued by Blackfridge SC Limited — GBP) — the
    // only credible GBP-pegged stablecoin found: Isle of Man FSA
    // regulated, monthly KPMG proof-of-reserve, redeemable 1:1 with the
    // issuer. Single issuer, single chain (Ethereum only) — more
    // concentration risk than the others, but still a real, redeemable,
    // currency-backed token, which is the bar that matters here. Its
    // on-chain symbol is actually "1GBP", not "GBPT" — that's just the
    // commonly-used ticker on exchanges; tokenCode here is deliberately
    // 'GBPT' to match how it's referred to everywhere else.
    chainTokens.push({
      tokenCode: 'GBPT',
      decimals: 18,
      fiatCurrency: 'GBP',
      byChain: { ethereum: '0x86B4dBE5D203e634a12364C0e428fa242A3FbA98' },
    });

    // ZARP (ZARP Stablecoin (Pty) Ltd / Inves Capital — ZAR, South Africa).
    // No existing AutoRamp corridor for ZAR, so no naming collision to
    // worry about — added the same way as everything else above.
    chainTokens.push({
      tokenCode: 'ZARP',
      decimals: 18,
      fiatCurrency: 'ZAR',
      byChain: {
        ethereum: '0xb755506531786C8aC63B756BaB1ac387bACB0C04',
        base: '0xb755506531786C8aC63B756BaB1ac387bACB0C04',
        polygon: '0xb755506531786C8aC63B756BaB1ac387bACB0C04',
      },
    });

    // cNGN — Africa's first regulated stablecoin (SEC/CBN-recognized),
    // issued by WrappedCBDC Ltd on behalf of the African Stablecoin
    // Consortium. IMPORTANT: this is a completely different asset from
    // AutoRamp's own 'CNGN' corridor stablecoin below (a self-issued
    // Stellar-only asset, never deployed to any EVM chain) — tokenCode is
    // deliberately 'CNGNX' here, not 'CNGN', so the two can never be
    // confused with each other in the UI or in a request payload. Also
    // note: cNGN's own docs list a "Stellar" deployment, but that's
    // actually Bantu — a separate Layer-1 blockchain (different consensus,
    // different network) that just reuses Stellar's address format. It is
    // NOT on the real Stellar network this app runs on, so there's no
    // native-Stellar row for it here.
    chainTokens.push({
      tokenCode: 'CNGNX',
      decimals: 6,
      fiatCurrency: 'NGN',
      byChain: {
        ethereum: '0x17CDB2a01e7a34CbB3DD4b83260B05d0274C8dab',
        base: '0x46C85152bFe9f96829aA94755D9f915F9B10EF5F',
        polygon: '0x52828daa48C1a9A06F37500882b42daf0bE04C3B',
      },
    });

    // BRZ (Transfero — BRL, Brazil). Ethereum has a second, older BRZ
    // contract (0x420412...be2e2b, 4 decimals, name literally "BRZ") that's
    // NOT this one — that one is a legacy/migrated contract; confirmed via
    // on-chain read that the address below is current: its name ("BRZ
    // Token") and decimals (18) match Polygon's and Base's exactly, and it
    // carries the live circulating supply.
    chainTokens.push({
      tokenCode: 'BRZ',
      decimals: 18,
      fiatCurrency: 'BRL',
      byChain: {
        ethereum: '0x01d33FD36ec67c6Ada32cf36b31e88EE190B1839',
        polygon: '0x4eD141110F6EeeAbA9A1df36d8c26f684d2475Dc',
        base: '0xE9185Ee218cae427aF7B9764A011bb89FeA761B4',
      },
    });

    // EURS (STASIS — EUR). Ethereum only found/verified.
    chainTokens.push({
      tokenCode: 'EURS',
      decimals: 2,
      fiatCurrency: 'EUR',
      byChain: { ethereum: '0xdB25f211AB05b1c97D595516F45794528a807ad8' },
    });

    // EURe (Monerium — EUR, MiCA-compliant, e-money license w/ IBAN
    // wallets). Ethereum has two addresses returning identical on-chain
    // state (same totalSupply) — used the one whose name ("Monerium EURe")
    // matches Arbitrum's and Polygon's exactly, for cross-chain consistency.
    chainTokens.push({
      tokenCode: 'EURE',
      decimals: 18,
      fiatCurrency: 'EUR',
      byChain: {
        ethereum: '0x39b8B6385416f4cA36a20319F70D28621895279D',
        arbitrum: '0x0c06cCF38114ddfc35e07427B9424adcca9F44F8',
        polygon: '0xE0aEa583266584DafBB3f9C3211d5588c73fEa8d',
      },
    });

    // XSGD (StraitsX — SGD, Singapore). Polygon address is StraitsX's own
    // documented "native" one — a separate bridged XSGD address exists on
    // Polygon too but StraitsX's own support docs explicitly say that one
    // isn't supported by them, so it's excluded here.
    chainTokens.push({
      tokenCode: 'XSGD',
      decimals: 6,
      fiatCurrency: 'SGD',
      byChain: {
        ethereum: '0x70e8dE73cE538DA2bEEd35d14187F6959a8ecA96',
        polygon: '0xDC3326e71D45186F113a2F448984CA0e8D201995',
      },
    });

    // IDRT (Rupiah Token, PT Rupiah Token Indonesia — IDR). Decimals differ
    // per chain (2 on Ethereum, 6 on Polygon) — confirmed on-chain, not a
    // typo, hence the explicit per-chain override on Polygon below.
    chainTokens.push({
      tokenCode: 'IDRT',
      decimals: 2,
      fiatCurrency: 'IDR',
      byChain: {
        ethereum: '0x998FFE1E43fAcffb941dc337dD0468d52bA5b48A',
        polygon: { address: '0x554cd6bdD03214b10AafA3e0D4D42De0C5D2937b', decimals: 6 },
      },
    });

    // USDP (Paxos — USD, "Pax Dollar").
    chainTokens.push({
      tokenCode: 'USDP',
      decimals: 18,
      fiatCurrency: 'USD',
      byChain: { ethereum: '0x8E870D67F660D95d5be530380D0eC0bd388289E1' },
    });

    // GUSD (Gemini — USD, NYDFS-regulated).
    chainTokens.push({
      tokenCode: 'GUSD',
      decimals: 2,
      fiatCurrency: 'USD',
      byChain: { ethereum: '0x056Fd409E1d7A124BD7017459dFEa2F387b6d5Cd' },
    });

    // RLUSD (Ripple, via Standard Custody & Trust Company — USD). NOTE: a
    // second "RLUSD" contract exists on Ethereum (0x708D237...C0B70) with a
    // supply of exactly 420.69 (padded with zeros) — an unmistakable
    // meme-number pattern, not a real reserve figure. That one is very
    // likely an impersonation/scam token, not Ripple's; excluded. The
    // address below is the one with a realistic ~1B supply and the name
    // literally "RLUSD" (not a copycat name).
    chainTokens.push({
      tokenCode: 'RLUSD',
      decimals: 18,
      fiatCurrency: 'USD',
      byChain: { ethereum: '0x8292Bb45bf1Ee4d140127049757C2E0fF06317eD' },
    });

    // USD1 (World Liberty Financial, custodied by BitGo — USD).
    chainTokens.push({
      tokenCode: 'USD1',
      decimals: 18,
      fiatCurrency: 'USD',
      byChain: { ethereum: '0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d' },
    });

    // MXNB (Bitso/Juno — MXN, Mexico) — Arbitrum-native.
    chainTokens.push({
      tokenCode: 'MXNB',
      decimals: 6,
      fiatCurrency: 'MXN',
      byChain: { arbitrum: '0xF197FFC28c23E0309B5559e7a166f2c6164C80aA' },
    });

    // GYEN (GMO-Z.com Trust Company — JPY, Japan, NYDFS-regulated).
    chainTokens.push({
      tokenCode: 'GYEN',
      decimals: 6,
      fiatCurrency: 'JPY',
      byChain: { ethereum: '0xC08512927D12348F6620a698105e1BAac6EcD911' },
    });

    // TRYB (BiLira — TRY, Turkey).
    chainTokens.push({
      tokenCode: 'TRYB',
      decimals: 6,
      fiatCurrency: 'TRY',
      byChain: {
        ethereum: '0x2C537E5624e4af88A7ae4060C022609376C8D0EB',
        polygon: '0x4Fb71290Ac171E1d144F7221D882BECAc7196EB5',
      },
    });

    // TrueUSD (TUSD) deliberately excluded despite a real, verifiable
    // Ethereum contract: its issuers (Archblock/TrustToken/TrueCoin) filed
    // for Chapter 11 bankruptcy in March 2026 after a $456M reserve
    // shortfall and fraud allegations came to light — fails the
    // "genuinely redeemable, regulated" bar every other token here meets,
    // regardless of the contract itself being real.
  }

  if (chainTokens.length > 0) {
    const seeded: string[] = [];
    for (const { tokenCode, decimals: defaultDecimals, fiatCurrency, byChain } of chainTokens) {
      for (const [chainName, entry] of Object.entries(byChain)) {
        const address = typeof entry === 'string' ? entry : entry.address;
        const decimals = typeof entry === 'string' ? defaultDecimals : entry.decimals;
        const chain: Chain | null = await prisma.chain.findUnique({ where: { name: chainName } });
        if (!chain) continue;
        await prisma.chainToken.upsert({
          where: { chainId_tokenCode: { chainId: chain.id, tokenCode } },
          update: { address, decimals, fiatCurrency, isActive: true },
          create: { chainId: chain.id, tokenCode, address, decimals, fiatCurrency, isActive: true },
        });
        seeded.push(`${tokenCode}@${chainName}`);
      }
    }
    console.log(`Seeded chain tokens (mainnet only): ${seeded.join(', ')}`);
  } else {
    console.log('Skipped chain token seeding: no verified testnet deployments to seed');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
