// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {WeatherAuction} from "../src/WeatherAuction.sol";

contract WeatherAuctionTest is Test {
    WeatherAuction auction;
    address bidder1 = makeAddr("bidder1");
    address bidder2 = makeAddr("bidder2");

    receive() external payable {}

    function setUp() public {
        auction = new WeatherAuction();
    }

    function test_initialState() public view {
        assertEq(auction.owner(), address(this));
        assertEq(auction.MIN_CONTROL_DURATION(), 1 minutes);
        assertEq(auction.MAX_CONTROL_DURATION(), 1 hours);
    }

    function test_bid_succeeds() public {
        vm.deal(bidder1, 1 ether);
        vm.prank(bidder1);
        auction.bid{value: 0.1 ether}(60, "stormy", 100, 50, 30, 0xFF0000);

        WeatherAuction.Bid memory bid = auction.getCurrentConfig();
        assertEq(bid.agent, bidder1);
        assertEq(bid.amount, 0.1 ether);
        assertEq(bid.expiresAt, block.timestamp + 60);
        assertEq(bid.config.preset, "stormy");
    }

    function test_bid_revertsWhenDurationTooShort() public {
        vm.deal(bidder1, 1 ether);
        vm.prank(bidder1);
        vm.expectRevert("Invalid duration");
        auction.bid{value: 0.1 ether}(30, "stormy", 100, 50, 30, 0xFF0000);
    }

    function test_bid_revertsWhenDurationTooLong() public {
        vm.deal(bidder1, 1 ether);
        vm.prank(bidder1);
        vm.expectRevert("Invalid duration");
        auction.bid{value: 0.1 ether}(3601, "stormy", 100, 50, 30, 0xFF0000);
    }

    function test_bid_revertsWhenBidTooLow() public {
        vm.deal(bidder1, 1 ether);
        vm.deal(bidder2, 1 ether);

        vm.prank(bidder1);
        auction.bid{value: 0.1 ether}(60, "stormy", 100, 50, 30, 0xFF0000);

        vm.prank(bidder2);
        vm.expectRevert("Bid too low");
        auction.bid{value: 0.05 ether}(60, "sunset", 100, 50, 30, 0xFF0000);
    }

    function test_bid_higherBidWins() public {
        vm.deal(bidder1, 1 ether);
        vm.deal(bidder2, 1 ether);

        vm.prank(bidder1);
        auction.bid{value: 0.1 ether}(60, "stormy", 100, 50, 30, 0xFF0000);

        vm.prank(bidder2);
        auction.bid{value: 0.2 ether}(60, "sunset", 100, 50, 30, 0xFFAA00);

        WeatherAuction.Bid memory bid = auction.getCurrentConfig();
        assertEq(bid.agent, bidder2);
        assertEq(bid.amount, 0.2 ether);
    }

    function test_bid_afterExpiry() public {
        vm.deal(bidder1, 1 ether);
        vm.deal(bidder2, 1 ether);

        vm.prank(bidder1);
        auction.bid{value: 0.1 ether}(60, "stormy", 100, 50, 30, 0xFF0000);

        vm.warp(block.timestamp + 61);

        vm.prank(bidder2);
        auction.bid{value: 0.05 ether}(60, "sunset", 100, 50, 30, 0xFFAA00);

        WeatherAuction.Bid memory bid = auction.getCurrentConfig();
        assertEq(bid.agent, bidder2);
    }

    function test_withdraw_ownerOnly() public {
        vm.deal(bidder1, 1 ether);
        vm.prank(bidder1);
        auction.bid{value: 0.5 ether}(60, "stormy", 100, 50, 30, 0xFF0000);

        uint256 balanceBefore = address(this).balance;
        auction.withdraw();
        assertEq(address(this).balance, balanceBefore + 0.5 ether);
    }

    function test_withdraw_revertsForNonOwner() public {
        vm.deal(bidder1, 1 ether);
        vm.prank(bidder1);
        auction.bid{value: 0.5 ether}(60, "stormy", 100, 50, 30, 0xFF0000);

        vm.prank(bidder1);
        vm.expectRevert("Only owner");
        auction.withdraw();
    }

    function test_emitsWeatherChangedEvent() public {
        vm.deal(bidder1, 1 ether);

        vm.expectEmit(true, false, false, true);
        emit WeatherAuction.WeatherChanged(bidder1, 0.1 ether, block.timestamp + 60, "stormy");

        vm.prank(bidder1);
        auction.bid{value: 0.1 ether}(60, "stormy", 100, 50, 30, 0xFF0000);
    }
}
