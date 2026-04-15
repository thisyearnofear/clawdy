# Clawdy Agent Protocol

This document defines the agent-facing surface for the X Layer submission build of `Clawdy`.

## Network

- Primary target: `X Layer`
- Optional testing target: `X Layer Testnet`

## Agent Roles

### Operator

- connects the wallet
- authorizes the Agentic Wallet budget
- can override or supervise agent activity

### Scout Agent

- listens for world updates
- identifies the nearest or highest-value opportunities
- provides route candidates to execution roles

### Weather Agent

- bids for weather states when expected yield is worth the spend
- focuses on short control windows and tactical advantage

### Mobility Agent

- leases vehicles
- translates route targets into movement and interaction commands

### Treasury Agent

- approves spend thresholds
- preserves the earn-pay-earn loop
- will be the best place to attach skill-based decisioning

## Public Runtime Surface

The primary interface is the global `window.clawdy` object.

### Observation

Listen for `clawdy:state` to receive world state snapshots.

```js
window.addEventListener('clawdy:state', (event) => {
  const world = event.detail
  // world.food
  // world.vehicles
  // world.bounds
})
```

### Control

- `clawdy.getState()`
- `clawdy.getSessions()`
- `clawdy.getChain()`
- `clawdy.authorize(agentId)`
- `clawdy.requestSessionPermissions(address)`
- `clawdy.bid(agentId, amountInEth, preset)`
- `clawdy.drive(agentId, vehicleId, inputs)`
- `clawdy.toggleAutoPilot(agentId)`

## Economic Layer

### Weather Auction

- Contract address: `NEXT_PUBLIC_WEATHER_AUCTION_ADDRESS`
- Purpose: temporary control of weather conditions through bidding
- Tradeoff: higher spend should only happen when increased yield is justified

### Vehicle Rental

- Contract address: `NEXT_PUBLIC_VEHICLE_RENT_ADDRESS`
- Purpose: temporary vehicle control for route efficiency or combat capability
- Tradeoff: mobility spend must support net-positive earnings

## Agentic Wallet Flow

Before an agent acts autonomously:

1. the operator connects a wallet on X Layer
2. the operator grants session-like execution permissions
3. the runtime uses those permissions for approved onchain calls
4. the UI reflects whether autonomous execution is active

## Skill Integration Target

The runtime now has a pluggable skill-decision seam.

Current provider:

- `local-policy`
  - used as the internal policy engine while external MCP wiring is unavailable in this workspace

Target provider:

- **Onchain OS / MCP**
  - intended to replace the local provider without changing the rest of the runtime flow

Planned usage:

- skill-assisted bidding decisions
- route or target evaluation
- treasury policy checks before spend
- skill-assisted vehicle lease execution

If time allows, Uniswap-oriented treasury behavior will be added after the MCP path is visible and working.
