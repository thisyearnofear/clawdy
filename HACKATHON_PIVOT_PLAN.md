# Clawdy X Layer Hackathon Pivot Plan

## Objective

Turn `Clawdy` into a credible submission for the **X Layer Arena** by repositioning it from a Base-native agentic sandbox into an **X Layer-native agentic game economy** with:

- an onchain agent identity
- explicit agent roles
- at least one real Onchain OS or Uniswap skill integration
- a clear earn-pay-earn loop
- public deployment artifacts and a submission-grade README

This document is the shared execution plan. It is organized for **parallel work** so multiple contributors can move at once without blocking each other.

## Current Status

### Decision Lock

- Arena: `X Layer Arena`
- Current skill path: `Onchain OS / MCP first`, with a fallback local policy provider already wired into the runtime
- Runtime model: `single runtime, multiple documented agent roles`
- Primary prize angles still targeted:
  - Best economy loop
  - Most active agent
  - Best MCP integration

### What Is Already Done

- X Layer chain wiring is in place in app config and wallet UX.
- Base-first product framing has been removed from the app and docs.
- Agent roles are centralized and visible in the UI.
- A pluggable skill-decision seam is implemented.
- The fallback provider can already execute:
  - weather bids
  - mobility leases
- The terminal exposes provider state and decision/execution logs.
- Leaderboard and HUD now show proof-oriented activity metrics.
- Runtime metrics and indexed metrics are unified behind a single adapter.
- The indexer contract event mismatch for vehicle rent amounts has been fixed in:
  - contract
  - ABI
  - schema
  - event handler
- X Layer mainnet and X1 testnet indexer templates are now documented.

### What Is Not Done Yet

- real Onchain OS MCP provider wiring
- deployed X Layer contract addresses
- live indexer endpoint
- final submission README fields:
  - real deployment addresses
  - team members
  - final architecture graphic
- demo recording assets
- X post / submission copy

### Current Risk Level

- Product/story alignment: `much lower than at start`
- Submission completeness: `medium risk`
- External dependency risk: `high`
  - deployment addresses
  - MCP server access
  - live indexer endpoint

## Recommended Submission Positioning

### Arena

Target the **X Layer Arena**, not the Skills Arena.

### Core Pitch

`Clawdy` is an agentic multiplayer sandbox on X Layer where autonomous agents compete for weather control, rent specialized vehicles, forage for rewards, and optimize their behavior through onchain skills.

### Strongest Prize Angles

Primary angles:

- Best economy loop
- Most active agent
- Best MCP integration

Secondary angle:

- Best x402 application, if payment-gated actions can be reframed as agent-triggered paid capabilities

## Current Repo Assessment

### What Already Exists

- Next.js frontend with a distinctive interactive 3D world
- wallet connectivity and autonomy/session-permission concepts
- agent control surface and agent/world state bridge
- onchain game mechanics:
  - weather bidding
  - vehicle rental
- Envio-style indexer for onchain activity tracking

### What Is Missing for This Hackathon

- X Layer chain support and deployed contracts on X Layer
- explicit use of Onchain OS or Uniswap skills
- submission-ready README
- explicit Agentic Wallet framing in product and docs
- role definitions if multiple agents are used
- final deployment addresses and architecture docs
- short demo and submission assets

### Current Risks

- current chain references are Base-centric rather than X Layer-centric
- README is still boilerplate
- hackathon judges may not give credit for "agentic" claims unless skill usage is concrete and visible
- the indexer appears to have at least one event field mismatch and needs validation

## Product Reframe

## New Narrative

`Clawdy` becomes an **agent-operated onchain simulation** on X Layer:

- agents observe the world state
- agents decide whether to spend resources for control
- agents use onchain skills to optimize actions
- agents earn through successful play
- all major economic actions settle onchain

## Agent Roles

Define at least these roles in product and README:

- `Scout Agent`: watches world state, identifies profitable food/resource opportunities
- `Weather Agent`: bids for weather changes when expected yield exceeds cost
- `Mobility Agent`: rents vehicles and routes movement for resource capture
- `Treasury Agent`: manages spending thresholds and transaction policy

If implementation time is tight, these can initially map to one runtime with distinct documented modes rather than four independent services.

## Skill Integration Options

At least one of these must be real and visible in the shipped project.

### Option A: Onchain OS MCP Integration

Use MCP-driven skill calls to power agent decisions or actions.

Good fit:

- expose world state to an agent workflow
- let an agent invoke a skill to evaluate whether to bid, rent, or route
- log skill outputs in the terminal UI

Why this helps:

- strongest alignment with "Best MCP integration"
- supports the agentic framing directly

### Option B: Uniswap Skill Integration

Use Uniswap-related skill functionality as part of agent treasury behavior.

Good fit:

- treasury agent swaps into a needed token before paying for actions
- reward flows can be converted or optimized via Uniswap-driven decisions

Why this helps:

- strongest alignment with skill usage requirement
- easier to explain as an onchain financial agent loop

### Option C: Both

Best judging posture if feasible:

- Onchain OS MCP for decisions and orchestration
- Uniswap skill for treasury/token routing

## Submission Architecture Target

The target architecture should be documented and, where possible, implemented:

1. Frontend on Next.js
2. X Layer wallet connection and chain-aware contract interaction
3. Agentic Wallet/session-permission flow for autonomous execution
4. Game contracts deployed on X Layer
5. Indexer for onchain activity and leaderboard metrics
6. Agent layer using at least one Onchain OS or Uniswap skill
7. README and demo assets that make the loop obvious to judges

## Execution Strategy

Work in phases. Each phase has clear deliverables and can be split across parallel owners.

## Phase 0: Decision Lock

### Goal

Lock the submission framing before coding further.

### Deliverables

- final arena choice: `X Layer Arena`
- final one-sentence pitch
- final skill integration choice:
  - Onchain OS only
  - Uniswap only
  - both
- final agent role list

### Acceptance Criteria

- everyone is working toward the same product story
- the README structure can be derived from the chosen story

### Parallel Work

- Product track:
  - finalize pitch and prize angle
- Technical track:
  - confirm X Layer chain parameters, deployment path, and contract compatibility
- Integration track:
  - choose the concrete skill integration path

## Phase 1: Chain Pivot to X Layer

### Goal

Move the app from Base-oriented framing to X Layer-oriented framing.

### Deliverables

- wallet config updated for X Layer
- contract addresses parameterized for X Layer deployment
- all visible Base references removed or rewritten where appropriate
- metadata and docs updated to X Layer language

### Status

`Substantially complete`

Completed:

- X Layer and X1 testnet chain support wired into the frontend config
- wallet UX updated to target X Layer
- app metadata updated to X Layer framing
- Base-oriented product copy replaced in active UI/docs

Remaining:

- replace placeholder contract addresses with deployed X Layer addresses

### Acceptance Criteria

- a user can connect on X Layer
- app no longer markets itself as a Base-native experience
- env/config structure supports X Layer deploys cleanly

### Parallel Work

#### Workstream A: Frontend Chain Wiring

Scope:

- wallet config
- providers
- connect wallet UX
- network labels

Files likely involved:

- `services/web3Config.ts`
- `app/providers.tsx`
- `components/ui/ConnectWallet.tsx`
- `app/layout.tsx`

#### Workstream B: Contract Config

Scope:

- env vars
- address wiring
- transaction helpers

Files likely involved:

- `services/AgentProtocol.ts`
- `services/abis/*`
- deployment notes to be added

#### Workstream C: Docs and Terminology

Scope:

- rewrite agent protocol docs
- remove Base references

Files likely involved:

- `AGENT.md`
- `README.md`

## Phase 2: Agentic Wallet and Role Clarity

### Goal

Make the project legibly "agentic" to judges rather than merely interactive.

### Deliverables

- explicit Agentic Wallet flow in product copy and docs
- role definitions for each agent
- visible autonomy state in the UI
- documented action permissions and spending policy

### Status

`Substantially complete`

Completed:

- Agentic Wallet framing is visible in docs and wallet UI
- agent roles are centralized in shared runtime metadata
- autonomy state is visible in wallet UI and terminal UI
- role labels and missions are visible in the app

### Acceptance Criteria

- judges can understand who the agents are
- judges can understand how autonomous actions are authorized
- README clearly explains agent roles

### Parallel Work

#### Workstream D: Agent UX

Scope:

- make agent roles visible in UI
- surface autonomy and active policy state
- improve terminal messaging to show agent decisions

Files likely involved:

- `components/ui/AgentTerminal.tsx`
- `components/ui/ConnectWallet.tsx`

#### Workstream E: Agent Model and Docs

Scope:

- normalize agent role definitions
- document command surface and permissions

Files likely involved:

- `AGENT.md`
- `services/AgentProtocol.ts`
- README sections to be created

## Phase 3: Core Skill Integration

### Goal

Ship at least one real Onchain OS or Uniswap skill integration that is central to the experience.

### Deliverables

At minimum:

- one live integration implemented in code
- one UI surface showing skill usage or its outcomes
- one README section explaining why the skill matters to gameplay

### Status

`Partially complete`

Completed:

- pluggable skill-decision layer implemented
- fallback provider (`local-policy`) is live
- weather bid and mobility lease execution both run through that seam
- terminal surfaces provider status and decision/execution outputs
- README and AGENT docs explain the seam and the MCP upgrade path

Remaining:

- replace fallback provider with a real Onchain OS MCP provider

### Acceptance Criteria

- the integration is not just mentioned in docs
- the agent uses the integration in a decision or action loop
- judges can observe the effect in demo flow

### Parallel Work

#### Workstream F: Onchain OS / MCP Integration

Possible scope:

- add a skill invocation layer
- connect agent decision-making to MCP results
- show MCP-triggered recommendations in terminal/log stream

#### Workstream G: Uniswap Skill Integration

Possible scope:

- treasury-oriented token pathing or swap prep
- action funding via a visible token-management step
- reward recycling into the gameplay loop

#### Workstream H: Skill Observability

Scope:

- terminal logs
- badges/status chips
- leaderboard indicators

Files likely involved:

- `components/ui/AgentTerminal.tsx`
- `components/ui/Leaderboard.tsx`
- new integration service files

## Phase 4: Economy Loop and Scoring Alignment

### Goal

Make the product score well on the hackathon rubric.

### Desired Loop

1. agent observes world state
2. skill evaluates opportunity
3. treasury approves spend
4. agent bids or rents onchain
5. agent captures better rewards
6. reward data is indexed and visualized
7. agent repeats

### Deliverables

- explicit earn-pay-earn loop in UI and README
- leaderboard or activity metrics showing agent performance
- metrics that support "Most active agent" and "Best economy loop"

### Status

`In progress`

Completed:

- runtime tracks decisions, executed bids, executed rents, and collections
- leaderboard shows proof-oriented metrics
- HUD shows provider and aggregate execution counts
- activity adapter merges runtime and indexed sources
- UI now labels whether data is:
  - live indexed
  - fallback snapshot
  - runtime only

Remaining:

- point the app at a live X Layer indexer endpoint
- replace fallback snapshot mode with real indexed data

### Acceptance Criteria

- loop is understandable within 30 seconds of demo
- onchain actions visibly support gameplay advantage
- activity data is queryable and presentable

### Parallel Work

#### Workstream I: Economy Design

Scope:

- tune reward and cost logic
- make spending thresholds rational
- ensure the loop is explainable

Files likely involved:

- `services/AgentProtocol.ts`
- contracts if updated

#### Workstream J: Indexer and Metrics

Scope:

- fix event/schema mismatches
- compute leaderboard metrics
- expose onchain activity stats

Files likely involved:

- `indexer/src/EventHandlers.ts`
- `indexer/schema.graphql`
- `indexer/config.yaml`
- `components/ui/Leaderboard.tsx`

## Phase 5: Submission Assets

### Goal

Make the repo judge-friendly and submission-ready.

### Deliverables

- complete README
- deployment addresses
- architecture diagram
- role definitions
- skill usage explanation
- team section
- X Layer ecosystem positioning
- demo script
- X post draft

### Status

`In progress`

Completed:

- README has been fully reframed for X Layer submission positioning
- indexer setup docs were added
- deployment/env alignment is documented

Remaining:

- fill in deployment addresses
- fill in team section
- add final demo script
- add X post draft
- add architecture diagram or equivalent visual

### Acceptance Criteria

- README satisfies every mandatory field from the hackathon brief
- a reviewer can clone the repo and understand the product without extra context
- demo can be recorded in one take

### Parallel Work

#### Workstream K: README Rewrite

Required sections:

- project intro
- architecture overview
- deployment address
- Onchain OS / Uniswap skill usage
- working mechanics
- team members
- positioning in the X Layer ecosystem

#### Workstream L: Demo and Growth Assets

Scope:

- 1 to 3 minute demo outline
- thumbnail/screenshots
- X post copy
- submission form checklist

## Phase 6: Final Verification and Packaging

### Goal

Reduce preventable judge friction before submission.

### Deliverables

- lint/build pass
- runtime sanity check
- chain/env setup instructions verified
- README reviewed against actual behavior

### Status

`Not complete`

Completed:

- focused lint passes for newly touched runtime, activity, and UI slices

Remaining:

- repo-wide lint/build sanity pass
- end-to-end run against deployed contracts and indexer
- submission checklist validation

### Acceptance Criteria

- no obvious broken references
- docs match deployed reality
- final repo is public-ready

### Parallel Work

#### Workstream M: Code Verification

- build
- lint
- runtime smoke test

#### Workstream N: Submission Verification

- README requirement checklist
- form input checklist
- link validation

## Cross-Cutting Decisions

These decisions affect multiple phases and should be made early.

### Decision 1: Single-Agent Runtime vs Multi-Agent Runtime

Recommendation:

- implement as a single runtime with multiple documented agent roles first
- expand to independent agents only if time remains

Reason:

- easier to ship
- still satisfies the README role-clarity requirement

### Decision 2: Real Onchain Actions vs Simulated Actions

Recommendation:

- real onchain actions for weather bidding and vehicle rental
- avoid overpromising autonomous loops that are not actually executed

Reason:

- judges will inspect repo and chain activity

### Decision 3: Integration Breadth vs Depth

Recommendation:

- one deep, visible skill integration is better than multiple shallow mentions

### Decision 4: MCP First vs Uniswap First

Recommendation:

- if only one can ship, favor **Onchain OS / MCP integration**

Reason:

- this project is already an agentic app, so decision-layer integration is the most natural fit

## Parallel Collaboration Model

Use this split so contributors can work at the same time.

### Track 1: Chain and Contracts

Owner focus:

- X Layer support
- deployments
- contract config
- transaction flow

Primary outputs:

- working X Layer addresses
- deploy notes
- verified onchain paths

### Track 2: Agent and Skill Layer

Owner focus:

- agent roles
- skill integration
- decision logging
- autonomy mechanics

Primary outputs:

- real skill-backed agent flow
- visible agent decisions

### Track 3: Indexing and Metrics

Owner focus:

- event handling
- leaderboard stats
- activity visibility

Primary outputs:

- judge-friendly proof of activity
- metrics for demo and README

### Track 4: Docs and Submission

Owner focus:

- README
- architecture
- demo script
- final packaging

Primary outputs:

- submission completeness
- strong narrative alignment

## Immediate Task Order

This is the recommended execution order from here.

1. Wire a real Onchain OS MCP provider into the existing skill seam.
2. Deploy `WeatherAuction` and `VehicleRent` to X Layer or X1 testnet.
3. Replace placeholder indexer addresses and run the Envio indexer.
4. Point `NEXT_PUBLIC_INDEXER_GRAPHQL_URL` at the live indexer endpoint.
5. Fill final README fields:
   - deployment addresses
   - team
   - final project positioning copy
6. Record demo and package submission assets.

## Working Checklist

### Must-Have Before Submission

- [ ] X Layer support implemented
- [ ] deployed contract addresses available
- [ ] Agentic Wallet flow explained
- [ ] agent roles documented
- [ ] at least one real Onchain OS or Uniswap skill integration
- [ ] README rewritten to hackathon requirements
- [ ] public repo ready
- [ ] demo link prepared

### Progress Snapshot

- [x] X Layer support implemented
- [ ] deployed contract addresses available
- [x] Agentic Wallet flow explained
- [x] agent roles documented
- [ ] at least one real Onchain OS or Uniswap skill integration
- [x] README rewritten to hackathon requirements
- [ ] public repo ready
- [ ] demo link prepared

### Nice-to-Have

- [ ] both Onchain OS and Uniswap integrations
- [ ] improved leaderboard with onchain metrics
- [ ] X post with visuals
- [ ] extra judge-facing observability in UI

## Recommended First Build Slice

If we want the fastest path to a credible submission, start with:

1. X Layer chain configuration
2. Agent role definition in UI and docs
3. one concrete Onchain OS / MCP integration path
4. README rewrite immediately after those are stable

This path gets the project from "interesting but off-brief" to "recognizably aligned with the hackathon" as quickly as possible.

## Suggested Next Parallel Split

### Track A: External Integration

- wire real Onchain OS MCP provider
- verify provider output against the existing runtime seam

### Track B: Deployment and Indexing

- deploy contracts to X Layer or X1 testnet
- replace zero addresses in indexer config
- bring up the indexer endpoint

### Track C: Submission Packaging

- finalize README fields
- prepare demo script
- draft X post and submission checklist
