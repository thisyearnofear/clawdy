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

### Option A — 0G Testnet (free, recommended for testing)

1. **Get testnet tokens** at https://faucet.0g.ai — paste the deployer address
2. **Deploy:**
   ```bash
   USE_TESTNET=true node scripts/deploy.js
   ```
3. **Copy the printed addresses** into `.env.local`:
   ```
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
| `NEXT_PUBLIC_WC_PROJECT_ID` | From cloud.walletconnect.com (free) | 🟡 Recommended |
| `NEXT_PUBLIC_USE_TESTNET` | `true` if using testnet | Optional |
| `NEXT_PUBLIC_CHAIN` | `0g` / `xlayer` / `bnb` (default: `0g`) | Optional |

After setting env vars, trigger a redeploy: **Vercel → Deployments → Redeploy**.

---

## WalletConnect Project ID

Without a real project ID, WalletConnect modal fails for non-MetaMask users (most mobile users).

1. Go to https://cloud.walletconnect.com
2. Create a free account → New Project → name it "CLAWDY"
3. Copy the Project ID
4. Set `NEXT_PUBLIC_WC_PROJECT_ID=<your-id>` in Vercel env vars

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

Update this table after deployment:

| Contract | Network | Address | Explorer |
|----------|---------|---------|---------|
| WeatherAuction | — | not yet deployed | — |
| VehicleRent | — | not yet deployed | — |
| MemeMarket | — | not yet deployed | — |
