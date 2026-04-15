import solc from 'solc';
import fs from 'fs';
import path from 'path';
import { createPublicClient, createWalletClient, http, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const xlayerTestnet = defineChain({
  id: 1952,
  name: 'X Layer Testnet',
  nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
  rpcUrls: { default: { http: ['https://testrpc.xlayer.tech'] } },
  blockExplorers: { default: { name: 'OKLink', url: 'https://www.oklink.com/xlayer-test' } },
});

const pk = process.env.DEPLOYER_PRIVATE_KEY || fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').match(/DEPLOYER_PRIVATE_KEY=(0x[0-9a-fA-F]+)/)[1];
const account = privateKeyToAccount(pk);

const publicClient = createPublicClient({ chain: xlayerTestnet, transport: http() });
const walletClient = createWalletClient({ account, chain: xlayerTestnet, transport: http() });

function compile(contractName) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'contracts', `${contractName}.sol`), 'utf8');
  const input = {
    language: 'Solidity',
    sources: { [`${contractName}.sol`]: { content: source } },
    settings: { outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  if (output.errors) {
    const errs = output.errors.filter(e => e.severity === 'error');
    if (errs.length) { console.error(errs); process.exit(1); }
  }
  const contract = output.contracts[`${contractName}.sol`][contractName];
  return { abi: contract.abi, bytecode: '0x' + contract.evm.bytecode.object };
}

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
  console.log(`Deployer: ${account.address}`);
  console.log(`Balance: ${Number(balance) / 1e18} OKB\n`);

  const weatherAddr = await deploy('WeatherAuction');
  const vehicleAddr = await deploy('VehicleRent');

  console.log('\n=== DEPLOYMENT RESULTS ===');
  console.log(`NEXT_PUBLIC_WEATHER_AUCTION_ADDRESS=${weatherAddr}`);
  console.log(`NEXT_PUBLIC_VEHICLE_RENT_ADDRESS=${vehicleAddr}`);
})();