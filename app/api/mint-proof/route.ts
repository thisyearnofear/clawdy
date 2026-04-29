import { NextRequest, NextResponse } from 'next/server'
import { createWalletClient, createPublicClient, http, parseAbi, defineChain } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

function resolveChain() {
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || '16602')
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://evmrpc-testnet.0g.ai'
  return defineChain({
    id: chainId,
    name: 'Clawdy Chain',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  })
}

const MEME_MARKET_ADDRESS = (process.env.NEXT_PUBLIC_MEME_MARKET_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`
const NONCES_ABI = parseAbi(['function nonces(address) view returns (uint256)'])

export async function POST(req: NextRequest) {
  try {
    const pk = process.env.DEPLOYER_PRIVATE_KEY || process.env.MINT_SIGNER_KEY
    if (!pk) return NextResponse.json({ error: 'Server not configured' }, { status: 500 })

    const { to, abilityId, amount } = await req.json() as { to: string; abilityId: number; amount: number }
    if (!to || !abilityId || !amount) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

    const chain = resolveChain()
    const account = privateKeyToAccount(pk as `0x${string}`)
    const publicClient = createPublicClient({ chain, transport: http() })
    const walletClient = createWalletClient({ account, chain, transport: http() })

    const nonce = await publicClient.readContract({
      address: MEME_MARKET_ADDRESS,
      abi: NONCES_ABI,
      functionName: 'nonces',
      args: [to as `0x${string}`],
    })

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)

    const signature = await walletClient.signTypedData({
      domain: {
        name: 'MemeMarket',
        version: '1',
        chainId: BigInt(chain.id),
        verifyingContract: MEME_MARKET_ADDRESS,
      },
      types: {
        Mint: [
          { name: 'to', type: 'address' },
          { name: 'abilityId', type: 'uint256' },
          { name: 'amount', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
      primaryType: 'Mint',
      message: {
        to: to as `0x${string}`,
        abilityId: BigInt(abilityId),
        amount: BigInt(amount),
        nonce,
        deadline,
      },
    })

    return NextResponse.json({ deadline: Number(deadline), signature })
  } catch (err) {
    console.error('[mint-proof]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
