# Submission Checklist

## Contracts and Indexing

- [ ] Deploy `WeatherAuction` to **0G mainnet** — `TBD`
- [ ] Deploy `VehicleRent` to **0G mainnet** — `TBD`
- [ ] Add 0G Chain Scan explorer links for both contracts (`https://chainscan.0g.ai/address/<addr>`)
- [ ] (Optional) Run the indexer and confirm the GraphQL endpoint works
- [ ] (Optional) Set `NEXT_PUBLIC_INDEXER_GRAPHQL_URL` in `.env.local`

## Frontend Env

- [x] Set `NEXT_PUBLIC_USE_0G_TESTNET` (or legacy `NEXT_PUBLIC_USE_XLAYER_TESTNET`)
- [x] Set `NEXT_PUBLIC_WEATHER_AUCTION_ADDRESS`
- [x] Set `NEXT_PUBLIC_VEHICLE_RENT_ADDRESS`
- [ ] Confirm the app connects to the intended 0G network

## Product Verification

- [ ] Confirm Agentic Wallet flow works
- [ ] Confirm weather bid execution works
- [ ] Confirm mobility lease execution works
- [ ] Confirm provider and activity HUD render correctly
- [ ] Confirm any leaderboard source badge flips to `Live Indexed` when the endpoint is live (if indexer is used)

## 0G Storage (Required Proof)

- [ ] Configure `DEPLOYER_PRIVATE_KEY` for `/api/0g-storage` uploads
- [ ] Confirm `/api/0g-storage?health=1` returns `ok: true`
- [ ] Confirm a state upload returns `{ rootHash, txHash }`
- [ ] Confirm restore path works (refresh → state restored from 0G Storage)

## README Completion

- [ ] Fill mainnet deployment addresses in README.md
- [ ] Fill team members in README.md
- [ ] Add a final architecture visual or at least the Mermaid diagram + a screenshot link
- [ ] Verify README matches deployed reality

## Demo and Submission

- [ ] Record the demo using [DEMO_SCRIPT.md](./DEMO_SCRIPT.md)
- [ ] Upload demo to YouTube or Google Drive
- [ ] Add the demo link to the submission form
- [ ] Submit via HackQuest before the deadline
