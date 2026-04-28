// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title WeatherAuction
 * @dev A contract for autonomous agents to bid for weather control in the Clawdy ecosystem.
 * Implements a time-locked highest-bidder-wins mechanism.
 */
contract WeatherAuction {
    struct WeatherConfig {
        string preset;
        uint256 volume;
        uint256 growth;
        uint256 speed;
        uint32 color; // Packed RGB
    }

    struct Bid {
        address agent;
        uint256 amount;
        uint256 expiresAt;
        WeatherConfig config;
    }

    Bid public currentControl;
    uint256 public constant MIN_CONTROL_DURATION = 1 minutes;
    uint256 public constant MAX_CONTROL_DURATION = 1 hours;

    event WeatherChanged(address indexed agent, uint256 amount, uint256 expiresAt, string preset);
    event FundsWithdrawn(address indexed owner, uint256 amount);

    address public owner;

    constructor() {
        owner = msg.sender;
    }

    /**
     * @dev Place a bid to take control of the weather.
     * The bid must be higher than the current active bid or the current bid must be expired.
     */
    function bid(
        uint256 duration,
        string calldata preset,
        uint256 volume,
        uint256 growth,
        uint256 speed,
        uint32 color
    ) external payable {
        require(duration >= MIN_CONTROL_DURATION && duration <= MAX_CONTROL_DURATION, "Invalid duration");
        
        bool isExpired = block.timestamp > currentControl.expiresAt;
        require(isExpired || msg.value > currentControl.amount, "Bid too low");

        currentControl = Bid({
            agent: msg.sender,
            amount: msg.value,
            expiresAt: block.timestamp + duration,
            config: WeatherConfig({
                preset: preset,
                volume: volume,
                growth: growth,
                speed: speed,
                color: color
            })
        });

        emit WeatherChanged(msg.sender, msg.value, currentControl.expiresAt, preset);
    }

    function getCurrentConfig() external view returns (Bid memory) {
        return currentControl;
    }

    function withdraw() external {
        require(msg.sender == owner, "Only owner");
        uint256 amount = address(this).balance;
        payable(owner).transfer(amount);
        emit FundsWithdrawn(owner, amount);
    }
}
