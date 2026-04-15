import type { PendingTransaction } from './gameStore'

const MAX_RETRY_COUNT = 3
const RETRY_DELAY_MS = 2000
const TRANSACTION_TIMEOUT_MS = 30000

export interface TransactionConfig {
  type: 'weather_bid' | 'vehicle_rent' | 'food_collect'
  amount: number
  onSuccess?: () => void
  onError?: (error: Error) => void
}

export interface TransactionResult {
  success: boolean
  hash?: string
  error?: string
}

// Generate unique transaction ID
export const generateTxId = (): string => {
  return `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// Sleep utility for retry delays
const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Check if error is retryable
const isRetryableError = (error: unknown): boolean => {
  if (!error) return true
  const errorMessage = error instanceof Error ? error.message : String(error)
  
  // Retry on network errors, timeouts, user rejection (sometimes)
  const retryablePatterns = [
    /network/i,
    /timeout/i,
    /ECONNREFUSED/i,
    /ETIMEDOUT/i,
    /connection/i,
    /request.*failed/i,
  ]
  
  return retryablePatterns.some((pattern) => pattern.test(errorMessage))
}

// Execute transaction with retry logic
export async function executeTransactionWithRetry(
  transactionFn: () => Promise<TransactionResult>,
  config: TransactionConfig,
  onProgress?: (status: PendingTransaction['status'], error?: string) => void
): Promise<TransactionResult> {
  let lastError: Error | undefined
  
  onProgress?.('pending')
  
  for (let attempt = 0; attempt <= MAX_RETRY_COUNT; attempt++) {
    try {
      onProgress?.('confirming')
      
      // Create timeout controller
      const timeoutPromise = new Promise<TransactionResult>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Transaction timeout'))
        }, TRANSACTION_TIMEOUT_MS)
      })
      
      // Race between transaction and timeout
      const result = await Promise.race([
        transactionFn(),
        timeoutPromise
      ])
      
      if (result.success) {
        onProgress?.('confirmed', result.hash ? `Transaction confirmed: ${result.hash}` : 'Transaction confirmed')
        return result
      }
      
      // Transaction failed but no error thrown
      lastError = new Error(result.error || 'Transaction failed')
      throw lastError
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      
      // Check if we should retry
      if (attempt < MAX_RETRY_COUNT && isRetryableError(error)) {
        onProgress?.('pending', `Retry ${attempt + 1}/${MAX_RETRY_COUNT}`)
        await sleep(RETRY_DELAY_MS * (attempt + 1)) // Exponential backoff
        continue
      }
      
      // Max retries reached or non-retryable error
      break
    }
  }
  
  const errorMessage = lastError?.message || 'Transaction failed'
  onProgress?.('failed', errorMessage)
  config.onError?.(lastError!)
  
  return {
    success: false,
    error: errorMessage
  }
}

// Format transaction for display
export const formatTransactionStatus = (status: PendingTransaction['status']): string => {
  switch (status) {
    case 'pending':
      return 'Pending'
    case 'confirming':
      return 'Confirming...'
    case 'confirmed':
      return 'Confirmed'
    case 'failed':
      return 'Failed'
    default:
      return 'Unknown'
  }
}

// Get status color class
export const getStatusColor = (status: PendingTransaction['status']): string => {
  switch (status) {
    case 'pending':
      return 'text-yellow-400'
    case 'confirming':
      return 'text-blue-400'
    case 'confirmed':
      return 'text-green-400'
    case 'failed':
      return 'text-red-400'
    default:
      return 'text-white'
  }
}

// Clear stale transactions (older than 5 minutes)
export const clearStaleTransactions = (
  transactions: PendingTransaction[],
  maxAgeMs: number = 300000
): PendingTransaction[] => {
  const cutoff = Date.now() - maxAgeMs
  return transactions.filter((tx) => tx.timestamp > cutoff)
}

// Calculate estimated confirmation time
export const getEstimatedConfirmationTime = (type: TransactionConfig['type']): string => {
  switch (type) {
    case 'weather_bid':
      return '~15-30 seconds'
    case 'vehicle_rent':
      return '~10-20 seconds'
    case 'food_collect':
      return '~5-15 seconds'
    default:
      return '~30 seconds'
  }
}