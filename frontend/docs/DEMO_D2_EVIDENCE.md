# Deliverable 2 — on-chain evidence (Base Sepolia ⇄ Stellar testnet, Circle CCTP v2)

All four transactions below are **real testnet transactions**, driven from the AutoRamp UI and recorded in
`docs/autoramp_d2_full_demo.mp4` (and, per leg, `autoramp_d2_crosschain_offramp_demo.mp4` /
`autoramp_d2_stellar_to_base_demo.mp4`). The AutoRamp backend records were created through the live API
(`api-autoramp.thebuidl.xyz`) and are listed in the app's History tab as **Bridge** transactions.

| Leg | Step | Transaction | Explorer |
|---|---|---|---|
| **Base Sepolia → Stellar** (2 USDC) | Burn on Base (`depositForBurnWithHook`, domain 27) | `0x4266ef56a833f4df90a5731326e2c018b0c1fc5855b9e4f422d2d2fe16c5e301` (block 57118237) | https://sepolia.basescan.org/tx/0x4266ef56a833f4df90a5731326e2c018b0c1fc5855b9e4f422d2d2fe16c5e301 |
| | Mint on Stellar (`mint_and_forward`) | `b43391d68d3a6ea1073be895f4d1594fae50f6aed6f676c954b289759e5b1a4e` (ledger 5664379) | https://stellar.expert/explorer/testnet/tx/b43391d68d3a6ea1073be895f4d1594fae50f6aed6f676c954b289759e5b1a4e |
| **Stellar → Base Sepolia** (1 USDC) | Burn on Stellar (`deposit_for_burn`) | `b75422385c0f2f12f4be2954f60775fbbfefb7f8d50a0ebee462ffd9c2cc935b` (ledger 5664423) | https://stellar.expert/explorer/testnet/tx/b75422385c0f2f12f4be2954f60775fbbfefb7f8d50a0ebee462ffd9c2cc935b |
| | Mint on Base (`receiveMessage`) | `0xc788e54a29dba0a6bdbe113d15db2d843f9ba270694c94e8c02e1caac33066ab` (block 57119514) | https://sepolia.basescan.org/tx/0xc788e54a29dba0a6bdbe113d15db2d843f9ba270694c94e8c02e1caac33066ab |

- AutoRamp bridge references (live API): `BRG-1794345504873-qrn1v8` (Base → Stellar) and `BRG-1794345748926-2bzf4o` (Stellar → Base), both `COMPLETED`.
- Demo wallets (throwaway testnet): EVM `0x6d07c4f69578DF665b21d1296aF2D3D482F4D819`, Stellar `GAPF7GOEVDR7BOQVBSJNKLDECIYZ2HGHOUFLV5QSW6UB7THKESPYEDR5` (Circle testnet USDC, issuer `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`).
- Circle Stellar CCTP: domain 27; testnet `CctpForwarder` `CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ`; testnet `TokenMessengerMinter` `CDNG7HXAPBWICI2E3AUBP3YZWZELJLYSB6F5CC7WLDTLTHVM74SLRTHP`.
- Note: `@circle-fin/bridge-kit` (≤ 1.17.1) has no Stellar chain, so both directions run CCTP v2 directly
  (`lib/cctp-stellar*.ts`, `app/api/bridge/stellar-relay`, `app/api/bridge/attestation`). The simulated fiat payout is not part of this recording.

## Re-recording
1. `wallet.json` (EVM + Stellar keys) outside the repo, e.g. `~/.config/autoramp-demo/wallet.json`; fund the EVM address with Base Sepolia ETH + USDC.
2. `DEMO_WALLET_FILE=… node scripts/demo-wallet-server.mjs`
3. Production build pointed at the live API: `NEXT_PUBLIC_API_URL=https://api-autoramp.thebuidl.xyz NEXT_PUBLIC_NETWORK=testnet npm run build`, then `STELLAR_RELAYER_SECRET=… npm start`.
4. `AUTORAMP_TOKEN=… DEMO_WALLET_FILE=… python3 scripts/record_d2_real.py --api real --legs in` then `--legs out`.
5. `python3 scripts/generate_voiceover_d2.py --force` (free Nigerian Edge voice), then `python3 scripts/stitch_d2_real.py --legs in|out|full`.
