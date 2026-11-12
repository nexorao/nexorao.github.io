# NEXORAO — web platform

A multi-model AI aggregation platform: one account and one credit wallet that
spend across Anthropic Claude, OpenAI AI GPT, Google Gemini and open-source
models — official, authorized APIs only, with transparent per-request costs.

Progress:

| Phase | Scope                                                              | Status |
| ----- | ------------------------------------------------------------------ | ------ |
| 1     | Design system, landing, pricing, model explorer                    | ✅ done |
| 2     | Auth, DB schema + migrations + seeds, dashboard, wallet, subscriptions, admin | ✅ done |
| 3     | Provider adapters + database-backed model registry + encrypted credentials | ✅ done |
| 4     | Streaming chat, server-side cost calculation, atomic credit deduction | ✅ done |
| 5     | Hashed API keys, OpenAI-compatible API, developer docs, playground | ✅ done |
| 6     | Bearer-authenticated Streamable HTTP MCP tools + connection guide  | ✅ done |
| 7     | Razorpay orders, signature-verified webhooks, wallet top-ups, plan checkout, receipts | ✅ implemented; gateway credentials required |
| 8     | Usage analytics, referral rewards, shared rate limits, security headers, Docker deployment | ✅ implemented; email/Redis credentials optional |

## Getting started

```bash
npm install
cp .env.example .env.local    # then edit DATABASE_URL / APP_ENCRYPTION_KEY

# Database — pick ONE:
npm run db:start              # (a) embedded PostgreSQL 18 on :5433 (no Docker needed)
docker compose up -d db       # (b) Dockerized PostgreSQL on :5433

npm run db:setup              # apply migrations + seed (idempotent)
npm run dev                   # http://localhost:3000
```

On Windows, after the local database is configured, double-click
`start-nexorao.vbs` to start the optimized server without opening a command
window. It builds the production server on first run and reuses the build after
that. Use `npm run dev` only when actively developing.

```bash
npm run build                 # production build (Turbopack)
npm run start                 # serve the production build
npm run lint                  # ESLint (flat config)
npm test                      # vitest: crypto unit + real-Postgres wallet/auth integration
npm run jobs:run              # wallet reconciler (expire stale holds + buckets)
```

Seed admin: set `SEED_ADMIN_EMAIL` + `SEED_ADMIN_PASSWORD` in `.env.local`
before `npm run db:seed` to create an admin account (emails are verified
automatically for the seeded admin).

## Stack

| Layer      | Choice                                                                 |
| ---------- | ---------------------------------------------------------------------- |
| Framework  | Next.js 16 (App Router, Turbopack, `cacheComponents`)                  |
| Language   | TypeScript (strict)                                                    |
| Styling    | Tailwind CSS v4 (`@theme inline` token mapping, custom `@utility`s)    |
| Motion     | Framer Motion (150–400 ms, expo-out easing, `prefers-reduced-motion`)  |
| Primitives | Radix UI (shadcn-style, hand-written wrappers) + sonner + Lucide icons |
| Database   | PostgreSQL 18 + Drizzle ORM (integer paise / micro-USD money)          |
| Auth       | First-party: scrypt passwords, DB sessions, email tokens, TOTP 2FA     |
| Fonts      | Locally bundled Manrope + Geist Mono (`next/font/local`)                |

## Project structure

```
src/
├─ app/
│  ├─ (marketing)/       # Public pages (/, /models, /pricing) + site header/footer
│  ├─ (auth)/            # login, register, verify-email, forgot/reset password
│  ├─ dashboard/         # Overview, wallet, subscription, settings (+ admin/ panel)
│  ├─ actions/           # Server actions (auth, user, admin) — Zod-validated
│  ├─ api/                # Chat, payment order/verify/webhook, health
│  ├─ v1/                 # OpenAI-compatible chat completions API
│  ├─ mcp/                # Streamable HTTP MCP endpoint
│  ├─ (marketing)/docs/   # API + MCP connection documentation
│  └─ globals.css        # Design system source of truth (tokens + utilities)
├─ components/           # ui/, marketing/, models/, pricing/, dashboard/
├─ data/                 # Phase 1 marketing seed data
├─ db/                   # schema.ts, client.ts (lazy pool), seed.ts, jobs.ts, migrations runner
├─ drizzle/              # SQL migrations (incl. append-only ledger trigger)
├─ lib/
│  ├─ auth/              # session DAL (use cache: private) + user flows (TOTP, tokens)
│  ├─ crypto/            # scrypt passwords, RFC-6238 TOTP, AES-256-GCM envelopes
│  ├─ wallet/            # reserve→commit/release, consumption order, ledger verify
│  ├─ api/                # Shared metered completions for REST and MCP
│  ├─ payments/           # Razorpay HMAC checks + atomic entitlement settlement
│  ├─ admin/             # admin aggregate queries
│  ├─ settings*.ts       # platform settings (defaults + DB-backed accessors)
│  └─ audit.ts, mailer.ts, rate-limit.ts, format.ts, credits.ts
└─ tests/                # vitest: unit (crypto/allocator) + integration (real PG)
```

## The credits model

- **1 credit = ₹0.01** by default (admin-editable setting `creditValuePaise`),
  never fractional: `credits = ceil(billed_paise / credit_value_paise)`.
- Billed cost = provider USD list price → INR at a configurable FX
  assumption (`NEXT_PUBLIC_FX_INR_PER_USD`, default 90) → + configurable
  per-model markup (default 15%).
- All numbers above are **application defaults, not market facts** — the
  admin panel owns the authoritative values from Phase 2.
- Browser math is **display-only**. The authoritative charge is always
  computed server-side on real token usage (never trust client-computed
  costs).

## Honest-data policy

- Model entries carry a `lastVerified` date and a `sourceUrl`. Entries
  verified against official provider docs on **2026-11-11** are marked
  `Verified`; entries from secondary reports are marked `Unverified` and
  must be confirmed by an admin before launch.
- Sample/illustrative data (e.g. the wallet preview on the landing page) is
  explicitly labeled as such in the UI.
- Unknown values (context windows, host-dependent pricing) render as
  "TBD"/"Host-dependent" instead of guesses.
- Provider names appear as plain text with a trademark disclaimer — no
  logos implying partnership. Official APIs only; no consumer-credential
  reuse, shared accounts or browser automation.

## API and MCP

- API keys are random `nx_live_…` secrets. The database stores only SHA-256
  hashes; the full value is returned once at creation.
- OpenAI-compatible endpoint: `POST /v1/chat/completions`. Use the active
  model IDs shown at `/models`, a Bearer API key, and optionally `stream: true`.
- MCP Streamable HTTP endpoint: `/mcp`. Available tools are `list_models`,
  `get_usage`, and billable `chat_completion`.
- API calls use the same model access, provider adapter, wallet reservation,
  and actual-usage settlement as the signed-in Playground.
- The developer guide is available at `/docs`.

## Payments and referrals

- Checkout prices are read from the database on the server. Razorpay success
  callbacks are verified against Razorpay's API; signed, idempotent webhook
  events are the fallback settlement path. Wallet/subscription entitlements
  and payment state are applied in one database transaction.
- Razorpay credentials are optional for local development. When absent, the
  UI explains that checkout is unconfigured; it does not issue fake credits.
- Monthly/annual plan orders are prepaid periods and do not auto-renew. A
  future recurring billing integration can be added separately.
- Successful payments have an authenticated, printable receipt at
  `/api/payments/<payment-id>/invoice`.
- Referral links use `/register?ref=CODE`. New users and their inviter receive
  `REFERRAL_REWARD_CREDITS` promotional credits (default 500 each); set it to
  `0` to record attribution while pausing rewards. One referral can be applied
  per account, and each inviter is capped at 20 referrals per UTC month.

## Production configuration and deployment

1. Copy `.env.example` into the hosting secret manager or a private
   `.env.production` file. Set a stable PostgreSQL `DATABASE_URL`, HTTPS
   `NEXT_PUBLIC_APP_URL`, and a permanent 32-byte base64
   `APP_ENCRYPTION_KEY` (`openssl rand -base64 32`). Never use the ephemeral
   development encryption key in production.
2. Configure Razorpay key ID, key secret and webhook secret to enable payment
   checkout. Point the Razorpay webhook to `/api/payments/webhook` and enable
   the `payment.captured` and `payment.failed` events.
3. Configure `RESEND_API_KEY` and a verified `RESEND_FROM_EMAIL` for delivered
   transactional email. Configure both Upstash REST variables for shared
   rate limiting across app instances. Production fails closed for API rate
   limited routes if configured Redis becomes unreachable.
4. Apply migrations before serving traffic with `npm run db:migrate`, then run
   `npm run build` and `npm run start` (or build the provided Docker image).
5. For the included single-host deployment, set the Compose variables in the
   deployment environment and run `docker compose -f compose.production.yml
   up -d --build`. Compose waits for PostgreSQL, applies migrations in a
   one-shot migrator service, and only then starts the app.
6. Terminate HTTPS at a trusted reverse proxy, set a correct public origin,
   back up the PostgreSQL volume, and monitor `/api/health`.

The production image uses Next.js standalone output. CSP/security headers are
set in `next.config.ts`. `/api/health` reports database readiness and whether
optional payment, mail, and distributed rate-limit integrations are configured
without exposing secret values or raw database errors.
