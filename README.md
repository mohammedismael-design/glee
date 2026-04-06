# Glee Backend

Production-ready backend for the Glee nightlife platform. Built with **NestJS**, **PostgreSQL** (Prisma ORM), **Redis**, **Stripe**, and **Cloudinary**.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Modules](#modules)
3. [Prerequisites](#prerequisites)
4. [Local Development](#local-development)
5. [Environment Variables](#environment-variables)
6. [Database Migrations & Seeding](#database-migrations--seeding)
7. [Running Tests](#running-tests)
8. [API Documentation](#api-documentation)
9. [Docker & docker-compose](#docker--docker-compose)
10. [Deployment](#deployment)
11. [Security](#security)
12. [Background Jobs](#background-jobs)
13. [RBAC Roles](#rbac-roles)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                          NestJS API (v1)                          │
│                                                                    │
│  auth  events  venues  bookings  menu  payments  media  admin     │
│  vendors  notifications  health  audit                            │
└─────────────────┬────────────────────┬───────────────────────────┘
                  │                    │
          PostgreSQL (Prisma)        Redis
          ─ Users                   ─ Rate limiting
          ─ Events/Tickets          ─ Cache
          ─ Venues/Tables           ─ Bull queues
          ─ Bookings                ─ Inventory locks
          ─ Menu/Pricing
          ─ Payments
          ─ Audit Logs
```

**Key design decisions:**

- **Atomic booking creation** — uses PostgreSQL transactions + row-level locking on `TimeSlotTable` to prevent double-booking.
- **Inventory holds** — ticket inventory held for 10 minutes (configurable) with cron-based expiry.
- **Idempotency keys** — all payment and booking mutations accept `X-Idempotency-Key` header, stored in DB.
- **Webhook signature verification** — Stripe webhooks use `stripe.webhooks.constructEvent()` before processing.
- **RBAC** — 9 roles with least-privilege guards on every route.
- **Audit trail** — every sensitive action (price change, booking override, role change) is logged to `AuditLog`.
- **PII encryption** — email/phone stored encrypted at rest, masked in logs.
- **GDPR** — soft-delete with hard-delete cron after 30 days.

---

## Modules

| Module | Description |
|---|---|
| `auth` | JWT access + refresh tokens, local strategy, email verify |
| `users` | User profiles, role management, soft-delete |
| `events` | Event CRUD, ticket tiers, inventory holds, moderation workflow |
| `venues` | Venue profiles, tables, time slots, slot blocking |
| `bookings` | Atomic booking, status workflow, admin override, double-booking prevention |
| `menu` | Categories, items, bundles, specials, price history, approval workflow |
| `payments` | Stripe payment intents, webhook handler, refunds |
| `media` | Image upload (Cloudinary), resolution/format validation, watermarking |
| `notifications` | Email (SMTP), SMS (Twilio), event-driven per status change + QR codes |
| `admin` | Moderation queue, vendor approval, audit log browser, dashboard |
| `vendors` | Vendor dashboard, sales reports, date blocking |
| `audit` | Centralised audit log service (global) |
| `health` | `/api/v1/health` — database + Redis liveness checks |
| `jobs` | Cron jobs: release expired holds, cancel stale bookings, GDPR cleanup, scheduled publishing |

---

## Prerequisites

- Node.js ≥ 20
- PostgreSQL ≥ 15
- Redis ≥ 7
- Docker & docker-compose (for containerised setup)

---

## Local Development

```bash
# 1. Clone the repo
git clone https://github.com/mohammedismael-design/glee
cd glee

# 2. Install dependencies
npm install

# 3. Copy and fill environment variables
cp .env.example .env
# Edit .env with your values

# 4. Start PostgreSQL and Redis with docker-compose
docker-compose --profile dev up -d postgres redis adminer redis-commander

# 5. Run database migrations
npm run db:migrate

# 6. Generate Prisma client
npm run db:generate

# 7. Seed the database
npm run db:seed

# 8. Start the API in dev mode (hot reload)
npm run start:dev
```

The API is available at `http://localhost:4000/api/v1`  
Swagger UI: `http://localhost:4000/api/docs`

---

## Environment Variables

See [`.env.example`](.env.example) for a fully annotated list of all environment variables.

**Required for startup:**

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_HOST` / `REDIS_PORT` | Redis connection |
| `JWT_SECRET` | ≥32 char secret for access tokens |
| `JWT_REFRESH_SECRET` | ≥32 char secret for refresh tokens |
| `EMAIL_VERIFY_SECRET` | Secret for email verify tokens |
| `PII_ENCRYPTION_KEY` | ≥32 char key for PII field encryption |
| `STRIPE_SECRET_KEY` | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `SMTP_HOST/USER/PASS` | SMTP server for email |
| `EMAIL_FROM_ADDRESS` | Sender email address |
| `CORS_ORIGINS` | Comma-separated allowed frontend origins |
| `FRONTEND_URL` / `API_URL` | Public URLs |

---

## Database Migrations & Seeding

```bash
# Create and apply a new migration
npm run db:migrate

# Apply migrations in production (no interactive prompt)
npm run db:migrate:prod

# Open Prisma Studio (DB browser)
npm run db:studio

# Seed demo data (super admin, vendor, venue, tables, menu categories)
npm run db:seed
```

**Default seed credentials:**

| Role | Email | Password |
|---|---|---|
| Super Admin | `superadmin@glee.com` | `ChangeMe@123!` |
| Vendor | `vendor@glee.com` | `Vendor@123!` |

> ⚠️ Change these immediately after seeding in any non-development environment.

---

## Running Tests

```bash
# Unit tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:cov

# End-to-end tests
npm run test:e2e
```

---

## API Documentation

When running in non-production mode, OpenAPI 3.0 docs are served at:

```
http://localhost:4000/api/docs
```

All endpoints are tagged by module, include request/response schemas, and support Bearer token auth.

---

## Docker & docker-compose

```bash
# Start full stack (API + Postgres + Redis)
docker-compose up -d

# Start with dev tools (Adminer + Redis Commander)
docker-compose --profile dev up -d

# Build production image
docker build -t glee-api .

# Run production image
docker run -p 4000:4000 --env-file .env glee-api
```

---

## Deployment

### Environment preparation

1. Set all required environment variables (see `.env.example`)
2. Ensure `NODE_ENV=production`
3. Run migrations: `npm run db:migrate:prod`
4. (Optional) Run seed: `npm run db:seed` for super admin creation

### Health check

```
GET /api/v1/health
```

Returns `{ status: "ok" }` when database is reachable.

### Graceful shutdown

The application handles `SIGTERM` and `SIGINT` signals, completing in-flight requests before exiting.

### CI/CD

A GitHub Actions pipeline is included at `.github/workflows/ci.yml`:
- Runs tests on every push/PR
- Builds and pushes Docker image to GHCR on `main` branch merges

---

## Security

| Feature | Implementation |
|---|---|
| JWT + refresh tokens | 15-minute access tokens, 7-day rotating refresh tokens |
| Webhook verification | Stripe `constructEvent()` with signing secret |
| Rate limiting | 100 req/min per customer, 1000 req/min per vendor (ThrottlerModule) |
| Helmet | Security headers on all responses |
| CORS | Allowlist-based, configured per environment |
| PII encryption | AES-256 via crypto-js, keys in environment |
| PII masking | Passwords, tokens, emails masked in all log output |
| GDPR | Soft-delete + 30-day hard-delete cron |
| RBAC | 9 roles, NestJS guards on every protected route |
| Idempotency | All payment/booking mutations deduplicated via idempotency keys |
| Audit trail | Every sensitive action logged to `AuditLog` with before/after state |

---

## Background Jobs

Cron-based jobs run within the API process (NestJS `@nestjs/schedule`):

| Job | Schedule | Description |
|---|---|---|
| Release expired holds | Every minute | Releases ticket inventory holds older than TTL |
| Release table locks | Every 2 minutes | Unlocks `TimeSlotTable` rows past lock expiry |
| Cancel stale bookings | Every 5 minutes | Auto-cancels `AWAITING_PAYMENT` bookings >30 min old |
| Publish scheduled items | Every 5 minutes | Makes `PENDING` menu items `LIVE` when publish date arrives |
| Clean idempotency keys | Daily midnight | Deletes expired idempotency key records |
| GDPR cleanup | Daily 2am | Permanently deletes user records 30 days post-deletion request |

---

## RBAC Roles

| Role | Key Permissions |
|---|---|
| `SUPER_ADMIN` | Full system access, user management, ownership transfer |
| `ADMIN` | Events, venues, bookings, vendors, menus, disputes, customer data |
| `OPERATIONS_MANAGER` | Booking management, overrides, venue schedule, operational reports |
| `COMMERCIAL_MANAGER` | Vendor onboarding, packages, campaigns, discounts, revenue reports |
| `FINANCE_ADMIN` | Payment status, refunds, reconciliation, payouts (no content editing) |
| `VENDOR` | Own events, venue, menu, bookings, sales reports (no competitor data, no self-approval) |
| `VENDOR_STAFF` | View bookings, check-in, update table status, limited menu edits |
| `CUSTOMER_SUPPORT` | View bookings/profiles, resend confirmations, log issues |
| `CONTENT_MANAGER` | Upload banners, edit event copy, manage media library |

---

## Backup

```bash
# Manual database backup
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore
psql $DATABASE_URL < backup_file.sql
```

For automated backups, configure a daily cron on your infrastructure or use managed PostgreSQL backup features (e.g., RDS automated backups, Supabase PITR).

---

## Licence

MIT — see [LICENSE](LICENSE).