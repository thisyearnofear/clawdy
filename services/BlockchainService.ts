import { encodeFunctionData, toHex } from 'viem'
import { CONTRACT_ADDRESSES, isChainSupported } from './protocolTypes'
import { supportedChains } from './web3Config'
import { useGameStore } from './gameStore'
import { emitToast } from '../components/ui/GameToasts'
import { logger } from './logger'

import type { ContractWalletClient, BlockchainProvider } from './protocolTypes'
export type { ContractWalletClient }

interface SendTransactionParams {
  type: 'weather_bid' | 'vehicle_rent' | 'mint_ability' | 'mint_ability_proof'
  to: `0x${string}`
  abi: unknown
  functionName: string
  args: readonly unknown[]
  amount: number
  value?: bigint
}

/**
 * BlockchainService encapsulates all on-chain interaction — wallet client,
 * chain guard, transaction tracking, and contract call dispatch.
 *
 * The parent facade (AgentProtocol) is responsible for any session-side effects
 * after a transaction succeeds or fails (e.g., updating session state).
 */
export class BlockchainService {
  private walletClient: ContractWalletClient | null = null
  private isPermissioned: boolean = false

  /** Set the wagmi wallet client for on-chain writes. */
  setWalletClient(client: ContractWalletClient | null): void {
    this.walletClient = client
  }

  /** Set whether the user has connected/authorized their wallet. */
  setPermissioned(permissioned: boolean): void {
    this.isPermissioned = permissioned
  }

  /** Check if wallet is permissioned for on-chain actions. */
  isAutonomyEnabled(): boolean {
    return this.isPermissioned
  }

  // ── Ethereum Provider ────────────────────────────────────────────

  private getEthereumProvider(): BlockchainProvider | null {
    if (typeof window === 'undefined') return null
    return window.ethereum ?? null
  }

  async getWalletAddress(): Promise<string | null> {
    const ethereum = this.getEthereumProvider()
    if (!ethereum) return null

    const accounts = (await ethereum.request({ method: 'eth_accounts' })) as string[]
    if (accounts?.[0]) return accounts[0]

    const requested = (await ethereum.request({ method: 'eth_requestAccounts' })) as string[]
    return requested?.[0] ?? null
  }

  async requestSessionPermissions(): Promise<unknown> {
    const ethereum = this.getEthereumProvider()
    if (!ethereum) return null
    try {
      const permissions = await ethereum.request({ method: 'eth_requestAccounts' })
      this.isPermissioned = true
      return permissions
    } catch {
      logger.debug('[BlockchainService] Permission request failed')
      return null
    }
  }

  // ── Transaction Tracking ─────────────────────────────────────────

  private trackTransaction(
    type: 'weather_bid' | 'vehicle_rent' | 'mint_ability' | 'mint_ability_proof',
    amount: number,
    hash?: string,
    error?: string,
  ): string {
    const store = useGameStore.getState()
    const txId = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    store.addTransaction({
      id: txId,
      type,
      amount,
      status: error ? 'failed' : hash ? 'confirmed' : 'pending',
      timestamp: Date.now(),
      retryCount: 0,
      hash,
      error,
    })

    return txId
  }

  // ── Contract Transaction Dispatch ────────────────────────────────

  async sendContractTransaction(params: SendTransactionParams): Promise<string | null> {
    const txId = this.trackTransaction(params.type, params.amount)
    const store = useGameStore.getState()
    const typeLabel = params.type === 'weather_bid' ? 'Weather Bid' : params.type === 'vehicle_rent' ? 'Vehicle Rent' : 'Mint Ability'

    // Chain guard: verify the wallet is on a chain with deployed contracts
    try {
      const ethereum = this.getEthereumProvider()
      if (ethereum) {
        const chainIdHex = (await ethereum.request({ method: 'eth_chainId' })) as string
        const connectedChainId = parseInt(chainIdHex, 16)
        if (!isChainSupported(connectedChainId)) {
          const supportedNames = Object.keys(CONTRACT_ADDRESSES)
            .map(id => supportedChains.find(c => c.id === Number(id))?.name ?? `Chain ${id}`)
            .join(', ')
          const msg = `No contracts deployed on this chain. Switch to: ${supportedNames}`
          store.updateTransaction(txId, { status: 'failed', error: msg })
          emitToast('bid-lose', `${typeLabel} Failed`, msg)
          return null
        }
      }
    } catch (chainErr) {
      logger.warn('[BlockchainService] Chain check failed, proceeding with tx:', chainErr)
    }

    try {
      store.updateTransaction(txId, { status: 'confirming' })
      emitToast('milestone', `${typeLabel} Submitted`, 'Waiting for confirmation...')

      // Prefer wagmi wallet client if available
      if (this.walletClient) {
        const hash = await this.walletClient.writeContract({
          address: params.to,
          abi: params.abi,
          functionName: params.functionName,
          args: params.args,
          ...(params.value !== undefined ? { value: params.value } : {}),
        }) as string

        store.updateTransaction(txId, { status: 'confirmed', hash })
        emitToast('collect', `${typeLabel} Confirmed`, `Tx: ${hash.slice(0, 10)}…`)
        return hash
      }

      // Fallback: direct ethereum provider
      const ethereum = this.getEthereumProvider()
      if (!ethereum) return null

      const from = await this.getWalletAddress()
      if (!from) return null

      const hash = (await ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          from,
          to: params.to,
          data: encodeFunctionData({
            abi: params.abi,
            functionName: params.functionName,
            args: params.args,
          } as Parameters<typeof encodeFunctionData>[0]),
          ...(params.value !== undefined ? { value: toHex(params.value) } : {}),
        }],
      })) as string

      store.updateTransaction(txId, { status: 'confirmed', hash })
      emitToast('collect', `${typeLabel} Confirmed`, `Tx: ${hash.slice(0, 10)}…`)
      return hash
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      store.updateTransaction(txId, { status: 'failed', error: message })
      emitToast('bid-lose', `${typeLabel} Failed`, message.slice(0, 60))
      return null
    }
  }
}

// No module-level singleton — the AgentProtocol facade owns the instance
