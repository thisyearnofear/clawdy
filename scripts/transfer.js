import { createPublicClient, createWalletClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { xLayerTestnet, bscTestnet } from 'viem/chains';

const OLD_PK = '0x0edca2ae143b81368a883341a240ce849201e7cbf783ee62e9d181bf037a1a06';
const NEW_ADDRESS = '0x1f6d430ea6d8D38516Eeb7027073a417260CC48D';

async function transfer(chain, rpcUrl) {
  const account = privateKeyToAccount(OLD_PK);
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

  const balance = await publicClient.getBalance({ address: account.address });
  // Leave a small buffer for gas
  const gasEstimate = parseEther('0.001');
  const amount = balance > gasEstimate ? balance - gasEstimate : 0n;

  if (amount > 0n) {
    console.log(`Transferring ${Number(amount) / 1e18} from ${chain.name}...`);
    const hash = await walletClient.sendTransaction({
      to: NEW_ADDRESS,
      value: amount,
    });
    console.log(`Hash: ${hash}`);
  } else {
    console.log(`Insufficient funds on ${chain.name}`);
  }
}

async function run() {
  await transfer(xLayerTestnet, 'https://xlayertestrpc.okx.com');
  await transfer(bscTestnet, 'https://data-seed-prebsc-1-s1.bnbchain.org:8545');
}

run().catch(console.error);
