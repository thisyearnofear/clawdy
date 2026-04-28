import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  executeTransactionWithRetry,
  generateTxId,
  formatTransactionStatus,
  getStatusColor,
  clearStaleTransactions,
  getEstimatedConfirmationTime,
} from '../transactionHandler'

describe('transactionHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  describe('generateTxId', () => {
    it('generates unique IDs', () => {
      const id1 = generateTxId()
      const id2 = generateTxId()
      expect(id1).not.toBe(id2)
    })

    it('starts with tx_ prefix', () => {
      expect(generateTxId()).toMatch(/^tx_/)
    })
  })

  describe('executeTransactionWithRetry', () => {
    it('returns success on first attempt', async () => {
      const txFn = vi.fn().mockResolvedValue({ success: true, hash: '0xabc' })
      const promise = executeTransactionWithRetry(txFn, { type: 'weather_bid', amount: 0.1 })
      await vi.runAllTimersAsync()
      const result = await promise
      expect(result.success).toBe(true)
      expect(result.hash).toBe('0xabc')
      expect(txFn).toHaveBeenCalledTimes(1)
    })

    it('retries on retryable errors with exponential backoff', async () => {
      const txFn = vi.fn()
        .mockRejectedValueOnce(new Error('network timeout'))
        .mockResolvedValue({ success: true, hash: '0xdef' })
      const onProgress = vi.fn()
      const promise = executeTransactionWithRetry(
        txFn,
        { type: 'weather_bid', amount: 0.1 },
        onProgress,
      )
      await vi.runAllTimersAsync()
      const result = await promise
      expect(result.success).toBe(true)
      expect(txFn).toHaveBeenCalledTimes(2)
      // Verify exponential backoff message
      expect(onProgress).toHaveBeenCalledWith('pending', 'Retry 1/3')
    })

    it('fails after max retries', async () => {
      const txFn = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
      const promise = executeTransactionWithRetry(txFn, { type: 'weather_bid', amount: 0.1 })
      await vi.runAllTimersAsync()
      const result = await promise
      expect(result.success).toBe(false)
      expect(txFn).toHaveBeenCalledTimes(4) // 1 initial + 3 retries
    })

    it('does not retry non-retryable errors', async () => {
      const txFn = vi.fn().mockRejectedValue(new Error('insufficient funds'))
      const promise = executeTransactionWithRetry(txFn, { type: 'weather_bid', amount: 0.1 })
      await vi.runAllTimersAsync()
      const result = await promise
      expect(result.success).toBe(false)
      expect(txFn).toHaveBeenCalledTimes(1)
    })

    it('calls onProgress with status updates', async () => {
      const txFn = vi.fn().mockResolvedValue({ success: true, hash: '0xabc' })
      const onProgress = vi.fn()
      const promise = executeTransactionWithRetry(
        txFn,
        { type: 'weather_bid', amount: 0.1 },
        onProgress,
      )
      await vi.runAllTimersAsync()
      await promise
      expect(onProgress).toHaveBeenCalledWith('pending')
      expect(onProgress).toHaveBeenCalledWith('confirming')
    })

  })

  describe('formatTransactionStatus', () => {
    it('formats known statuses', () => {
      expect(formatTransactionStatus('pending')).toBe('Pending')
      expect(formatTransactionStatus('confirming')).toBe('Confirming...')
      expect(formatTransactionStatus('confirmed')).toBe('Confirmed')
      expect(formatTransactionStatus('failed')).toBe('Failed')
    })
  })

  describe('getStatusColor', () => {
    it('returns color classes for each status', () => {
      expect(getStatusColor('pending')).toContain('yellow')
      expect(getStatusColor('confirming')).toContain('blue')
      expect(getStatusColor('confirmed')).toContain('green')
      expect(getStatusColor('failed')).toContain('red')
    })
  })

  describe('clearStaleTransactions', () => {
    it('removes transactions older than maxAge', () => {
      const now = Date.now()
      vi.setSystemTime(now)
      const txs = [
        { id: '1', type: 'weather_bid' as const, amount: 0, status: 'confirmed' as const, timestamp: now - 400000, retryCount: 0 },
        { id: '2', type: 'weather_bid' as const, amount: 0, status: 'pending' as const, timestamp: now - 100000, retryCount: 0 },
      ]
      expect(clearStaleTransactions(txs)).toHaveLength(1)
    })
  })

  describe('getEstimatedConfirmationTime', () => {
    it('returns estimates for each type', () => {
      expect(getEstimatedConfirmationTime('weather_bid')).toContain('seconds')
      expect(getEstimatedConfirmationTime('vehicle_rent')).toContain('seconds')
      expect(getEstimatedConfirmationTime('asset_collect')).toContain('seconds')
    })
  })
})
