# Waitlist API

## Join (public)
`POST /waitlist` — body:

```json
{
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "phoneNumber": "+234 801 234 5678",
  "userType": "freelancer",
  "phoneCountry": "NG",
  "referrer": "twitter.com",
  "utmSource": "twitter",
  "utmMedium": "social",
  "utmCampaign": "launch",
  "source": "waitlist-page"
}
```

| Field | Required | Rules |
|---|---|---|
| `name` | yes | 2-80 characters, trimmed |
| `email` | yes | valid email, max 254, trimmed and lowercased |
| `phoneNumber` | yes | 7-15 digits with an optional leading `+`; spaces, dashes, dots and brackets are stripped (`+234 801-234 5678` is stored as `+2348012345678`) |
| `userType` | yes | one of `crypto_native`, `freelancer`, `cross_border`, `fintech` (what the person does) |
| `phoneCountry` | no | ISO 3166-1 alpha-2 country picked in the phone selector (`NG`, `GH`, ...), uppercased |
| `referrer` | no | hostname (or URL, reduced to a lowercase hostname without `www.`) of the page that sent the visitor; max 255. Omit for direct visits |
| `utmSource`, `utmMedium`, `utmCampaign` | no | campaign tags, trimmed, max 100 each; blank becomes null |
| `source` | no | free text, max 64 (which page of ours the form was on) |

**Visitor country.** The API also records the country the request came from, for analytics. It is not part of the
body: it is read from the `x-visitor-country` header (set by the frontend proxy from the edge's country) or, for direct
calls, Cloudflare's `cf-ipcountry`. Unknown/Tor pseudo-codes (`XX`, `T1`) and anything that is not a 2-letter code are
stored as null. Either header can be spoofed by someone calling the API directly, so treat it as analytics, never as a
security signal.

Unknown fields and missing/invalid required fields return `400`. Idempotent per email: joining twice returns the same
`200 { status: "success", message }`, never reveals whether the email was already on the list, and does **not**
overwrite the stored details. Throttled to 5 requests/minute per client.

## Admin (JWT, ADMIN role)
- `GET /admin/waitlist?page=1&limit=20&search=` — signups, newest first. `search` matches email, name (case-insensitive) or phone number.
  Returns `{ data: [{ id, email, name, phoneNumber, phoneCountry, userType, country, referrer, utmSource, utmMedium, utmCampaign, source, createdAt }], meta: { total, page, limit, totalPages } }`.
  Rows created before these fields existed have `null` for them.
- `GET /admin/waitlist/stats?days=30` — analytics report (all UTC):
  - `total`, `today`, `inRange`, `averagePerDay`, `days`
  - `change: { previous, percent }` — this range vs. the preceding range of equal length (`percent` is `null` with no baseline)
  - `series: [{ date, count, cumulative }]` — zero-filled, oldest first
  - `heatmap: number[7][24]` — signups by weekday (0 = Sunday) × hour within the range
  - `bySource: [{ source, count }]` — within the range (`unknown` when unset)
  - `byType: [{ type, count, percent }]` — all-time signups per user type; always lists the four types (zero-filled) plus `unknown` for older signups without one. `percent` is the share of **all** signups (one decimal), so the five rows add up to 100
  - `byCountry: [{ key, count, percent }]` — all-time top 15 countries the signups came from (`key` is an ISO code or `unknown`)
  - `byReferrer: [{ key, count, percent }]` — all-time top 15 referring hostnames (`key` is a hostname or `direct`)
  - `conversion: { registered, total, rate }` — all-time share of waitlist emails that have registered a user account
- `GET /admin/waitlist/export` — CSV download of every signup (`email,name,phone,phone_country,type,country,referrer,utm_source,utm_medium,utm_campaign,source,signed_up_at_utc`); text cells starting with `= + - @` are prefixed with `'` to prevent spreadsheet formula injection. Phone numbers are exported as-is (they are validated as digits with an optional `+`, so they cannot carry a formula).

Migrations: `20261112120000_waitlist`, `20261113090000_waitlist_profile` (nullable `name`, `phone_number`, `user_type`), `20261113120000_waitlist_origin` (nullable `phone_country`, `country`, `referrer`, `utm_source`, `utm_medium`, `utm_campaign`); `npm run migrate`. **Apply the second migration before deploying code that includes it**, otherwise signups fail.
