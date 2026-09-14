# RAP — Reliable Agent Payments

> Your agent can retry. You shouldn't pay twice.

RAP is the reliability layer between autonomous agents and on-chain money. It gives every payment a permanent identity and guarantees that retries — whether from timeouts, crashes, or lost responses — never result in a second charge.

## The Problem

An agent sends a payment. The request times out, the process crashes, or the network drops the response. The agent doesn't know if the payment succeeded.

The dangerous response: "I'll send it again." That can charge the user twice.

## The Solution

RAP assigns every payment a unique **payment ID** that represents the financial intent, not the transaction. The payment ID travels as the **idempotency key** to KeeperHub, so the executor itself refuses duplicate broadcasts.

| State | Meaning | Retry Behavior |
|-------|---------|----------------|
| `pending` | Created, not executed | Safe to execute |
| `executing` | Sent to KeeperHub | Wait — already in flight |
| `paid` | Verified on-chain | Returns original tx, **no new broadcast** |
| `failed` | Genuinely failed | **Rejects** — create new payment ID |
| `unknown` | Execution started, result unconfirmed | **Waits** — recovers existing execution |

## Architecture

```
Agent / App
    ↓
POST /api/payments → returns payment_id
    ↓
POST /api/payments/:id/pay
    ↓
RAP Payment Service
    ├─ Checks existing state (paid/failed/unknown/executing)
    ├─ Evaluates policies (max amount, allowlist, chain)
    ├─ Calls KeeperHub with payment_id as idempotency key
    └─ Persists execution, updates status
    ↓
KeeperHub executes on Base Sepolia
    ↓
RAP verifies via KeeperHub receipts (verified, receiptStatus, blockNumber)
    ↓
PAID / FAILED / UNKNOWN
```

## Core Invariants

1. **One payment ID = one financial intent**
2. **One payment intent → at most one successful transfer**
3. **Unknown ≠ failed** — never auto-retry on unknown
4. **No execute while existing execution could still succeed**
5. **Genuine failure requires new payment identity**
6. **Concurrent execute requests → one execution path**

All enforced server-side. Frontend buttons are convenience only.

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/payments` | Create payment intent → returns `paymentId` |
| `POST` | `/api/payments/:id/pay` | Execute payment (idempotent) |
| `GET` | `/api/payments/:id` | Get current state + execution info |
| `POST` | `/api/payments/:id/refresh` | Re-check KeeperHub + on-chain |
| `GET` | `/api/payments?user=0x...` | List payments for address |
| `POST` | `/api/policies` | Create policy (max_amount, recipient_allowlist, chain_restriction) |
| `GET` | `/api/policies` | List policies |

### Example

```bash
# Create
curl -X POST https://rap.example.com/api/payments \
  -H "Content-Type: application/json" \
  -d '{"userAddress":"0x...","recipient":"0x...","amount":"1000000000000000"}'

# Returns: {"paymentId":"rap_abc123...","status":"pending",...}

# Execute (safe to retry)
curl -X POST https://rap.example.com/api/payments/rap_abc123.../pay

# Check status
curl https://rap.example.com/api/payments/rap_abc123...
```

## Policies

Thin execution-time guards (enforced, not advisory):

| Type | Config | Example |
|------|--------|---------|
| `max_amount` | `{"maxAmountWei":"100000000000000000"}` | Cap at 0.1 ETH |
| `recipient_allowlist` | `{"recipients":["0x...","0x..."]}` | Approved destinations only |
| `chain_restriction` | `{"allowedChains":[84532],"allowedTokens":["0x..."]}` | Base Sepolia + specific tokens |

## Stack

- **Framework**: Next.js 15 (App Router)
- **Database**: Neon Postgres + Drizzle ORM
- **Execution**: KeeperHub (idempotent transfer API)
- **Chain**: Base Sepolia (testnet)
- **Wallet**: Wagmi + Viem (MetaMask, WalletConnect, Injected)
- **State**: TanStack Query
- **UI**: Radix UI + Tailwind CSS
- **Tests**: Vitest (7 idempotency tests)

## Local Development

```bash
# Install
npm install

# Environment
cp .env.example .env
# Edit .env with your Neon DATABASE_URL and KeeperHub API key

# Database
npm run db:generate  # Creates migration
npm run db:push      # Applies to database (requires running Postgres)

# Run
npm run dev          # http://localhost:3000

# Verify
npm run test         # 7 idempotency tests
npm run lint
npm run build
```

## Deployment (Vercel)

1. Import this repo
2. Add environment variables:
   - `DATABASE_URL` — Neon Postgres connection string
   - `KEEPERHUB_API_KEY` — Org key with `mcp:write` scope
   - `KEEPERHUB_API_URL` — `https://app.keeperhub.com/api`
   - `NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL` — Base Sepolia RPC
   - `NEXT_PUBLIC_CHAIN_ID` — `84532`
   - `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` — Optional
   - `NEXT_PUBLIC_APP_URL` — Your Vercel URL
3. Deploy

## Project Structure

```
src/
├── app/
│   ├── page.tsx                 # Landing
│   ├── layout.tsx               # Providers + Nav
│   ├── pay/page.tsx             # Pay Desk
│   ├── history/page.tsx         # History list
│   ├── payments/[id]/page.tsx   # Payment detail
│   ├── api-docs/page.tsx        # API documentation
│   └── api/                     # API routes
├── db/
│   ├── schema.ts                # payments, payment_executions
│   ├── policy-schema.ts         # policies
│   └── index.ts                 # Drizzle client
├── lib/
│   ├── keeperhub.ts             # KeeperHub client
│   ├── payment-service.ts       # Core payment logic
│   ├── policy-service.ts        # Policy evaluation
│   ├── utils.ts                 # Formatters, ID generation
│   └── cn.ts                    # Classname helper
├── components/
│   ├── ui/                      # Button, Input, Card, Badge, WalletButton
│   └── payments/                # PaymentCard, StatusBadge
└── lib/__tests__/
    └── payment-idempotency.test.ts
```

## License

MIT