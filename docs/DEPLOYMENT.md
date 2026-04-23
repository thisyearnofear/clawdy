# Deployment Guide

To deploy the Clawdy contracts to the testnets, follow these steps:

## 1. Fund Your Account
We have generated a fresh deployment wallet for you. 

**Address:** `0x23dc7f62DD445bC88300496382807A17E470a8Aa`

**Actions:**
1.  Navigate to the **X-Layer Testnet Faucet** and request testnet tokens.
2.  Navigate to the **BNB Chain Testnet Faucet** and request testnet tokens.

## 2. Environment Setup
We have created an `.env.local` file (this is NOT committed to git). Ensure your private key and configuration are correctly set:

```bash
DEPLOYER_PRIVATE_KEY=0x0edca2ae143b81368a883341a240ce849201e7cbf783ee62e9d181bf037a1a06
```

## 3. Deployment
Run the deployment script for your target chain:

```bash
# Deploy to X-Layer Testnet
CHAIN=xlayer USE_TESTNET=true node scripts/deploy.js

# Deploy to BNB Testnet
CHAIN=bnb USE_TESTNET=true node scripts/deploy.js
```

## 4. Configuration
After deployment, the script will output contract addresses. Update your `.env.local` (or `.env`) with these addresses:

```bash
NEXT_PUBLIC_WEATHER_AUCTION_ADDRESS=0x...
NEXT_PUBLIC_VEHICLE_RENT_ADDRESS=0x...
NEXT_PUBLIC_MEME_MARKET_ADDRESS=0x...
```
