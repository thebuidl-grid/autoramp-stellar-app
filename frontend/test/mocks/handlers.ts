import { http, HttpResponse } from "msw";

const API = "http://localhost/api";

export const summaryMock = {
  totalVolume: 3105000,
  totalCount: 15,
  successRate: 67,
  netVolume: 1730000,
  onramp: { count: 3, totalAmount: 1370000, totalFees: 3000 },
  offramp: { count: 3, totalAmount: 700000, totalFees: 4000 },
  swap: { count: 3, totalFromAmount: 760000, totalFees: 5000 },
  bankTransfer: { count: 0, totalAmount: 0, totalFees: 0 },
  vas: { count: 0, totalAmount: 0, totalFees: 0 },
  otc: { count: 1, totalAmount: 275000, totalFees: 2000 },
  fees: {
    provider_fee: 10000,
    vat: 500,
    stamp_duty: 100,
    platform_fee: 0,
    total: 10600,
  },
};

function makeMerchant(overrides: Partial<Record<string, unknown>> & { id: string; status: string }) {
  return {
    userId: `user-${overrides.id}`,
    name: `Merchant ${overrides.id}`,
    natureOfBusiness: "Retail",
    description: "",
    websiteUrl: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    country: "",
    postalCode: "",
    verifiedAt: overrides.status === "VERIFIED" ? "2026-01-01T00:00:00.000Z" : null,
    rejectionReason: null,
    metadata: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    user: { email: `${overrides.id}@merchant.example.com`, contactName: null },
    ...overrides,
  };
}

export const merchantsMock = [
  makeMerchant({ id: "m1", status: "VERIFIED" }),
  makeMerchant({ id: "m2", status: "VERIFIED" }),
  makeMerchant({ id: "m3", status: "PENDING" }),
];

// m1 deliberately omits `totalVolume` — regresses the bug where the merchant
// aggregate card rendered NaN because it trusted that field instead of summing
// the per-type completed volumes.
const merchantSummaries: Record<string, Record<string, unknown>> = {
  m1: {
    totalCount: 2,
    successRate: 100,
    onrampCompletedVolume: 100000,
    onrampCompletedCount: 1,
    offrampCompletedVolume: 50000,
    offrampCompletedCount: 1,
    swapCompletedVolume: 0,
    swapCompletedCount: 0,
    unsuccessfulVolume: 0,
    unsuccessfulCount: 0,
  },
  m2: {
    totalVolume: 30000,
    totalCount: 1,
    successRate: 100,
    onrampCompletedVolume: 0,
    onrampCompletedCount: 0,
    offrampCompletedVolume: 0,
    offrampCompletedCount: 0,
    swapCompletedVolume: 30000,
    swapCompletedCount: 1,
    unsuccessfulVolume: 0,
    unsuccessfulCount: 0,
  },
};

function offsetPage(row: Record<string, unknown>, pageNumber: number, totalPages: number, total: number) {
  return HttpResponse.json({
    data: [row],
    pagination: {
      total,
      page: pageNumber,
      limit: 10,
      totalPages,
    },
  });
}

export const handlers = [
  http.get(`${API}/admin/transactions/summary`, () => HttpResponse.json(summaryMock)),

  http.get(`${API}/admin/transactions/analytics`, () => HttpResponse.json([])),

  http.get(`${API}/merchants/onboarding`, () => HttpResponse.json(merchantsMock)),

  http.get(`${API}/merchants/:merchantId/transactions/summary`, ({ params }) => {
    const merchantId = params.merchantId as string;
    return HttpResponse.json(merchantSummaries[merchantId] ?? {});
  }),

  http.get(`${API}/admin/platform-transactions`, ({ request }) => {
    const url = new URL(request.url);
    const type = url.searchParams.get("type");
    const pageParam = url.searchParams.get("page");
    const currentPage = Number(pageParam) || 1;

    if (type === "onramp") {
      const rows = [
        { id: "onr-1", reference: "ONR-001", amount: 850000, status: "COMPLETED", createdAt: "2026-07-13T10:00:00.000Z", type: "onramp", user: "user1@example.com", merchant: null },
        { id: "onr-2", reference: "ONR-002", amount: 50000, status: "COMPLETED", createdAt: "2026-07-13T11:00:00.000Z", type: "onramp", user: "user2@example.com", merchant: null },
      ];
      return offsetPage(rows[currentPage - 1], currentPage, 2, 2);
    }

    if (type === "offramp") {
      return offsetPage(
        { id: "ofr-1", reference: "OFR-001", amount: 120000, status: "COMPLETED", createdAt: "2026-07-13T10:00:00.000Z", type: "offramp", user: "user3@example.com", merchant: null },
        currentPage, 1, 1,
      );
    }

    if (type === "swap") {
      return offsetPage(
        { id: "swp-1", reference: "SWP-001", amount: 60000, status: "COMPLETED", createdAt: "2026-07-13T10:00:00.000Z", type: "swap", user: "user4@example.com", merchant: null },
        currentPage, 1, 1,
      );
    }

    if (type === "otc") {
      return offsetPage(
        { id: "otc-1", reference: "OTC-REF-001", amount: 275000, status: "COMPLETED", createdAt: "2026-07-13T10:00:00.000Z", type: "otc", user: "trader@example.com", merchant: null },
        currentPage, 1, 1,
      );
    }

    if (type === "merchant") {
      return offsetPage(
        { id: "m-1", reference: "M-REF-1", amount: 15000, status: "COMPLETED", createdAt: "2026-07-13T10:00:00.000Z", type: "merchant_onramp", user: null, merchant: "Acme Ltd" },
        currentPage, 1, 1,
      );
    }

    // Combined "all" view
    const allRows = [
      { id: "all-1", reference: "ALL-001", amount: 100000, status: "COMPLETED", createdAt: "2026-07-13T10:00:00.000Z", type: "onramp", user: "user1@example.com", merchant: null },
      { id: "all-2", reference: "ALL-002", amount: 200000, status: "COMPLETED", createdAt: "2026-07-13T11:00:00.000Z", type: "offramp", user: "user2@example.com", merchant: null },
    ];
    return offsetPage(allRows[currentPage - 1], currentPage, 2, 20);
  }),

  http.get(`${API}/admin/transfer-logs`, ({ request }) => {
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor");

    if (!cursor) {
      return HttpResponse.json({
        logs: [
          {
            id: "log-1",
            transactionId: "t-001",
            type: "ONRAMP",
            status: "COMPLETED",
            createdAt: "2026-07-13T10:00:00.000Z",
            updatedAt: "2026-07-13T10:01:00.000Z",
            safehavenPayload: { ref: "sh-1" },
            stablestackPayload: null,
          },
        ],
        total: 2,
        limit: 10,
        nextCursor: "log-cursor-1",
        hasMore: true,
      });
    }

    return HttpResponse.json({
      logs: [
        {
          id: "log-2",
          transactionId: "t-002",
          type: "OFFRAMP",
          status: "FAILED",
          createdAt: "2026-07-13T11:00:00.000Z",
          updatedAt: "2026-07-13T11:01:00.000Z",
          safehavenPayload: null,
          stablestackPayload: { request: {}, response: {} },
        },
      ],
      total: 2,
      limit: 10,
      nextCursor: null,
      hasMore: false,
    });
  }),

  http.get(`${API}/admin/users`, ({ request }) => {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page")) || 1;
    const limit = Number(url.searchParams.get("limit")) || 10;
    const search = url.searchParams.get("search");
    const status = url.searchParams.get("status");
    const role = url.searchParams.get("role");
    const isOTCEnabled = url.searchParams.get("isOTCEnabled");

    let users = [...usersMock];
    if (isOTCEnabled === "true") users = users.filter((u) => u.isOTCEnabled);
    if (search) users = users.filter((u) => u.email.toLowerCase().includes(search.toLowerCase()));
    if (status === "active") users = users.filter((u) => !u.suspended);
    if (status === "suspended") users = users.filter((u) => u.suspended);
    if (role === "admin") users = users.filter((u) => u.role.toLowerCase() === "admin");
    if (role === "user") users = users.filter((u) => u.role.toLowerCase() !== "admin");

    const total = users.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const paged = users.slice((page - 1) * limit, page * limit);

    return HttpResponse.json({
      users: paged,
      pagination: { page, limit, total, totalPages },
    });
  }),

  http.get(`${API}/admin/otc/transactions`, ({ request }) => {
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor");

    if (!cursor) {
      return HttpResponse.json({
        transactions: [
          {
            id: "otc-tx-1",
            reference: "OTC-TX-001",
            amount: 275000,
            fiatAmountReceived: 275000,
            status: "COMPLETED",
            createdAt: "2026-07-13T10:00:00.000Z",
            user: { email: "trader1@example.com", contactName: null, businessName: null },
            userEmail: "trader1@example.com",
            userName: "Trader One",
          },
        ],
        total: 2,
        limit: 20,
        nextCursor: "otc-tx-cursor-1",
        hasMore: true,
      });
    }

    return HttpResponse.json({
      transactions: [
        {
          id: "otc-tx-2",
          reference: "OTC-TX-002",
          amount: 90000,
          fiatAmountReceived: 90000,
          status: "PENDING",
          createdAt: "2026-07-13T11:00:00.000Z",
          user: { email: "trader2@example.com", contactName: null, businessName: null },
          userEmail: "trader2@example.com",
          userName: "Trader Two",
        },
      ],
      total: 2,
      limit: 20,
      nextCursor: null,
      hasMore: false,
    });
  }),

  http.patch(`${API}/admin/users/:userId/flags`, ({ params }) =>
    HttpResponse.json({ id: params.userId, isOTCEnabled: false }),
  ),
];

export const usersMock = [
  {
    id: "u1",
    email: "admin@example.com",
    phoneNumber: "+10000000001",
    role: "ADMIN",
    suspended: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "u2",
    email: "user2@example.com",
    phoneNumber: "+10000000002",
    role: "USER",
    suspended: false,
    isOTCEnabled: true,
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  },
  {
    id: "u3",
    email: "user3@example.com",
    role: "USER",
    suspended: true,
    suspendedAt: "2026-01-03T00:00:00.000Z",
    createdAt: "2026-01-03T00:00:00.000Z",
    updatedAt: "2026-01-03T00:00:00.000Z",
  },
];
