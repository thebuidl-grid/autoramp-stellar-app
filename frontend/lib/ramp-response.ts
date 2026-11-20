/**
 * The Bitnob-backed POST /ramp/onramp and /ramp/offramp return a flat body:
 *   { status, message, databaseRecord, deposit }
 * while the order UI reads `transactionData.data.deposit` (sell) and
 * `transactionData.data.depositAccount` (buy). Normalise so both shapes work.
 */
export function normalizeRampResponse<T extends Record<string, any>>(body: T): T & { data: Record<string, any> } {
  if (!body || typeof body !== "object") return body as any;
  if (body.data && typeof body.data === "object") return body as any;
  return {
    ...body,
    data: {
      ...body,
      // Buy flow: the bank virtual account is returned as `deposit`.
      ...(body.deposit && body.deposit.accountNumber ? { depositAccount: body.deposit } : {}),
    },
  };
}
