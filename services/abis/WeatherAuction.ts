export const WEATHER_AUCTION_ABI = [
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "agent", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "expiresAt", "type": "uint256" },
      { "indexed": false, "internalType": "string", "name": "preset", "type": "string" }
    ],
    "name": "WeatherChanged",
    "type": "event"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "duration", "type": "uint256" },
      { "internalType": "string", "name": "preset", "type": "string" },
      { "internalType": "uint256", "name": "volume", "type": "uint256" },
      { "internalType": "uint256", "name": "growth", "type": "uint256" },
      { "internalType": "uint256", "name": "speed", "type": "uint256" },
      { "internalType": "uint32", "name": "color", "type": "uint32" }
    ],
    "name": "bid",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getCurrentConfig",
    "outputs": [
      {
        "components": [
          { "internalType": "address", "name": "agent", "type": "address" },
          { "internalType": "uint256", "name": "amount", "type": "uint256" },
          { "internalType": "uint256", "name": "expiresAt", "type": "uint256" },
          {
            "components": [
              { "internalType": "string", "name": "preset", "type": "string" },
              { "internalType": "uint256", "name": "volume", "type": "uint256" },
              { "internalType": "uint256", "name": "growth", "type": "uint256" },
              { "internalType": "uint256", "name": "speed", "type": "uint256" },
              { "internalType": "uint32", "name": "color", "type": "uint32" }
            ],
            "internalType": "struct WeatherAuction.WeatherConfig",
            "name": "config",
            "type": "tuple"
          }
        ],
        "internalType": "struct WeatherAuction.Bid",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const
