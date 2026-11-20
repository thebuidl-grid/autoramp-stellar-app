# AutoRamp — Deliverable 2 Recording Script

**Target duration:** 4 to 6 minutes  
**Networks:** Base (source) → Stellar (destination)  
**Deliverable:** Stellar Community Fund Instaward — Deliverable 2

---

## Scene 1 — Introduction (0:00–0:30)

**Screen:** AutoRamp homepage or application dashboard

**Show:**
- AutoRamp dashboard/homepage

**Say:**
> "Hello, this is a demonstration of Deliverable 2 of the AutoRamp Stellar Community Fund Instaward.
>
> The objective is to enable users to deposit USDC from a non-Stellar blockchain into AutoRamp's existing Stellar-based off-ramp.
>
> For this demonstration, we are using Base as the source network and Stellar as the destination network.
>
> I will demonstrate the deposit, cross-chain transfer, transaction tracking, arrival on Stellar, and completion of the simulated fiat payout."

---

## Scene 2 — Source network and USDC balance (0:30–1:00)

**Screen:** Wallet connected to Base, showing USDC balance

**Show:**
- A connected wallet on Base (new test wallet)
- The Base network
- Available USDC balance (funded for testing)
- The AutoRamp deposit/bridge flow

**Say:**
> "A new wallet is connected on Base, where the USDC deposit originates.
>
> The wallet is funded with test USDC, and the available USDC balance is visible on the Base network.
>
> AutoRamp uses this cross-chain route to bring USDC from Base into the Stellar ecosystem, where the existing off-ramp process handles the payout."

---

## Scene 3 — Cross-chain deposit tracking (1:00–2:00)

**Screen:** AutoRamp deposit interface and transaction tracking state

**Show:**
- USDC deposit details (amount and destination) displayed in AutoRamp
- Transaction processing/tracking state from the source network
- Base transaction hash once it appears

**Say:**
> "This screen shows a USDC deposit from Base into AutoRamp.
>
> The amount and destination details are displayed, and the application begins tracking the transaction from the source network. This visibility is important because users need to see the movement of funds before they arrive on Stellar.
>
> AutoRamp records the transaction and monitors its progress through the bridge, and the Base transaction hash is shown for verification."

---

## Scene 4 — Prove the Base transaction (2:00–2:40)

**Screen:** Base block explorer

**Show:**
- The Base transaction hash
- Transaction status
- Token transfer and amount

**Say:**
> "This is the source transaction on Base. The block explorer provides independent verification of the transaction, including its status and the USDC transfer.
>
> This gives reviewers a verifiable record of the funds leaving the source network."

---

## Scene 5 — Bridge tracking and Stellar arrival (2:40–3:40)

**Screen:** AutoRamp transaction tracking, followed by Stellar Explorer

**Show:**
- Cross-chain transaction status in AutoRamp
- Deposit detected on Stellar
- Stellar transaction hash and destination details on Stellar Explorer

**Say:**
> "AutoRamp tracks the cross-chain transfer as it progresses from Base to Stellar.
>
> Once the bridge completes the transfer, the application detects the USDC arrival on Stellar.
>
> Here is the corresponding Stellar transaction. Together, the Base and Stellar transaction records provide evidence of the cross-chain movement."

---

## Scene 6 — Complete the AutoRamp off-ramp (3:40–4:50)

**Screen:** AutoRamp off-ramp interface and transaction history

**Show:**
- Detected USDC deposit on Stellar
- Off-ramp/payout processing and conversion
- Simulated payout and final transaction status
- Transaction history

**Say:**
> "After the USDC arrives on Stellar, AutoRamp passes the deposit into its existing off-ramp flow.
>
> The payout process is displayed with transaction status updates, including the conversion and simulated payout.
>
> The simulated payout completes, and the final status is shown in transaction history, demonstrating the full journey from a Base USDC deposit to the Stellar-based off-ramp."

---

## Scene 7 — Closing (4:50–5:15)

**Screen:** Transaction history with both explorer links available

**Show:**
- Transaction history with source (Base) and destination (Stellar) records/links and completed payout

**Say:**
> "This demonstration shows AutoRamp's cross-chain USDC deposit route from Base into Stellar, and its integration with the existing off-ramp.
>
> The evidence includes the source transaction on Base, the destination transaction on Stellar, and the completed simulated payout.
>
> This completes the demonstration of Deliverable 2."

---

## Evidence checklist

- [x] Source USDC deposit route shown from Base (new test wallet, funded with USDC)
- [x] Base transaction hash shown on block explorer (status + token transfer)
- [x] Cross-chain transfer tracked from Base to Stellar in AutoRamp
- [x] Destination Stellar transaction hash shown on Stellar Expert
- [x] USDC arrival detected on Stellar and passed into off-ramp flow
- [x] Simulated fiat payout completed with final status
- [x] Transaction history shows cross-chain proof and completed payout
