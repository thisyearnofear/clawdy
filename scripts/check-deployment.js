/**
 * check-deployment.js
 * Verifies all 3 contracts are deployed and responsive on the target chain.
 *
 * Usage:
 *   node scripts/check-deployment.js              # 0G Mainnet
 *   USE_TESTNET=true node scripts/check-deployment.js  # 0G Testnet
 *   CHAIN=xlayer node scripts/check-deployment.js      # X-Layer Mainnet
 */

import fs from 'fs';
import path from 'path';
import { createPublicClient, http, defineChain } from 'viem';
import { xLayer, xLayerTestnet, bsc, bscTestnet } from 'viem/chains';

// ── Chain definitions ────────────────────────────────────────────────
const zeroGMainnet = defineChain({
  id: 16661,
  name: '0G Mainnet',
  nativeCurrency: { name: '0G', symbol: '0G', decimals: 18 },
  rpcUrls: { default: { http: ['https://evmrpc.0g.ai'] } },
  blockExplorers: { default: { name: '0G Chain Scan', url: 'https://chainscan.0g.ai' } },
});

const zeroGTestnet = defineChain({
  id: 16602,
  name: '0G Testnet (Galileo)',
  nativeCurrency: { name: '0G', symbol: '0G', decimals: 18 },
  rpcUrls: { default: { http: ['https://evmrpc-testnet.0g.ai'] } },
  blockExplorers: { default: { name: '0G Chain Scan (Galileo)', url: 'https://chainscan-galileo.0g.ai' } },
});

const CHAIN_MAP = {
  '0g':   { mainnet: zeroGMainnet, testnet: zeroGTestnet },
  xlayer: { mainnet: xLayer,       testnet: xLayerTestnet },
  bnb:    { mainnet: bsc,          testnet: bscTestnet },
};

// ── Load env ─────────────────────────────────────────────────────────
const envPath = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '.env.local');
const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const getEnv = (key) => process.env[key] || envContent.match(new RegExp(`${key}=(.+)`))?.[1]?.trim();

const chainTarget = (process.env.CHAIN || getEnv('NEXT_PUBLIC_CHAIN') || '0g').toLowerCase();
const useTestnet = process.env.USE_TESTNET === 'true' || getEnv('NEXT_PUBLIC_USE_TESTNET') === 'true';
const resolved = CHAIN_MAP[chainTarget] ?? CHAIN_MAP['0g'];
const chain = useTestnet ? resolved.testnet : resolved.mainnet;

const WEATHER_ADDR = getEnv('NEXT_PUBLIC_WEATHER_AUCTION_ADDRESS');
const VEHICLE_ADDR = getEnv('NEXT_PUBLIC_VEHICLE_RENT_ADDRESS');
const MARKET_ADDR  = getEnv('NEXT_PUBLIC_MEME_MARKET_ADDRESS');
const DEPLOYER     = '0x1f6d430ea6d8D38516Eeb7027073a417260CC48D';

const client = createPublicClient({ chain, transport: http() });

async function checkContract(name, address) {
  if (!address || address.length < 10) {
    console.log(`  ❌ ${name}: address not set in .env.local`);
    return false;
  }
  const code = await client.getBytecode({ address });
  const deployed = code && code.length > 2;
  const explorer = chain.blockExplorers?.default?.url;
  const link = explorer ? `${explorer}/address/${address}` : address;
  if (deployed) {
    console.log(`  ✅ ${name}: deployed at ${address}`);
    console.log(`     ${link}`);
  } else {
    console.log(`  ❌ ${name}: NOT deployed at ${address}`);
  }
  return deployed;
}

(async () => {
  console.log(`\n🔍 CLAWDY Contract Deployment Check`);
  console.log(`   Network: ${chain.name} (chainId ${chain.id})\n`);

  // Deployer balance
  const balance = await client.getBalance({ address: DEPLOYER });
  const balEth = Number(balance) / 1e18;
  const symbol = chain.nativeCurrency.symbol;
  const funded = balEth > 0.01;
  console.log(`Deployer wallet: ${DEPLOYER}`);
  console.log(`Balance: ${balEth.toFixed(4)} ${symbol} ${funded ? '✅' : '❌ (needs funding!)'}\n`);

  const results = await Promise.all([
    checkContract('WeatherAuction', WEATHER_ADDR),
    checkContract('VehicleRent',    VEHICLE_ADDR),
    checkContract('MemeMarket',     MARKET_ADDR),
  ]);

  const allDeployed = results.every(Boolean);
  console.log(`\n${allDeployed ? '✅ All contracts deployed — on-chain features are live!' : '❌ Some contracts missing — run: node scripts/deploy.js'}`);

  if (!funded && !allDeployed) {
    console.log(`\n📋 Next steps:`);
    console.log(`   1. Fund deployer: send 0G to ${DEPLOYER}`);
    if (useTestnet) {
      console.log(`      Faucet: https://faucet.0g.ai`);
    } else {
      console.log(`      Buy/bridge 0G to this address on 0G Mainnet`);
    }
    console.log(`   2. Deploy: node scripts/deploy.js`);
    console.log(`   3. Update .env.local with printed addresses`);
    console.log(`   4. Set same vars in Vercel dashboard → Settings → Environment Variables`);
    console.log(`   5. Redeploy on Vercel (or push a commit to trigger auto-deploy)`);
  }
})();
