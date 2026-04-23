import { createPublicClient, createWalletClient, http, parseEther, parseGwei } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';

const OLD_PK = '0x0edca2ae143b81368a883341a240ce849201e7cbf783ee62e9d181bf037a1a06';
const NEW_ADDRESS = '0x1f6d430ea6d8D38516Eeb7027073a417260CC48D';

async function transfer() {
  const account = privateKeyToAccount(OLD_PK);
  const publicClient = createPublicClient({ chain: bsc, transport: http() });
  const walletClient = createWalletClient({ account, chain: bsc, transport: http() });

  const balance = await publicClient.getBalance({ address: account.address });
  const gasEstimate = await publicClient.estimateGas({ to: NEW_ADDRESS, account });
  const gasPrice = await publicClient.getGasPrice();
  const gasCost = gasEstimate * gasPrice;

  const amount = balance > gasCost ? balance - gasCost : 0n;

  if (amount > 0n) {
    console.log(`Transferring ${Number(amount) / 1e18} BNB from Mainnet...`);
    const hash = await walletClient.sendTransaction({
      to: NEW_ADDRESS,
      value: amount,
    });
    console.log(`Hash: ${hash}`);
  } else {
    console.log('Insufficient funds on BNB Mainnet');
  }
}

transfer().catch(console.error);
