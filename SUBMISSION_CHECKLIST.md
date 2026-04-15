# Submission Checklist

## Contracts and Indexing

- [x] Deploy `WeatherAuction` to X Layer testnet — `0x723e444ee6d7da19fade372f85da06dd849bf1e0`
- [x] Deploy `VehicleRent` to X Layer testnet — `0xea88bd6121d181cfd6f60997b4bdd0297ca432fe`
- [x] Replace zero addresses in indexer configs (config.yaml + config.testnet.template.yaml)
- [ ] Run `npm run codegen` inside `indexer/` (requires Envio CLI)
- [ ] Run the indexer and confirm the GraphQL endpoint works
- [x] Set `NEXT_PUBLIC_INDEXER_GRAPHQL_URL` in `.env.local`

## Frontend Env

- [x] Set `NEXT_PUBLIC_USE_XLAYER_TESTNET`
- [x] Set `NEXT_PUBLIC_WEATHER_AUCTION_ADDRESS`
- [x] Set `NEXT_PUBLIC_VEHICLE_RENT_ADDRESS`
- [ ] Confirm the app connects to the intended X Layer network

## Product Verification

- [ ] Confirm Agentic Wallet flow works
- [ ] Confirm weather bid execution works
- [ ] Confirm mobility lease execution works
- [ ] Confirm provider and activity HUD render correctly
- [ ] Confirm leaderboard source badge flips to `Live Indexed` when the endpoint is live

## Skill Provider

- [x] Wire Onchain OS / MCP provider in `services/skillEngine.ts`
- [x] Add `NEXT_PUBLIC_SKILL_PROVIDER` env var toggle (`onchain-os` | `local-policy`)
- [x] Graceful fallback to local-policy when MCP endpoint is unreachable

## README Completion

- [x] Replace `TBD` deployment addresses in README.md
- [x] Replace `TBD` team members in README.md
- [x] Update Current Gaps section to reflect completed items
- [ ] Add final architecture visual or screenshot link
- [x] Re-read README against actual deployed behavior

## Demo and Submission

- [ ] Record the demo using [DEMO_SCRIPT.md](/Users/udingethe/Dev/clawdy/DEMO_SCRIPT.md:1)
- [ ] Upload demo to YouTube or Google Drive
- [ ] Add the demo link to the submission form
- [ ] Post project intro on X
- [ ] Add the X post link to the submission form
- [ ] Submit before the deadline
