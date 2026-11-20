import type { NextConfig } from "next";
import path from "path";

/**
 * Response headers for every page. A full script-src CSP is deliberately not set here: wallet
 * SDKs, WalletConnect and Next's inline bootstrap need a nonce-based policy designed with them.
 * The directives below are the safe subset that blocks base-tag injection, plugin content and
 * cross-site form posts.
 */
export const BASELINE_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Wallet connection popups need window.opener, so same-origin-allow-popups (not same-origin).
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: "base-uri 'self'; object-src 'none'; form-action 'self'" },
];

/**
 * Pages that must never be framed by another site (clickjacking on login, admin and money
 * screens). The public swap app is left embeddable because it is also served as a Base mini app.
 */
export const NO_FRAMING_SOURCES = [
  "/admin/:path*",
  "/auth/:path*",
  "/merchant/:path*",
  "/profile/:path*",
  "/dashboard/:path*",
  "/otc/:path*",
  "/history/:path*",
];
export const NO_FRAMING_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Content-Security-Policy",
    value: "base-uri 'self'; object-src 'none'; form-action 'self'; frame-ancestors 'none'",
  },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: BASELINE_HEADERS },
      ...NO_FRAMING_SOURCES.map((source) => ({ source, headers: NO_FRAMING_HEADERS })),
    ];
  },
  outputFileTracingRoot: __dirname,
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config) => {
    // Ensure .mjs files in node_modules are handled correctly
    config.module.rules.push({
      test: /\.mjs$/,
      include: /node_modules/,
      type: "javascript/auto",
    });

    // Alias @floating-ui/utils to its ESM bundle to avoid resolver issues
    config.resolve.alias = {
      ...(config.resolve?.alias ?? {}),
      "@floating-ui/utils/dom": path.resolve(
        __dirname,
        "node_modules/@floating-ui/utils/dist/floating-ui.utils.dom.mjs",
      ),
      "@floating-ui/utils": path.resolve(
        __dirname,
        "node_modules/@floating-ui/utils/dist/floating-ui.utils.mjs",
      ),
      // @coinbase/cdp-sdk statically imports these optional x402
      // payment-facilitator peer deps (pulled in transitively via
      // RainbowKit's Base Account connector); this app never invokes
      // x402 payments, so stub them out rather than installing unused SDKs.
      "@x402/core": false,
      "@x402/evm": false,
      "@x402/svm": false,
      "@x402/extensions": false,
    };

    return config;
  },
  turbopack: {},
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cryptologos.cc",
      },
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
      },
    ],
  },
};

export default nextConfig;