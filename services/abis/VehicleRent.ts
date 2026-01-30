export const VEHICLE_RENT_ABI = [
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "string", "name": "vehicleId", "type": "string" },
      { "indexed": true, "internalType": "address", "name": "agent", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "expiresAt", "type": "uint256" },
      { "indexed": false, "internalType": "string", "name": "vehicleType", "type": "string" }
    ],
    "name": "VehicleRented",
    "type": "event"
  },
  {
    "inputs": [
      { "internalType": "string", "name": "vehicleId", "type": "string" },
      { "internalType": "string", "name": "vehicleType", "type": "string" },
      { "internalType": "uint256", "name": "minutesCount", "type": "uint256" }
    ],
    "name": "rent",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "string", "name": "vehicleId", "type": "string" }
    ],
    "name": "getRentStatus",
    "outputs": [
      { "internalType": "address", "name": "agent", "type": "address" },
      { "internalType": "uint256", "name": "expiresAt", "type": "uint256" },
      { "internalType": "string", "name": "vehicleType", "type": "string" }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const
