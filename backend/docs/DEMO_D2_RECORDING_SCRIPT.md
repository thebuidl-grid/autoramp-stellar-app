# AutoRamp — Deliverable 2 Recording Script & Walkthrough

**Title:** Cross-Chain USDC Deposit Route (Base → Stellar) Feeding the Off-Ramp  
**Deliverable:** D2 — Stellar Community Fund (SCF) Instaward  
**Target Duration:** 4 to 6 minutes (Scripted runtime: ~5 minutes 15 seconds)  
**Networks:** Base Sepolia (Source EVM) → Stellar Testnet (Destination Rail)  
**Bridging Protocol:** Circle CCTP v2 (Cross-Chain Transfer Protocol via Circle BridgeKit)  
**Off-Ramp Provider:** Bitnob Sandbox (Simulated NGN Payout)  

---

## Technical Context & D2 SOW Verification Checklist

| SOW Requirement | Implementation in AutoRamp | Verified In Scene |
|---|---|---|
| **Cross-Chain USDC Deposit Route** | Native Base Sepolia → Stellar Testnet route via Circle CCTP v2 (`TokenMessengerV2` burn on Base, Circle Orbit relayer / `CctpForwarder` mint on Stellar). | Scenes 2, 3, 5 |
| **Real-time Deposit Detection** | Pre-execution record created via `POST /bridge/initiate`, source burn tx hash captured via `POST /bridge/update-hash` (`SOURCE_TX`), immediate balance detection. | Scenes 3, 4 |
| **Dual-Chain Status Tracking** | UI step tracker & persistent backend models track Base source tx (`sepolia.basescan.org`), Circle Iris attestation, and Stellar mint tx (`stellar.expert`). | Scenes 3, 4, 5 |
| **Delayed & Stuck Transfer Handling** | `BridgeReconciliationService` monitors in-flight transfers: marks `DELAYED` (after 15m), `STUCK` (after 60m), and holds off-ramp order expiry until resolved or recovered. | Scene 6 |
| **Feeding into Existing Off-Ramp** | Bridge transfer links `offrampReference`. Upon Stellar USDC delivery (`DESTINATION_TX` / `/bridge/delivery`), funding is confirmed and off-ramp auto-progresses to simulated fiat payout. | Scene 6, 7 |
| **Structured Reconciliation Logging** | Full transaction lifecycle persisted in PostgreSQL (`BridgeTransaction`, `OfframpProviderOrder`, `TransactionLog`), verifiable in UI `/history` JSON accordion. | Scene 7 |

---

## Scene-by-Scene Recording Script

### Scene 1: Introduction (0:00 to 0:35 — ~35s)

- **Screen:** AutoRamp homepage (`http://localhost:3000`) with hero section: *"Move money between crypto and your bank"*. The swap/ramp card is centered and visible.
- **Do:**
  1. Hover cursor smoothly over the AutoRamp navigation and tab bar (showing **Buy**, **Sell**, **Swap**, and **Bridge** tabs).
  2. Bring cursor to rest over the **Bridge** tab.
- **Say:**
  > "Hello, and welcome to this demonstration of Deliverable 2 for the AutoRamp Stellar Community Fund Instaward.
  >
  > The objective of Deliverable 2 is to enable users to deposit USDC from a non-Stellar blockchain into AutoRamp's existing Stellar-based off-ramp.
  >
  > For this demonstration, we are using Base as our source network and Stellar as the destination network, connected through Circle's Cross-Chain Transfer Protocol.
  >
  > Over the next few minutes, I will demonstrate the cross-chain deposit from Base, real-time transaction tracking across both chains, arrival on Stellar testnet, our automated handling of delayed or stuck transfers, and the seamless completion of the simulated fiat payout."
- **SSML (for ElevenLabs):**
  ```text
  Hello, and welcome to this demonstration of Deliverable 2 for the AutoRamp Stellar Community Fund Instaward. <break time="0.7s" /> The objective of Deliverable 2 is to enable users to deposit USDC from a non-Stellar blockchain into AutoRamp's existing Stellar-based off-ramp. <break time="0.8s" /> For this demonstration, we are using Base as our source network and Stellar as the destination network, connected through Circle's Cross-Chain Transfer Protocol. <break time="0.8s" /> Over the next few minutes, I will demonstrate the cross-chain deposit from Base, real-time transaction tracking across both chains, arrival on Stellar testnet, our automated handling of delayed or stuck transfers, and the seamless completion of the simulated fiat payout.
  ```

---

### Scene 2: Source Network & Wallet Balance on Base (0:35 to 1:15 — ~40s)

- **Screen:** AutoRamp homepage with wallet connected to **Base Sepolia**.
- **Do:**
  1. Click or highlight the wallet connection badge in the top right corner.
  2. Show that the wallet is connected to **Base Sepolia** (Chain ID: `84532`).
  3. Click on the **Bridge** tab on the main card.
  4. Point out the available USDC balance on Base Sepolia (e.g. `10.00 USDC` or `25.00 USDC`).
- **Say:**
  > "Starting on the dashboard, I have connected my EVM wallet to Base Sepolia, where our USDC deposit originates.
  >
  > In the interface, we can see the active network is Base, along with our available testnet USDC balance.
  >
  > AutoRamp uses this cross-chain deposit route to allow users holding USDC on Base to seamlessly fund a cash-out into local fiat banking rails, without requiring manual bridging or separate decentralized exchange hops."
- **SSML (for ElevenLabs):**
  ```text
  Starting on the dashboard, <break time="0.4s" /> I have connected my EVM wallet to Base Sepolia, where our USDC deposit originates. <break time="0.7s" /> In the interface, we can see the active network is Base, along with our available testnet USDC balance. <break time="0.7s" /> AutoRamp uses this cross-chain deposit route to allow users holding USDC on Base to seamlessly fund a cash-out into local fiat banking rails, <break time="0.4s" /> without requiring manual bridging or separate decentralized exchange hops.
  ```

---

### Scene 3: Initiate the Cross-Chain Deposit (1:15 to 2:05 — ~50s)

- **Screen:** AutoRamp **Bridge** interface.
- **Do:**
  1. In the **Bridge From** field, confirm **Base Sepolia** is selected.
  2. In the **Bridge To** field, select **Stellar Testnet**.
  3. Enter the deposit amount: **`5.00 USDC`**.
  4. Ensure the destination Stellar address is populated (AutoRamp's designated off-ramp funding address or user's Stellar testnet wallet).
  5. Click the **BRIDGE** button.
  6. Trigger the wallet signature: approve ERC-20 allowance and confirm the `depositForBurn` transaction.
  7. AutoRamp transitions to the **Processing Transaction** state, displaying the unique transfer reference (`BRG-...`) and the Base source transaction hash.
- **Say:**
  > "I will now initiate a deposit of 5 USDC from Base Sepolia into AutoRamp, destined for Stellar.
  >
  > In the background, AutoRamp creates a tracking record via our backend bridge service, linking this deposit leg directly to our off-ramp state machine.
  >
  > Upon wallet confirmation, our client-side BridgeKit adapter submits the deposit-for-burn transaction to Circle's TokenMessenger contract on Base.
  >
  > The application immediately detects the transaction, displays our unique bridge reference, and begins active multi-chain tracking."
- **SSML (for ElevenLabs):**
  ```text
  I will now initiate a deposit of 5 USDC from Base Sepolia into AutoRamp, destined for Stellar. <break time="0.6s" /> In the background, AutoRamp creates a tracking record via our backend bridge service, linking this deposit leg directly to our off-ramp state machine. <break time="0.7s" /> Upon wallet confirmation, our client-side BridgeKit adapter submits the deposit-for-burn transaction to Circle's TokenMessenger contract on Base. <break time="0.7s" /> The application immediately detects the transaction, displays our unique bridge reference, and begins active multi-chain tracking.
  ```

---

### Scene 4: Prove the Base Transaction On-Chain (2:05 to 2:50 — ~45s)

- **Screen:** BaseScan Testnet Block Explorer (`https://sepolia.basescan.org/tx/...`).
- **Do:**
  1. Click **View on Explorer** next to the Source Transaction on AutoRamp, opening BaseScan in a new tab.
  2. Highlight the **Transaction Status** (`Success`).
  3. Highlight the **From** (connected wallet) and **To** (`TokenMessengerV2` contract).
  4. Highlight the ERC-20 token transfer: **5 USDC burned / transferred** for cross-chain relay.
  5. Keep the transaction hash clearly visible on screen for reviewer verification.
- **Say:**
  > "Here is the source transaction on BaseScan.
  >
  > The block explorer provides independent, verifiable on-chain proof of the deposit leaving Base.
  >
  > We can see the transaction status is Success, confirming the exact amount of 5 USDC was deposited into Circle's TokenMessenger contract.
  >
  > This satisfies the first half of our cross-chain evidence, giving reviewers a cryptographic record of the funds leaving the source network."
- **SSML (for ElevenLabs):**
  ```text
  Here is the source transaction on BaseScan. <break time="0.6s" /> The block explorer provides independent, verifiable on-chain proof of the deposit leaving Base. <break time="0.7s" /> We can see the transaction status is Success, confirming the exact amount of 5 USDC was deposited into Circle's TokenMessenger contract. <break time="0.7s" /> This satisfies the first half of our cross-chain evidence, giving reviewers a cryptographic record of the funds leaving the source network.
  ```

---

### Scene 5: Track Bridge Progress & Prove Stellar Arrival (2:50 to 3:50 — ~60s)

- **Screen:** AutoRamp live tracking view, then switch to Stellar Expert (`https://stellar.expert/explorer/testnet/tx/...`).
- **Do:**
  1. Switch back to the AutoRamp tab.
  2. Point out the three visual status steps:
     - **Bridge Initiated** (Green checkmark — transaction confirmed on Base).
     - **Circle Attestation** (Pulse indicator / checkmark — Circle Iris attestation verified).
     - **Destination Mint** (Green checkmark — Stellar mint completed via CCTP Orbit relayer).
  3. Click the Stellar destination transaction link to open **Stellar Expert**.
  4. On Stellar Expert, highlight:
     - Transaction Status: `Successful`.
     - Asset: `USDC` issued by the official testnet issuer.
     - Operation: Payment / Mint of `5.0000000 USDC` to the destination funding address.
- **Say:**
  > "Returning to AutoRamp, the application tracks the lifecycle across both chains in real time.
  >
  > As Circle attests the burn event, AutoRamp updates the progress state through attestation and final destination minting on Stellar.
  >
  > Because Circle CCTP v2 supports Stellar via Circle's Orbit relayer, the destination mint is executed cleanly without requiring user gas on Stellar.
  >
  > Opening the destination link on Stellar Expert, we see the corresponding Stellar testnet transaction. Five USDC has landed on Stellar testnet.
  >
  > Combined with our Base transaction, this proves end-to-end cross-chain asset movement between Base and Stellar."
- **SSML (for ElevenLabs):**
  ```text
  Returning to AutoRamp, <break time="0.4s" /> the application tracks the lifecycle across both chains in real time. <break time="0.7s" /> As Circle attests the burn event, AutoRamp updates the progress state through attestation and final destination minting on Stellar. <break time="0.7s" /> Because Circle CCTP v2 supports Stellar via Circle's Orbit relayer, the destination mint is executed cleanly without requiring user gas on Stellar. <break time="0.8s" /> Opening the destination link on Stellar Expert, we see the corresponding Stellar testnet transaction. Five USDC has landed on Stellar testnet. <break time="0.7s" /> Combined with our Base transaction, this proves end-to-end cross-chain asset movement between Base and Stellar.
  ```

---

### Scene 6: Complete the Off-Ramp & Handle Delayed/Stuck Paths (3:50 to 4:55 — ~65s)

- **Screen:** AutoRamp Off-Ramp settlement confirmation screen, followed by terminal `COMPLETED` state.
- **Do:**
  1. Show that the detected Stellar USDC deposit automatically feeds into the linked off-ramp order (`offrampReference`).
  2. Show the conversion rate (USDC to NGN) and the destination bank details (e.g. Access Bank, Account `0690000031`).
  3. Show the off-ramp status transitioning from `PENDING` to `PROCESSING` to `COMPLETED`.
  4. Explain the delayed/stuck mitigation on screen (show a diagram or callout to `BridgeReconciliationService`).
- **Say:**
  > "Once the USDC arrives on Stellar, AutoRamp automatically feeds the deposit into our existing off-ramp flow.
  >
  > The payout order, which was linked during initiation, recognizes the funding transaction and advances to Processing. The simulated fiat transfer settles directly into the beneficiary's Nigerian bank account, reaching Completed.
  >
  > Crucially, Deliverable 2 also requires handling delayed or stuck cross-chain transfers.
  >
  > AutoRamp includes an active Bridge Reconciliation Service. If network congestion delays Circle attestation past fifteen minutes, the transfer is marked Delayed; if stalled past one hour, it is flagged as Stuck.
  >
  > Most importantly, the reconciliation service automatically holds the off-ramp payout funding window open, preventing orders from prematurely expiring while funds are in-flight. When the destination mint eventually confirms, the system recovers cleanly and completes payout."
- **SSML (for ElevenLabs):**
  ```text
  Once the USDC arrives on Stellar, <break time="0.4s" /> AutoRamp automatically feeds the deposit into our existing off-ramp flow. <break time="0.7s" /> The payout order, which was linked during initiation, recognizes the funding transaction and advances to Processing. The simulated fiat transfer settles directly into the beneficiary's Nigerian bank account, reaching Completed. <break time="0.8s" /> Crucially, Deliverable 2 also requires handling delayed or stuck cross-chain transfers. <break time="0.7s" /> AutoRamp includes an active Bridge Reconciliation Service. If network congestion delays Circle attestation past fifteen minutes, the transfer is marked Delayed; if stalled past one hour, it is flagged as Stuck. <break time="0.8s" /> Most importantly, the reconciliation service automatically holds the off-ramp payout funding window open, preventing orders from prematurely expiring while funds are in-flight. <break time="0.6s" /> When the destination mint eventually confirms, the system recovers cleanly and completes payout.
  ```

---

### Scene 7: History, Structured Logs & Closing (4:55 to 5:30 — ~35s)

- **Screen:** AutoRamp `/history` page.
- **Do:**
  1. Navigate to `/history`.
  2. Click the completed cross-chain off-ramp accordion to expand it.
  3. Highlight:
     - Status: `COMPLETED` (green badge).
     - Network: `Base → Stellar`.
     - Base Burn Tx Hash link (`sepolia.basescan.org`).
     - Stellar Mint Tx Hash link (`stellar.expert`).
     - Bank Name, Account Number, and Account Name.
     - Expand the **Reconciliation Record & Structured Logs** JSON block showing matching Expected vs. Received USDC, zero variance, trace IDs, and BullMQ worker queue traces.
- **Say:**
  > "Finally, visiting our Transaction History page, we see the full persistent audit record.
  >
  > The accordion surfaces both verified explorer links: the source burn on Base and the destination mint on Stellar, alongside the beneficiary bank details and complete JSON reconciliation logs.
  >
  > This confirms the successful delivery of Deliverable 2: a hardened, multi-chain USDC deposit route from Base into Stellar, complete with dual-chain status tracking, robust delayed transfer handling, and automated off-ramp settlement.
  >
  > Thank you for reviewing AutoRamp's Stellar Community Fund demonstration!"
- **SSML (for ElevenLabs):**
  ```text
  Finally, visiting our Transaction History page, <break time="0.4s" /> we see the full persistent audit record. <break time="0.7s" /> The accordion surfaces both verified explorer links: the source burn on Base and the destination mint on Stellar, <break time="0.4s" /> alongside the beneficiary bank details and complete JSON reconciliation logs. <break time="0.8s" /> This confirms the successful delivery of Deliverable 2: a hardened, multi-chain USDC deposit route from Base into Stellar, complete with dual-chain status tracking, robust delayed transfer handling, and automated off-ramp settlement. <break time="0.8s" /> Thank you for reviewing AutoRamp's Stellar Community Fund demonstration!
  ```

---

## Technical Appendix: Summary of Verified Testnet Proofs

| Parameter | Base Sepolia (Source) | Stellar Testnet (Destination) |
|---|---|---|
| **Network** | Base Sepolia (`84532`) | Stellar Testnet |
| **Asset** | USDC (`0x036CbD53842c5426634e7929541eC2318f3dCF7e`) | USDC (`GAWG4HZAXIJEFSGKM7WIZLZIGL44Z6OCMNBHTQ3DGA3JBH2EGL2HTWTU`) |
| **Relay Method** | Circle CCTP v2 `depositForBurn` | Circle Orbit Relayer / `CctpForwarder` mint |
| **Explorer** | [BaseScan Sepolia Explorer](https://sepolia.basescan.org) | [Stellar Expert Testnet Explorer](https://stellar.expert/explorer/testnet) |
| **Backend State Machine** | `POST /bridge/initiate` → `POST /bridge/update-hash` | `POST /bridge/delivery` → `OfframpProviderOrder.bridgeStatus = SUCCESS` |
| **Failure Protection** | `BridgeReconciliationService`: `DELAYED` (15m), `STUCK` (60m) | Expiry hold prevents off-ramp timeout while CCTP transfer is in-flight |
