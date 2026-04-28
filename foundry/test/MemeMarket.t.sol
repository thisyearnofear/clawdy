// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {MemeMarket} from "../src/MemeMarket.sol";

contract MemeMarketTest is Test {
    MemeMarket market;
    address player = makeAddr("player");
    address other = makeAddr("other");

    function setUp() public {
        market = new MemeMarket();
    }

    function test_initialState() public view {
        assertEq(market.owner(), address(this));
        assertEq(market.SPEED_BOOST(), 1);
        assertEq(market.ANTI_GRAVITY(), 2);
        assertEq(market.FLOOD_DRAIN(), 3);
    }

    function test_mintAbility_ownerCanMint() public {
        market.mintAbility(player, 1, 5);
        assertEq(market.balanceOf(player, 1), 5);
    }

    function test_mintAbility_allAbilityIds() public {
        market.mintAbility(player, 1, 1);
        market.mintAbility(player, 2, 1);
        market.mintAbility(player, 3, 1);

        assertEq(market.balanceOf(player, 1), 1);
        assertEq(market.balanceOf(player, 2), 1);
        assertEq(market.balanceOf(player, 3), 1);
    }

    function test_mintAbility_revertsForNonOwner() public {
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", other));
        market.mintAbility(player, 1, 1);
    }

    function test_mintAbility_accumulatesBalance() public {
        market.mintAbility(player, 1, 3);
        market.mintAbility(player, 1, 2);
        assertEq(market.balanceOf(player, 1), 5);
    }
}
