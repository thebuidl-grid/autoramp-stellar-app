/**
 * An off-ramp funded over CCTP (Stellar burn, Base mint) is a CCTP transfer like any bridge transfer, so it gets the same record: a
 * CCTP/BRIDGE provider leg on the off-ramp transaction. The relay's own progress lives in `metadata.cctpRelay`; this turns that into the
 * leg's columns. Pure, so the live writer, the creation hook and the backfill all agree.
 */
export interface RelayLegFields {
  reference: string;
  /** The Stellar burn transaction (what the customer sent). */
  providerReference: string | null;
  /** Upper-case relay state: AWAITING_BURN, ATTESTING, MINTING, MINTED, REJECTED. */
  status: string;
  /** The Base mint transaction, once there is one. */
  depositTxHash: string | null;
  /** Where the minted USDC goes (the payout provider's deposit address). */
  fundingAddress: string | null;
  failedStep: string | null;
  failureReason: string | null;
  details: Record<string, unknown>;
}

export function relayLegFields(reference: string, meta: any): RelayLegFields | null {
  const relay = meta?.cctpRelay;
  if (!relay || typeof relay !== 'object') return null;
  const status = String(relay.status ?? 'awaiting_burn').toUpperCase();
  const rejected = status === 'REJECTED';
  const burnTxHash = meta.stellarTxHash ?? relay.burnTxHash ?? null;
  return {
    reference,
    providerReference: burnTxHash ? String(burnTxHash) : null,
    status,
    depositTxHash: relay.mintTxHash ? String(relay.mintTxHash) : null,
    fundingAddress: relay.mintRecipient ? String(relay.mintRecipient) : null,
    failedStep: rejected ? 'attestation' : null,
    failureReason: rejected ? String(relay.error ?? 'Rejected') : null,
    details: {
      kind: 'offramp_relay',
      network: relay.network ?? null,
      sourceChain: 'stellar',
      destinationChain: relay.destinationChain ?? 'base',
      burnTxHash: burnTxHash ? String(burnTxHash) : null,
      mintTxHash: relay.mintTxHash ?? null,
      burnAmountUnits: relay.burnAmountUnits ?? null,
      maxFeeUnits: relay.maxFeeUnits ?? null,
      claimedAt: relay.claimedAt ?? null,
      mintedAt: relay.mintedAt ?? null,
      mintedBy: relay.mintedBy ?? null,
    },
  };
}
