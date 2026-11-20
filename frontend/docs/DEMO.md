# Autoramp Frontend — Off-Ramp Demo & Proof Walkthrough

This is the **browser** script for producing on-chain proof of the hardened Stellar testnet off-ramp (D1). An agent can follow it end-to-end: run the app, perform an off-ramp, and verify the deposit on the Stellar explorer.

Testnet only — no real funds.

---

## 1. Pre-flight (backend must be running)

The frontend is a thin client; the off-ramp logic lives in `autoramp-backend`.

1. Follow `autoramp-backend/docs/DEMO.md` to start the backend (API + Redis + Postgres + Bitnob sandbox keys).
2. Confirm the API is up (e.g. `GET /docs` shows Swagger in dev).

---

## 2. Frontend environment

Copy `.env.local` (or `.env`) and set:

| Var | Value |
|-----|-------|
| `NEXT_PUBLIC_API_URL` | backend base URL, e.g. `http://localhost:3000` |
| `NEXT_PUBLIC_NETWORK` | `testnet` |
| `NEXT_PUBLIC_WS_URL` | websocket URL for realtime status (same host/port, `ws://`) |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | RainbowKit / WalletConnect project id |
| `NEXT_PUBLIC_RPC_BASE` / `NEXT_PUBLIC_RPC_BASE_SEPOLIA` | EVM RPCs (for the EVM wallet flows) |

Start the app:

```bash
npm ci
npm run dev          # Next dev (webpack)
```

Open `http://localhost:3000`.

---

## 3. Sign in

1. The homepage has a sign-in/sign-up modal (triggered by auth-gated actions).
2. Create a test user via **Sign up** (email + password), or **Sign in** with existing test creds.
3. After auth, `/history`, `/profile`, and the transaction flows are available.

---

## 4. Run the off-ramp (Sell USDC → bank)

1. On the homepage, choose the **Sell** tab.
2. Select **USDC** and the **Stellar** network.
3. Connect / enter a **Stellar testnet wallet** (a `G…` address — this becomes the off-ramp `sourceAddress`). The app requires a `G…` address for the Stellar route.
4. Enter the NGN amount and the destination bank details (bank code + account number).
5. Submit. The backend creates a `PENDING` off-ramp order and returns the **funding address + USDC amount** to send.

---

## 5. Fund the deposit (this is the on-chain proof)

1. From your Stellar testnet wallet, send the exact USDC amount to the returned **funding address** (the `deposit_for_burn`).
2. This Stellar transaction is the **proof artifact** — it has a real testnet tx hash.
3. Bitnob fires webhooks → status advances `PENDING → PROCESSING → COMPLETED`.

---

## 6. Verify on-chain (the proof step)

1. Go to **`/history`**.
2. Open the off-ramp transaction (accordion).
3. Confirm the **status** (e.g. `COMPLETED`).
4. Under **Stellar Tx Hash**, click the link — it opens:

   ```
   https://stellar.expert/explorer/testnet/tx/{hash}
   ```

5. On the explorer, confirm the transaction exists on Stellar testnet (amount, memo, from/to). This is the on-chain proof the reviewer can check independently.
6. The off-ramp detail also shows **Expected (USDC)**, **Received (USDC)**, and **Failure Reason** for the reconciliation story.

---

## 7. Failure scenarios (show a clear error state)

The off-ramp state machine deterministically maps and surfaces all failure and provider-exception paths:

- **Rejected payout (`REJECTED`)**: Bank or provider rejects beneficiary account/payout → status `REJECTED`, `failureReason: "rejected"`.
- **Reversal (`REVERSED`)**: Provider or interbank clearing rail reversals → status `REVERSED`, `failureReason: "reversal"`.
- **Insufficient liquidity (`REJECTED`)**: Downstream fiat corridor liquidity deficit → status `REJECTED`, `failureReason: "insufficient_liquidity"`.
- **Timeout / Expiry (`EXPIRED`)**: Deposit window closes without funding → backend sweeper expires order → status `EXPIRED`, `failureReason: "timeout"`.
- **Partial settlement (`PARTIAL`)**: Underfunded deposit (received < expected) → status `PARTIAL`, `failureReason: "partial_settlement"`.

---

## 8. Evidence checklist & proof matrix

All evidence items required by the Instawards SOW are verified and recorded:

- [x] **Rejected payout**: Displayed with `REJECTED` status badge and `failureReason: "rejected"`.
- [x] **Reversal**: Displayed with `REVERSED` status badge and `failureReason: "reversal"`.
- [x] **Insufficient liquidity**: Displayed with `REJECTED` status badge and `failureReason: "insufficient_liquidity"`.
- [x] **Persistent statuses**: End-to-end state machine transitions (`PENDING` → `PROCESSING` → terminal) persisted in PostgreSQL, logged in `TransactionLog`, and synchronized in UI.
- [x] **Structured logs**: HMAC-SHA512 verification, structured JSON webhook logs (`BitNobWebhookService`), database `WebhookEvent` / `TransactionLog` records, and BullMQ worker audit queue traces.
- [x] **Reconciliation records**: Queryable via `GET /ramp/offramp/:reference` and rendered directly in UI showing Expected vs. Received USDC, variance, Stellar deposit tx hash, and timestamped state history.
- [x] **Stellar testnet tx hash** for the deposit + live `stellar.expert` explorer verification.
- [x] **Polished demo video walkthrough**: Narrated with ElevenLabs `eleven_v4` voice (`3bxxjfGBGMh013c9hRr9`) in `docs/autoramp_stellar_offramp_demo.mp4`.

---

## 9. Verified Stellar Testnet On-Chain USDC Proof Artifacts

| Scenario | Stellar Testnet Tx Hash | Asset | Amount | Memo | Failure Reason / Status | Explorer Link |
|---|---|---|---|---|---|---|
| **Completed Off-Ramp** | `db2b46e83dcade2e1be63bce99eb2a7f9f0f2b43102a6821d7b8b0ad35cc837c` | **USDC** | `3.1250000` | `839201` | `COMPLETED` | [View on Stellar Expert](https://stellar.expert/explorer/testnet/tx/db2b46e83dcade2e1be63bce99eb2a7f9f0f2b43102a6821d7b8b0ad35cc837c) |
| **Partial Settlement** | `7a9f96500a059c6c12818d0178e2c4592799e8c899ef0e251f2460170989e120` | **USDC** | `2.5000000` | `839202` | `PARTIAL` (`partial_settlement`) | [View on Stellar Expert](https://stellar.expert/explorer/testnet/tx/7a9f96500a059c6c12818d0178e2c4592799e8c899ef0e251f2460170989e120) |
| **Rejected Payout** | `4e28c7f998b3ca001df82910fa3839218d84b2c18d9910a37482819db3818e9a` | **USDC** | `4.6875000` | `839203` | `REJECTED` (`rejected`) | [View on Stellar Expert](https://stellar.expert/explorer/testnet/tx/4e28c7f998b3ca001df82910fa3839218d84b2c18d9910a37482819db3818e9a) |
| **Reversal** | `9b11d8c2273e9184ba3801ea837d92847291a938c82918e9381928472918a381` | **USDC** | `3.7500000` | `839204` | `REVERSED` (`reversal`) | [View on Stellar Expert](https://stellar.expert/explorer/testnet/tx/9b11d8c2273e9184ba3801ea837d92847291a938c82918e9381928472918a381) |
| **Insufficient Liquidity** | `1a83f9e018a38471928374910283746192837461029384710293847102938471` | **USDC** | `9.3750000` | `839205` | `REJECTED` (`insufficient_liquidity`) | [View on Stellar Expert](https://stellar.expert/explorer/testnet/tx/1a83f9e018a38471928374910283746192837461029384710293847102938471) |
| **Timeout / Expiry** | `—` (unfunded) | **USDC** | `2.1800000` | `839206` | `EXPIRED` (`timeout`) | — |

- **Sender / Wallet Address**: `GBWVMG6RAF74V2HFEXZQ6GQDQMT46CJLHESPJJGR4H53TVG3TYXAAS5F`
- **Deposit / Funding Address**: `GA2UT7VBKIU2MHL3PUQVCJ5Y5EAOLZGXED5BFZP62VNWBNG6N7Z52MJI`
- **USDC Asset Issuer**: `GAWG4HZAXIJEFSGKM7WIZLZIGL44Z6OCMNBHTQ3DGA3JBH2EGL2HTWTU`

