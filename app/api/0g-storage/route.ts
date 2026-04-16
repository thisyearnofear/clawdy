import { NextRequest, NextResponse } from 'next/server'
import { writeFileSync, readFileSync, unlinkSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// 0G Storage network config
const ZG_RPC_URL = process.env.ZG_RPC_URL || 'https://evmrpc-mainnet.0g.ai'
const ZG_INDEXER_URL = process.env.ZG_INDEXER_URL || 'https://indexer-storage-mainnet-standard.0g.ai'
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || ''

/**
 * GET — download state from 0G Storage or health check
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  // Health check
  if (searchParams.get('health') === '1') {
    return NextResponse.json({
      ok: true,
      configured: !!PRIVATE_KEY,
      network: 'mainnet',
      indexer: ZG_INDEXER_URL,
    })
  }

  const rootHash = searchParams.get('rootHash')
  if (!rootHash) {
    return NextResponse.json({ error: 'rootHash query param required' }, { status: 400 })
  }

  try {
    const { Indexer } = await import('@0gfoundation/0g-ts-sdk')
    const indexer = new Indexer(ZG_INDEXER_URL)

    const tmpDir = join(tmpdir(), 'clawdy-0g')
    mkdirSync(tmpDir, { recursive: true })
    const outPath = join(tmpDir, `${rootHash.slice(0, 16)}.json`)

    const err = await indexer.download(rootHash, outPath, true)
    if (err) {
      return NextResponse.json({ error: `Download failed: ${err}` }, { status: 500 })
    }

    const content = readFileSync(outPath, 'utf-8')
    try { unlinkSync(outPath) } catch { /* ignore cleanup errors */ }

    const state = JSON.parse(content)
    return NextResponse.json({ state, rootHash })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

/**
 * POST — upload state to 0G Storage
 * Body: { key: string, state: object }
 */
export async function POST(req: NextRequest) {
  if (!PRIVATE_KEY) {
    return NextResponse.json({ error: 'DEPLOYER_PRIVATE_KEY not configured' }, { status: 503 })
  }

  try {
    const body = await req.json()
    const { key, state } = body
    if (!key || !state) {
      return NextResponse.json({ error: 'key and state required' }, { status: 400 })
    }

    const { ZgFile, Indexer } = await import('@0gfoundation/0g-ts-sdk')
    const { ethers } = await import('ethers')

    const provider = new ethers.JsonRpcProvider(ZG_RPC_URL)
    const signer = new ethers.Wallet(PRIVATE_KEY, provider)
    const indexer = new Indexer(ZG_INDEXER_URL)

    // Write state to temp file
    const tmpDir = join(tmpdir(), 'clawdy-0g')
    mkdirSync(tmpDir, { recursive: true })
    const tmpPath = join(tmpDir, `${key.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.json`)
    writeFileSync(tmpPath, JSON.stringify(state, null, 2))

    // Create ZgFile and upload
    const file = await ZgFile.fromFilePath(tmpPath)
    const [tree, treeErr] = await file.merkleTree()
    if (treeErr !== null) {
      await file.close()
      try { unlinkSync(tmpPath) } catch { /* ignore */ }
      return NextResponse.json({ error: `Merkle tree error: ${treeErr}` }, { status: 500 })
    }

    const rootHash = tree?.rootHash()

    const [tx, uploadErr] = await indexer.upload(file, ZG_RPC_URL, signer)
    await file.close()
    try { unlinkSync(tmpPath) } catch { /* ignore */ }

    if (uploadErr !== null) {
      return NextResponse.json({ error: `Upload error: ${uploadErr}` }, { status: 502 })
    }

    const txHash = tx && 'txHash' in tx ? tx.txHash : undefined

    return NextResponse.json({
      rootHash,
      txHash,
      key,
      timestamp: Date.now(),
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
