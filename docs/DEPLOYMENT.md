# Deployment Guide

To deploy the Clawdy contracts, follow these steps.

> **⚠️ NEVER commit private keys to this file or any tracked file.**

## 1. Fund Your Deployer Wallet

1. Generate a fresh deployer wallet (or use an existing one).
2. Navigate to the **0G Galileo Testnet Faucet** and request testnet tokens for your deployer address.

## 2. Environment Setup

Copy `.env.example` to `.env.local` and fill in your deployer private key:

```bash
cp .env.example .env.local
# Then edit .env.local and set:
# DEPLOYER_PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE
```

`.env.local` is git-ignored and will never be committed.

## 3. Deployment

```bash
# Deploy to 0G Galileo Testnet (default)
CHAIN=0g USE_TESTNET=true node scripts/deploy.js

# Override mint signer (optional — defaults to deployer address)
CHAIN=0g USE_TESTNET=true MINT_SIGNER=0xYourSigner node scripts/deploy.js
```

## 4. Deployed Contract Addresses (0G Galileo Testnet)

| Contract | Address |
| :--- | :--- |
| **WeatherAuction** | `0x21506d1ba6ac219b7dbb893fdb009af62f3b25b0` |
| **VehicleRent** | `0xd98cb26dcc3a3b01404564568cbf2de1dc3de652` |
| **MemeMarket** | `0x44c07afa8340450167796390a8cc493b1aca0dd1` |

## 5. Configuration

Contract addresses are registered in `services/protocolTypes.ts` (`CONTRACT_ADDRESSES`) keyed by chain ID. The app resolves contracts from the connected wallet's chain ID, falling back to `NEXT_PUBLIC_*` env vars.
