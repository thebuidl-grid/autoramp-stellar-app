# User analytics (admin)

`GET /admin/user-analytics?days=30` — JWT, ADMIN role. All dates are UTC; `days` is 1–365.

```jsonc
{
  "days": 30,
  "users":  { "total", "new", "newChange": { "previous", "percent" /* null = no baseline */ },
              "signups": [{ "date", "count", "cumulative" }] },
  "active": { "dau", "wau", "mau", "stickiness" /* DAU/MAU % */,
              "transactingPerDay": [{ "date", "users" }] },
  "funnel": [{ "step", "count", "percent" /* of registered */ }],   // Registered → Started → Completed → Repeat (2+)
  "transactions": [{ "kind": "onramp|offramp|swap", "total", "completed", "failed", "successRate", "users" }],
  "volume": [{ "kind": "onramp|offramp", "currency", "amount" }],   // completed fiat volume in range; swaps are token-denominated so only counted
  "retention": [{ "day": 1|7|30, "eligible", "retained", "percent" }]
}
```

## How it is measured
- **Active users** use `users.last_active_at`, written by the JWT strategy at most once per 10 minutes per user per process.
  Only authenticated user traffic counts (not API-key/merchant requests). The column starts empty on deploy, so
  DAU/WAU/MAU and retention are low at first and become accurate over time.
- **Retention** = of users old enough to measure, the share whose latest activity is at least N days after signup
  ("still active after N days"), not a strict cohort return rate.
- **Funnel / transactions / volume** come from `onramp_transactions`, `offramp_transactions` and `swap_transactions`
  (regular users; merchant tables are not included). A transaction counts as completed when `status = COMPLETED`.

Migration: `20261112130000_user_last_active` (`npm run migrate`).
