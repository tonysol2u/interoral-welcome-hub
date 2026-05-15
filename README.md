# InterOral Welcome Hub — International Gateway Backend

AWS EC2 backend for the MasterCrown.ai / MasterSTL.ai ecosystem.

## Architecture

```
GHL Frontend (mastercrown.ai) → This Backend (AWS EC2) → Relu.ai / S3 / Stripe
```

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/rates?service_type=X` | Fetch rate from Sovereign Pricing Table (IP-based region) |
| GET | `/api/rates/all` | Admin: all pricing rows |
| GET | `/api/ledger/balance` | User's current credit balance |
| GET | `/api/ledger/history` | Transaction history |
| GET | `/api/ledger/tiers` | Credit top-up tiers for user's region |
| POST | `/api/release` | Deduct credits + authorize download (Source of Truth) |
| POST | `/api/ghl/case-signal` | Fire GHL webhook after confirmed ledger deduction |
| POST | `/api/ingest/scan` | Medit/3Shape scan ingest (auto-detect source, tooth#, material) |
| POST | `/api/webhooks/stripe` | Stripe webhook → credit balance (ONLY way to add credits) |
| GET | `/health` | Health check |

## Setup

```bash
cp .env.example .env
# Fill in your values
npm install
npm start
```

## Database

Run the migration to create tables:
```bash
psql $DATABASE_URL < migrations/001_sovereign_pricing.sql
```

**IMPORTANT:** The `sovereign_pricing` table is LEFT EMPTY. Populate it from the admin UI.

## Security

- Stripe webhook validates signatures (prevents balance manipulation)
- All ledger operations use Postgres transactions with row-level locking
- Release endpoint is atomic: check + deduct in one transaction
- GHL signal only fires AFTER confirmed debit in ledger

## Environment Variables

See `.env.example` for full list.
