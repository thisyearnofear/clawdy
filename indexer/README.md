# Indexer Setup

`Clawdy` ships with an Envio indexer template for both X Layer mainnet and X1 testnet.

## Files

- `config.yaml`
  - default X Layer mainnet template
- `config.testnet.template.yaml`
  - X1 testnet template

## Chain Reference

- X Layer mainnet
  - chain id: `196`
  - rpc: `https://rpc.xlayer.tech`
  - explorer: `https://www.oklink.com/xlayer`
- X1 testnet
  - chain id: `195`
  - rpc: `https://xlayertestrpc.okx.com`
  - explorer: `https://www.oklink.com/xlayer-test`

## Mainnet Setup

1. Deploy `WeatherAuction` and `VehicleRent` to X Layer mainnet.
2. Replace the zero addresses in `config.yaml`.
3. Run:

```bash
cd indexer
npm install
npm run codegen
npm run dev
```

## Testnet Setup

1. Deploy `WeatherAuction` and `VehicleRent` to X1 testnet.
2. Copy `config.testnet.template.yaml` over `config.yaml`.
3. Replace the zero addresses in `config.yaml`.
4. Run:

```bash
cd indexer
npm install
npm run codegen
npm run dev
```

## App Env Alignment

Set the frontend env vars to the same deployed contracts:

```bash
NEXT_PUBLIC_USE_XLAYER_TESTNET=true|false
NEXT_PUBLIC_WEATHER_AUCTION_ADDRESS=0x723e444ee6d7da19fade372f85da06dd849bf1e0
NEXT_PUBLIC_VEHICLE_RENT_ADDRESS=0xea88bd6121d181cfd6f60997b4bdd0297ca432fe
NEXT_PUBLIC_INDEXER_GRAPHQL_URL=http://localhost:8080/v1/graphql
```

Use `true` for X1 testnet and omit it or set `false` for X Layer mainnet.

## Before Submission

- replace both zero addresses
- point `NEXT_PUBLIC_INDEXER_GRAPHQL_URL` at the indexer endpoint you actually run
- confirm the leaderboard is reading indexed data instead of fallback snapshots
