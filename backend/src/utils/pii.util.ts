export const PII_FIELDS = [
  'password',
  'token',
  'apiKey',
  'secret',
  'key',
  'pin',
  'bvn',
  'nin',
  'ninNumber',
  'bvnNumber',
  'identityNumber',
  'identitynumber',
  'accountNumber',
  'account_number',
  'debitAccountNumber',
  'debit_account_number',
  'bankAccountNumber',
  'bank_account_number',
  'phoneNumber',
  'phone_number',
  'emailAddress',
  'email',
  'number',
];

export function maskString(value: string, visible = 4): string {
  if (!value || typeof value !== 'string') return '***';
  if (value.length <= visible * 2) return '***';
  return `${value.slice(0, visible)}***${value.slice(-visible)}`;
}

export function redactSensitiveFields(body: any): any {
  if (!body || typeof body !== 'object') return body;
  if (Array.isArray(body)) return body.map(redactSensitiveFields);

  const redacted: Record<string, any> = {};
  for (const [key, value] of Object.entries(body)) {
    if (PII_FIELDS.includes(key)) {
      redacted[key] =
        typeof value === 'string' ? maskString(value) : '***REDACTED***';
    } else if (value && typeof value === 'object') {
      redacted[key] = redactSensitiveFields(value);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}
