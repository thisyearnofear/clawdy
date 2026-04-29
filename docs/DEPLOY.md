# CLAWDY — Deployment Guide

## Quick Status Check

```bash
node scripts/check-deployment.js              # 0G Mainnet
USE_TESTNET=true node scripts/check-deployment.js  # 0G Testnet
```

---

## Contract Deployment

### Prerequisites

The deployer wallet is: `0x1f6d430ea6d8D38516Eeb7027073a417260CC48D`

It must be funded before deployment.

### Option A — 0G Galileo Testnet ✅ DEPLOYED

> **Already deployed.** Contracts are live on 0G Galileo Testnet (chainId 16602).

1. **Get testnet tokens** at https://faucet.0g.ai — paste the deployer address
2. **Deploy:**
   ```bash
   CHAIN=0g USE_TESTNET=true node scripts/deploy.js
   ```
3. **Copy the printed addresses** into `.env.local`:
   ```
   NEXT_PUBLIC_CHAIN=0g
   NEXT_PUBLIC_USE_TESTNET=true
   NEXT_PUBLIC_WEATHER_AUCTION_ADDRESS=0x...
   NEXT_PUBLIC_VEHICLE_RENT_ADDRESS=0x...
   NEXT_PUBLIC_MEME_MARKET_ADDRESS=0x...
   ```

### Option B — 0G Mainnet (production)

1. **Fund the deployer wallet** with ~0.1 0G on 0G Mainnet (chainId 16661)
   - Bridge from another chain via https://bridge.0g.ai
2. **Deploy:**
   ```bash
   node scripts/deploy.js
   ```
3. **Copy the printed addresses** into `.env.local`

---

## Vercel Environment Variables

After deploying contracts, set these in **Vercel → Settings → Environment Variables**:

| Variable | Value | Required |
|----------|-------|----------|
| `DEPLOYER_PRIVATE_KEY` | Your deployer private key | ✅ Yes |
| `NEXT_PUBLIC_WEATHER_AUCTION_ADDRESS` | From deploy output | ✅ Yes |
| `NEXT_PUBLIC_VEHICLE_RENT_ADDRESS` | From deploy output | ✅ Yes |
| `NEXT_PUBLIC_MEME_MARKET_ADDRESS` | From deploy output | ✅ Yes |
| `NEXT_PUBLIC_APP_URL` | `https://clawdy-nine.vercel.app` | ✅ Yes |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://muxhhklostmbmljumurx.supabase.co` | ✅ Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | From Supabase dashboard → Settings → API | ✅ Yes |
| `NEXT_PUBLIC_WC_PROJECT_ID` | From cloud.walletconnect.com (free) | 🟡 Recommended |
| `NEXT_PUBLIC_SENTRY_DSN` | From Sentry project settings | 🟡 Recommended |
| `SENTRY_ORG` | Sentry org slug | 🟡 Recommended |
| `SENTRY_PROJECT` | Sentry project slug | 🟡 Recommended |
| `API_SECRET` | Random string for /api/0g-storage auth | 🟡 Recommended |
| `NEXT_PUBLIC_API_SECRET` | Same as API_SECRET (client-side) | 🟡 Recommended |
| `NEXT_PUBLIC_USE_TESTNET` | `true` if using testnet | Optional |
| `NEXT_PUBLIC_CHAIN` | `0g` (only supported value) | Optional |

After setting env vars, trigger a redeploy: **Vercel → Deployments → Redeploy**.

---

## WalletConnect Project ID

Without a real project ID, WalletConnect modal fails for non-MetaMask users (most mobile users).

1. Go to https://cloud.walletconnect.com
2. Create a free account → New Project → name it "CLAWDY"
3. Copy the Project ID
4. Set `NEXT_PUBLIC_WC_PROJECT_ID=<your-id>` in Vercel env vars

---

## Supabase Setup

The project uses Supabase for real-time player presence, leaderboard, and weather sync.

**Project:** `muxhhklostmbmljumurx` (West EU)

1. Go to https://supabase.com/dashboard/project/muxhhklostmbmljumurx/settings/api
2. Copy the **Project URL** and **anon/public key**
3. Set in Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL=https://muxhhklostmbmljumurx.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>`

The database schema is in `supabase/schema.sql`. To apply:
```bash
supabase db query --linked -f supabase/schema.sql
```

Features powered by Supabase:
- **Presence channels** — real-time player count (replaces polling)
- **Leaderboard** — persistent scores with live updates
- **Weather sync** — instant weather state changes across clients

---

## Sentry Setup

Error monitoring via Sentry (optional but recommended for production).

1. Create a project at https://sentry.io
2. Copy the **DSN** from project settings
3. Set in Vercel:
   - `NEXT_PUBLIC_SENTRY_DSN=<your-dsn>`
   - `SENTRY_ORG=<your-org-slug>`
   - `SENTRY_PROJECT=<your-project-slug>`

---

## Verify Everything is Live

```bash
# Check contracts on-chain
node scripts/check-deployment.js

# Check live site
curl https://clawdy-nine.vercel.app/api/players
# Expected: {"count":0}
```

---

## Deployed Contract Addresses

### 0G Galileo Testnet (chainId 16602) — ✅ Live

| Contract | Address | Explorer |
|----------|---------|----------|
| WeatherAuction | `0x21506d1ba6ac219b7dbb893fdb009af62f3b25b0` | [View](https://chainscan-galileo.0g.ai/address/0x21506d1ba6ac219b7dbb893fdb009af62f3b25b0) |
| VehicleRent | `0xd98cb26dcc3a3b01404564568cbf2de1dc3de652` | [View](https://chainscan-galileo.0g.ai/address/0xd98cb26dcc3a3b01404564568cbf2de1dc3de652) |
| MemeMarket | `0x44c07afa8340450167796390a8cc493b1aca0dd1` | [View](https://chainscan-galileo.0g.ai/address/0x44c07afa8340450167796390a8cc493b1aca0dd1) |

Deployer wallet: `0x1f6d430ea6d8D38516Eeb7027073a417260CC48D`

### 0G Mainnet — Not yet deployed
