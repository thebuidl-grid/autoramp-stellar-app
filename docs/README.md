# AutoRamp API Documentation

This repository contains the official documentation for the AutoRamp API, built with [Mintlify](https://mintlify.com/).

## Overview

AutoRamp provides fiat-to-crypto on-ramp and off-ramp infrastructure for merchants operating in Nigeria. Our API enables businesses to accept Naira payments and convert to stablecoins (USDC, CNGN) and vice versa.

## Local Development

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- npm or yarn

### Installation

```bash
# Install Mintlify CLI
npm i -g mintlify

# Start the dev server
mintlify dev
```

The docs will be available at `http://localhost:3000`.

## Project Structure

```
.
├── docs.json              # Mintlify configuration
├── openapi.yaml           # OpenAPI 3.0.3 specification
├── favicon.svg            # Site favicon
├── logo/                  # Logo assets
│   ├── light.svg
│   └── dark.svg
├── introduction.mdx       # Landing page
├── authentication.mdx     # Auth guide
├── quickstart.mdx         # Quick start tutorial
├── rate-limits.mdx        # Rate limiting info
├── errors.mdx             # Error codes reference
├── provider-limitations.mdx # Provider comparison
├── webhooks/              # Webhook documentation
│   ├── overview.mdx
│   ├── events.mdx
│   └── verify.mdx
└── api-reference/         # API endpoint docs (with Try it)
    ├── onramp.mdx
    ├── offramp.mdx
    ├── swap-init.mdx
    ├── swap-complete.mdx
    ├── swap-create.mdx
    ├── merchant-account.mdx
    ├── merchant-transfer.mdx
    ├── merchant-name-enquiry.mdx
    ├── merchant-transactions.mdx
    ├── merchant-sub-accounts.mdx
    ├── merchant-create-sub-account.mdx
    ├── merchant-virtual-account.mdx
    ├── merchant-banks.mdx
    ├── rates.mdx
    ├── resolve-account.mdx
    └── banks.mdx
```

## Writing Documentation

### Adding a New Guide Page

1. Create a `.mdx` file in the root or appropriate folder
2. Add frontmatter:
   ```yaml
   ---
   title: "Page Title"
   description: "Brief description"
   ---
   ```
3. Add to `docs.json` navigation under the appropriate group

### Adding a New API Endpoint

1. Add the endpoint to `openapi.yaml` with proper `operationId`, `summary`, `description`, `parameters`, and `responses`
2. Create an `.mdx` file in `api-reference/`:
   ```yaml
   ---
   title: "Endpoint Title"
   description: "What it does"
   openapi: METHOD /path
   ---
   ```
3. Add the page to `docs.json` navigation

## OpenAPI Spec

The `openapi.yaml` file defines all API endpoints. When updating:

- Use OpenAPI 3.0.3 format
- Include `operationId` for every endpoint
- Define schemas in `components/schemas`
- Add request/response examples
- Tag endpoints appropriately (On-Ramp, Off-Ramp, Swap, Merchant, General)

## Deployment

This repo is connected to Mintlify for automatic deployment. Push to the main branch and changes go live automatically.

## Support

- **Email:** support@autoramp.com
- **Dashboard:** [https://app.autoramp.com](https://app.autoramp.com)
