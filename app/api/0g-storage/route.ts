import { NextRequest, NextResponse } from 'next/server'
import { writeFile, readFile, unlink, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

const ZG_RPC_URL = process.env.ZG_RPC_URL || 'https://evmrpc-mainnet.0g.ai'
const ZG_INDEXER_URL = process.env.ZG_INDEXER_URL || 'https://indexer-storage-mainnet-standard.0g.ai'
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || ''

const MAX_KEY_LENGTH = 128
const MAX_STATE_SIZE = 512 * 1024 // 512KB for state payload
const API_SECRET = process.env.API_SECRET || ''

function validateAuth(req: NextRequest): boolean {
  if (!API_SECRET) return true // no secret configured = open (dev mode)
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${API_SECRET}`
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  if (searchParams.get('health') === '1') {
    return NextResponse.json({
      ok: true,
      network: 'mainnet',
      indexer: ZG_INDEXER_URL,
    })
  }

  const rootHash = searchParams.get('rootHash')
  if (!rootHash || !/^[a-fA-F0-9]{1,128}$/.test(rootHash)) {
    return NextResponse.json({ error: 'Valid rootHash query param required' }, { status: 400 })
  }

  try {
    const { Indexer } = await import('@0gfoundation/0g-ts-sdk')
    const indexer = new Indexer(ZG_INDEXER_URL)

    const tmpDir = join(tmpdir(), 'clawdy-0g')
    await mkdir(tmpDir, { recursive: true })
    const outPath = join(tmpDir, `${rootHash.slice(0, 16)}.json`)

    const err = await indexer.download(rootHash, outPath, true)
    if (err) {
      return NextResponse.json({ error: `Download failed: ${err}` }, { status: 500 })
    }

    const content = await readFile(outPath, 'utf-8')
    try { await unlink(outPath) } catch { /* cleanup best-effort */ }

    const state = JSON.parse(content)
    return NextResponse.json({ state, rootHash })
  } catch {
    return NextResponse.json({ error: 'Download failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!PRIVATE_KEY) {
    return NextResponse.json({ error: 'Storage not configured' }, { status: 503 })
  }

  if (!validateAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let tmpPath: string | undefined
  try {
    const body = await req.json()
    const { key, state } = body
    if (!key || !state) {
      return NextResponse.json({ error: 'key and state required' }, { status: 400 })
    }
    if (typeof key !== 'string' || key.length > MAX_KEY_LENGTH) {
      return NextResponse.json({ error: `key must be a string <= ${MAX_KEY_LENGTH} chars` }, { status: 400 })
    }

    const stateStr = JSON.stringify(state)
    if (stateStr.length > MAX_STATE_SIZE) {
      return NextResponse.json({ error: 'State payload too large' }, { status: 413 })
    }

    const { ZgFile, Indexer } = await import('@0gfoundation/0g-ts-sdk')
    const { ethers } = await import('ethers')

    const provider = new ethers.JsonRpcProvider(ZG_RPC_URL)
    const signer = new ethers.Wallet(PRIVATE_KEY, provider)
    const indexer = new Indexer(ZG_INDEXER_URL)

    const tmpDir = join(tmpdir(), 'clawdy-0g')
    await mkdir(tmpDir, { recursive: true })
    tmpPath = join(tmpDir, `${key.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.json`)
    await writeFile(tmpPath, JSON.stringify(state, null, 2))

    const file = await ZgFile.fromFilePath(tmpPath)
    const [tree, treeErr] = await file.merkleTree()
    if (treeErr !== null) {
      await file.close()
      return NextResponse.json({ error: `Merkle tree error: ${treeErr}` }, { status: 500 })
    }

    const rootHash = tree?.rootHash()

    const [tx, uploadErr] = await indexer.upload(file, ZG_RPC_URL, signer)
    await file.close()

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
  } catch {
    return NextResponse.json({ error: 'Upload failed' }, { status: 502 })
  } finally {
    if (tmpPath) {
      try { await unlink(tmpPath) } catch { /* cleanup best-effort */ }
    }
  }
}
