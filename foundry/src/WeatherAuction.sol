// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title WeatherAuction
 * @dev A contract for autonomous agents to bid for weather control in the Clawdy ecosystem.
 * Implements a time-locked highest-bidder-wins mechanism with pull-pattern refunds.
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

    mapping(address => uint256) public pendingReturns;

    event WeatherChanged(address indexed agent, uint256 amount, uint256 expiresAt, string preset);
    event FundsWithdrawn(address indexed owner, uint256 amount);
    event RefundClaimed(address indexed bidder, uint256 amount);

    address public owner;

    constructor() {
        owner = msg.sender;
    }

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

        if (currentControl.agent != address(0) && !isExpired) {
            pendingReturns[currentControl.agent] += currentControl.amount;
        }

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

    function withdrawPending() external {
        uint256 amount = pendingReturns[msg.sender];
        require(amount > 0, "Nothing to withdraw");
        pendingReturns[msg.sender] = 0;
        payable(msg.sender).transfer(amount);
        emit RefundClaimed(msg.sender, amount);
    }

    function withdraw() external {
        require(msg.sender == owner, "Only owner");
        uint256 amount = address(this).balance;
        payable(owner).transfer(amount);
        emit FundsWithdrawn(owner, amount);
    }
}
