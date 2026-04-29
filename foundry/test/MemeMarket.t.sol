// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {MemeMarket} from "../src/MemeMarket.sol";

contract MemeMarketTest is Test {
    MemeMarket market;
    address player = makeAddr("player");
    address other = makeAddr("other");
    uint256 signerPrivateKey = 0xA11CE;

    function setUp() public {
        market = new MemeMarket(vm.addr(signerPrivateKey));
    }

    function test_initialState() public view {
        assertEq(market.owner(), address(this));
        assertEq(market.signer(), vm.addr(signerPrivateKey));
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

    // ── mintWithProof tests ───────────────────────────────────────────────────

    function _signMint(address to, uint256 abilityId, uint256 amount, uint256 deadline) internal returns (bytes memory) {
        uint256 nonce = market.nonces(to);
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Mint(address to,uint256 abilityId,uint256 amount,uint256 nonce,uint256 deadline)"),
                to,
                abilityId,
                amount,
                nonce,
                deadline
            )
        );
        // Compute EIP-712 domain separator manually
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("MemeMarket"),
                keccak256("1"),
                block.chainid,
                address(market)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPrivateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_mintWithProof_succeedsWithValidSignature() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(player, 1, 3, deadline);

        market.mintWithProof(player, 1, 3, deadline, sig);
        assertEq(market.balanceOf(player, 1), 3);
    }

    function test_mintWithProof_revertsWithExpiredProof() public {
        uint256 deadline = block.timestamp - 1;
        bytes memory sig = _signMint(player, 1, 1, deadline);

        vm.expectRevert("Proof expired");
        market.mintWithProof(player, 1, 1, deadline, sig);
    }

    function test_mintWithProof_revertsWithInvalidSignature() public {
        uint256 deadline = block.timestamp + 1 hours;
        // Sign with wrong key
        uint256 wrongKey = 0xBEEF;
        uint256 nonce = market.nonces(player);
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Mint(address to,uint256 abilityId,uint256 amount,uint256 nonce,uint256 deadline)"),
                player, uint256(1), uint256(1), nonce, deadline
            )
        );
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("MemeMarket"),
                keccak256("1"),
                block.chainid,
                address(market)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongKey, digest);
        bytes memory badSig = abi.encodePacked(r, s, v);

        vm.expectRevert("Invalid signature");
        market.mintWithProof(player, 1, 1, deadline, badSig);
    }

    function test_mintWithProof_revertsForZeroAddress() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(address(0), 1, 1, deadline);

        vm.expectRevert("Invalid recipient");
        market.mintWithProof(address(0), 1, 1, deadline, sig);
    }

    function test_mintWithProof_incrementsNonce() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig1 = _signMint(player, 1, 1, deadline);
        market.mintWithProof(player, 1, 1, deadline, sig1);
        assertEq(market.nonces(player), 1);

        // Second mint needs a new signature (nonce changed)
        bytes memory sig2 = _signMint(player, 1, 2, deadline);
        market.mintWithProof(player, 1, 2, deadline, sig2);
        assertEq(market.nonces(player), 2);
        assertEq(market.balanceOf(player, 1), 3);
    }

    function test_mintWithProof_replaysWithOldNonceReverts() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signMint(player, 1, 1, deadline);
        market.mintWithProof(player, 1, 1, deadline, sig);

        // Replay same signature — nonce is now 1, so signature is invalid
        vm.expectRevert("Invalid signature");
        market.mintWithProof(player, 1, 1, deadline, sig);
    }

    // ── setSigner tests ───────────────────────────────────────────────────────

    function test_setSigner_ownerCanUpdate() public {
        address newSigner = makeAddr("newSigner");
        market.setSigner(newSigner);
        assertEq(market.signer(), newSigner);
    }

    function test_setSigner_revertsForNonOwner() public {
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", other));
        market.setSigner(other);
    }
}
