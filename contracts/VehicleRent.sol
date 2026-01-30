// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title VehicleRent
 * @dev A contract for agents to rent control of specific vehicles in the Clawdy ecosystem.
 */
contract VehicleRent {
    struct RentSession {
        address agent;
        uint256 expiresAt;
        string vehicleType;
    }

    // vehicleId => RentSession
    mapping(string => RentSession) public rentals;
    
    uint256 public rentRatePerMinute = 0.001 ether;

    event VehicleRented(string indexed vehicleId, address indexed agent, uint256 expiresAt, string vehicleType);
    
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    /**
     * @dev Rent a vehicle for a specific duration.
     * Overwrites current control if expired or if higher price is paid (simple model for now).
     */
    function rent(string calldata vehicleId, string calldata vehicleType, uint256 minutesCount) external payable {
        require(minutesCount >= 1, "Min 1 minute");
        uint256 requiredAmount = rentRatePerMinute * minutesCount;
        require(msg.value >= requiredAmount, "Insufficient rent payment");

        RentSession storage session = rentals[vehicleId];
        require(block.timestamp > session.expiresAt, "Vehicle already rented and active");

        rentals[vehicleId] = RentSession({
            agent: msg.sender,
            expiresAt: block.timestamp + (minutesCount * 1 minutes),
            vehicleType: vehicleType
        });

        emit VehicleRented(vehicleId, msg.sender, rentals[vehicleId].expiresAt, vehicleType);
    }

    function getRentStatus(string calldata vehicleId) external view returns (address agent, uint256 expiresAt, string memory vehicleType) {
        RentSession memory s = rentals[vehicleId];
        return (s.agent, s.expiresAt, s.vehicleType);
    }

    function withdraw() external {
        require(msg.sender == owner, "Only owner");
        payable(owner).transfer(address(this).balance);
    }
}
