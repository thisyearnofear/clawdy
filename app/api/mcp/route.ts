import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { skill, params } = body

    if (skill !== 'clawdy-agent-decision') {
      return NextResponse.json({ error: 'Unknown skill' }, { status: 400 })
    }

    const { role, agentId, assetCount, vehicleCount, currentWeatherBid } = params

    // Generate a deterministically random-feeling response based on inputs
    // This serves as our MCP simulation for the hackathon demo.
    
    // Simulate some "AI" processing latency (200-500ms)
    await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300))

    const assetPressure = Math.min(assetCount / 10, 1)
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

    if (role === 'weather') {
      const weatherOpportunity = Number((assetPressure * 0.12).toFixed(3))
      
      if (weatherOpportunity > currentWeatherBid) {
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
      if (assetCount > 0) {
        return NextResponse.json({
          requestId,
          action: 'route',
          confidence: 0.88,
          reasoning: `Identified ${assetCount} active yield opportunities. Routing execution payload to nearest cluster.`,
          metadata: {
            targetAssetId: Math.floor(Math.random() * assetCount) // Mocking an ID
          }
        })
      }
    }

    if (role === 'mobility') {
      if (assetCount > 3) {
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
       // Treasury checks logic if needed, otherwise default to observe
       return NextResponse.json({
          requestId,
          action: 'observe',
          confidence: 0.85,
          reasoning: 'Current market conditions do not justify treasury disbursement. Holding assets.',
       })
    }

    // Default fallback
    return NextResponse.json({
      requestId,
      action: 'observe',
      confidence: 0.75,
      reasoning: 'Conditions stable. Monitoring world state for anomalies.',
    })

  } catch (error) {
    console.error('[MCP Endpoint] Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
