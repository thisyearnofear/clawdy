import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { skill, params } = body

    if (skill !== 'clawdy-agent-decision') {
      return NextResponse.json({ error: 'Unknown skill' }, { status: 400 })
    }

    if (!params || typeof params !== 'object') {
      return NextResponse.json({ error: 'params object required' }, { status: 400 })
    }

    const { role, agentId, assetCount, vehicleCount, currentWeatherBid } = params

    if (typeof role !== 'string' || !role) {
      return NextResponse.json({ error: 'role required' }, { status: 400 })
    }
    if (typeof agentId !== 'string' || !agentId) {
      return NextResponse.json({ error: 'agentId required' }, { status: 400 })
    }
    const assets = typeof assetCount === 'number' && assetCount >= 0 ? assetCount : 0
    const vehicles = typeof vehicleCount === 'number' && vehicleCount >= 0 ? vehicleCount : 0
    const weatherBid = typeof currentWeatherBid === 'number' ? currentWeatherBid : 0

    await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300))

    const assetPressure = Math.min(assets / 10, 1)
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

    if (role === 'weather') {
      const weatherOpportunity = Number((assetPressure * 0.12).toFixed(3))
      if (weatherOpportunity > weatherBid) {
        return NextResponse.json({
          requestId,
          action: 'bid',
          confidence: Math.min(0.98, 0.6 + assetPressure * 0.3),
          reasoning: `High asset density detected. Bidding ${weatherOpportunity} ETH to secure optimal weather conditions for yield generation.`,
          metadata: {
            recommendedBid: weatherOpportunity,
            preset: assetPressure > 0.6 ? 'stormy' : 'sunset',
          }
        })
      }
    }

    if (role === 'scout') {
      if (assets > 0) {
        return NextResponse.json({
          requestId,
          action: 'route',
          confidence: 0.88,
          reasoning: `Identified ${assets} active yield opportunities. Routing execution payload to nearest cluster.`,
          metadata: {
            targetAssetId: Math.floor(Math.random() * assets)
          }
        })
      }
    }

    if (role === 'mobility') {
      if (assets > 3) {
        return NextResponse.json({
          requestId,
          action: 'rent',
          confidence: 0.92,
          reasoning: 'Asset density requires high-speed collection. Approving mobility lease for route execution.',
          metadata: {
            recommendedVehicle: 'speedster'
          }
        })
      }
    }

    if (role === 'treasury') {
      return NextResponse.json({
        requestId,
        action: 'observe',
        confidence: 0.85,
        reasoning: 'Current market conditions do not justify treasury disbursement. Holding assets.',
      })
    }

    return NextResponse.json({
      requestId,
      action: 'observe',
      confidence: 0.75,
      reasoning: 'Conditions stable. Monitoring world state for anomalies.',
    })
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
