import solc from 'solc';
import fs from 'fs';
import path from 'path';
import { createPublicClient, createWalletClient, http, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
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

// ── Resolve target ───────────────────────────────────────────────────

const chainTarget = (process.env.CHAIN || '0g').toLowerCase();
const useTestnet = process.env.USE_TESTNET === 'true' || process.env.USE_0G_TESTNET === 'true';

const resolved = CHAIN_MAP[chainTarget];
if (!resolved) {
  console.error(`Unknown chain target: "${chainTarget}". Use: 0g, xlayer, or bnb`);
  process.exit(1);
}
const chain = useTestnet ? resolved.testnet : resolved.mainnet;

// ── Account ──────────────────────────────────────────────────────────

const pk = process.env.DEPLOYER_PRIVATE_KEY || fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', '.env.local'), 'utf8').match(/DEPLOYER_PRIVATE_KEY=(0x[0-9a-fA-F]+)/)[1];
const account = privateKeyToAccount(pk);

const publicClient = createPublicClient({ chain, transport: http() });
const walletClient = createWalletClient({ account, chain, transport: http() });

// ── Compile ──────────────────────────────────────────────────────────

function compile(contractName) {
  const source = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'contracts', `${contractName}.sol`), 'utf8');
  const input = {
    language: 'Solidity',
    sources: { [`${contractName}.sol`]: { content: source } },
    settings: {
      evmVersion: 'cancun',
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  if (output.errors) {
    const errs = output.errors.filter(e => e.severity === 'error');
    if (errs.length) { console.error(errs); process.exit(1); }
  }
  const contract = output.contracts[`${contractName}.sol`][contractName];
  return { abi: contract.abi, bytecode: '0x' + contract.evm.bytecode.object };
}

// ── Deploy ───────────────────────────────────────────────────────────

async function deploy(contractName) {
  console.log(`Compiling ${contractName}...`);
  const { abi, bytecode } = compile(contractName);
  console.log(`Deploying ${contractName}...`);
  const gasPrice = await publicClient.getGasPrice();
  const hash = await walletClient.deployContract({ abi, bytecode, args: [], type: 'legacy', gasPrice });
  console.log(`  tx: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`  deployed at: ${receipt.contractAddress}`);
  return receipt.contractAddress;
}

(async () => {
  const balance = await publicClient.getBalance({ address: account.address });
  const symbol = chain.nativeCurrency.symbol;
  console.log(`Deployer: ${account.address}`);
  console.log(`Network:  ${chain.name} (chainId ${chain.id})`);
  console.log(`Balance:  ${Number(balance) / 1e18} ${symbol}\n`);

  const weatherAddr = await deploy('WeatherAuction');
  const vehicleAddr = await deploy('VehicleRent');

  console.log('\n=== DEPLOYMENT RESULTS ===');
  console.log(`NEXT_PUBLIC_CHAIN=${chainTarget}`);
  console.log(`NEXT_PUBLIC_USE_TESTNET=${useTestnet ? 'true' : 'false'}`);
  console.log(`NEXT_PUBLIC_WEATHER_AUCTION_ADDRESS=${weatherAddr}`);
  console.log(`NEXT_PUBLIC_VEHICLE_RENT_ADDRESS=${vehicleAddr}`);
})();
