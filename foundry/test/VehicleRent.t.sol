// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {VehicleRent} from "../src/VehicleRent.sol";

contract VehicleRentTest is Test {
    VehicleRent rental;
    address renter1 = makeAddr("renter1");
    address renter2 = makeAddr("renter2");

    receive() external payable {}

    function setUp() public {
        rental = new VehicleRent();
    }

    function test_initialState() public view {
        assertEq(rental.owner(), address(this));
        assertEq(rental.rentRatePerMinute(), 0.001 ether);
    }

    function test_rent_succeeds() public {
        vm.deal(renter1, 1 ether);
        vm.prank(renter1);
        rental.rent{value: 0.003 ether}("vehicle-1", "speedster", 3);

        (address agent, uint256 expiresAt, string memory vehicleType) = rental.getRentStatus("vehicle-1");
        assertEq(agent, renter1);
        assertEq(expiresAt, block.timestamp + 3 minutes);
        assertEq(vehicleType, "speedster");
    }

    function test_rent_revertsWhenInsufficientPayment() public {
        vm.deal(renter1, 1 ether);
        vm.prank(renter1);
        vm.expectRevert("Insufficient rent payment");
        rental.rent{value: 0.001 ether}("vehicle-1", "speedster", 3);
    }

    function test_rent_revertsWhenZeroMinutes() public {
        vm.deal(renter1, 1 ether);
        vm.prank(renter1);
        vm.expectRevert("Min 1 minute");
        rental.rent{value: 0.001 ether}("vehicle-1", "speedster", 0);
    }

    function test_rent_revertsWhenAlreadyRented() public {
        vm.deal(renter1, 1 ether);
        vm.deal(renter2, 1 ether);

        vm.prank(renter1);
        rental.rent{value: 0.003 ether}("vehicle-1", "speedster", 3);

        vm.prank(renter2);
        vm.expectRevert("Vehicle already rented and active");
        rental.rent{value: 0.003 ether}("vehicle-1", "speedster", 3);
    }

    function test_rent_afterExpiry() public {
        vm.deal(renter1, 1 ether);
        vm.deal(renter2, 1 ether);

        vm.prank(renter1);
        rental.rent{value: 0.003 ether}("vehicle-1", "speedster", 3);

        vm.warp(block.timestamp + 4 minutes);

        vm.prank(renter2);
        rental.rent{value: 0.003 ether}("vehicle-1", "tank", 3);

        (address agent, , string memory vehicleType) = rental.getRentStatus("vehicle-1");
        assertEq(agent, renter2);
        assertEq(vehicleType, "tank");
    }

    function test_withdraw_ownerOnly() public {
        vm.deal(renter1, 1 ether);
        vm.prank(renter1);
        rental.rent{value: 0.003 ether}("vehicle-1", "speedster", 3);

        uint256 balanceBefore = address(this).balance;
        rental.withdraw();
        assertEq(address(this).balance, balanceBefore + 0.003 ether);
    }

    function test_withdraw_revertsForNonOwner() public {
        vm.deal(renter1, 1 ether);
        vm.prank(renter1);
        rental.rent{value: 0.003 ether}("vehicle-1", "speedster", 3);

        vm.prank(renter1);
        vm.expectRevert("Only owner");
        rental.withdraw();
    }

    function test_emitsVehicleRentedEvent() public {
        vm.deal(renter1, 1 ether);

        vm.expectEmit(true, true, false, true);
        emit VehicleRent.VehicleRented("vehicle-1", renter1, 0.003 ether, 3, block.timestamp + 3 minutes, "speedster");

        vm.prank(renter1);
        rental.rent{value: 0.003 ether}("vehicle-1", "speedster", 3);
    }
}
