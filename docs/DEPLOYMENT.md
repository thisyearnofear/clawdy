# Deployment Guide

To deploy the Clawdy contracts to the testnets, follow these steps.

> **⚠️ NEVER commit private keys to this file or any tracked file.**

## 1. Fund Your Deployer Wallet

1. Generate a fresh deployer wallet (or use an existing one).
2. Navigate to the **X-Layer Testnet Faucet** and request testnet tokens for your deployer address.
3. Navigate to the **BNB Chain Testnet Faucet** and request testnet tokens for your deployer address.

## 2. Environment Setup

Copy `.env.example` to `.env.local` and fill in your deployer private key:

```bash
cp .env.example .env.local
# Then edit .env.local and set:
# DEPLOYER_PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE
```

`.env.local` is git-ignored and will never be committed.

## 3. Deployment

Run the deployment script for your target chain:

```bash
# Deploy to X-Layer Testnet
CHAIN=xlayer USE_TESTNET=true node scripts/deploy.js

# Deploy to BNB Testnet
CHAIN=bnb USE_TESTNET=true node scripts/deploy.js
```

## 4. Deployed Contract Addresses
The following addresses are active on both X-Layer Testnet and BNB Smart Chain Testnet:

| Contract | Address |
| :--- | :--- |
| **WeatherAuction** | `0xaba140aeaf158daf7c597727bbe86a2bc182481d` |
| **VehicleRent** | `0x09b211b1b4022d2a8e2d527c375b3e7471306c0f` |
| **MemeMarket** | `0x56dadce5439eb324db3bf1ae785dfa650298fd54` |

## 5. Configuration
The per-chain address registry in `services/AgentProtocol.ts` (`CONTRACT_ADDRESSES`) maps these addresses. The app resolves contracts dynamically based on the connected wallet's chain ID.
