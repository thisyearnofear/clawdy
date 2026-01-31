import {
  WeatherAuctionContract,
  VehicleRentContract,
  AgentEntity,
  WeatherControlEntity,
  VehicleRentalEntity,
} from "../generated";

// Helper to get or create an agent
async function getOrCreateAgent(address: string, context: any): Promise<AgentEntity> {
  let agent = await context.Agent.get(address);
  if (!agent) {
    agent = {
      id: address,
      totalEarned: 0n,
      totalRentPaid: 0n,
      totalWeatherBid: 0n,
      itemsCollectedCount: 0,
      lastActiveTimestamp: 0n,
      currentVehicleId: null,
    };
    context.Agent.set(agent);
  }
  return agent;
}

WeatherAuctionContract.WeatherChanged.handler(async ({ event, context }) => {
  const agentAddress = event.params.agent;
  const agent = await getOrCreateAgent(agentAddress, context);

  // Update Agent stats
  const updatedAgent = {
    ...agent,
    totalWeatherBid: agent.totalWeatherBid + event.params.amount,
    lastActiveTimestamp: BigInt(event.block.timestamp),
  };
  context.Agent.set(updatedAgent);

  // Create Weather Control record
  const weatherControl: WeatherControlEntity = {
    id: event.transaction.hash,
    agent_id: agentAddress,
    amount: event.params.amount,
    preset: event.params.preset,
    expiresAt: event.params.expiresAt,
    timestamp: BigInt(event.block.timestamp),
  };
  context.WeatherControl.set(weatherControl);
});

VehicleRentContract.VehicleRented.handler(async ({ event, context }) => {
  const agentAddress = event.params.agent;
  const agent = await getOrCreateAgent(agentAddress, context);

  // Update Agent stats
  const updatedAgent = {
    ...agent,
    totalRentPaid: agent.totalRentPaid + event.params.amount, // Note: Need amount in event ideally, using placeholder logic
    currentVehicleId: event.params.vehicleId,
    lastActiveTimestamp: BigInt(event.block.timestamp),
  };
  context.Agent.set(updatedAgent);

  // Create Vehicle Rental record
  const vehicleRental: VehicleRentalEntity = {
    id: event.params.vehicleId,
    agent_id: agentAddress,
    vehicleType: event.params.vehicleType,
    expiresAt: event.params.expiresAt,
    timestamp: BigInt(event.block.timestamp),
  };
  context.VehicleRental.set(vehicleRental);
});
