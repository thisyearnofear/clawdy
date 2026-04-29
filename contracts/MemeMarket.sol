// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/**
 * @title MemeMarket
 * @dev Manages the minting of Meme Abilities based on assets collected on X Layer.
 * Uses EIP-712 signed proofs from the game server to authorize mints.
 */
contract MemeMarket is ERC1155, Ownable, EIP712 {
    // Ability IDs
    uint256 public constant SPEED_BOOST = 1;
    uint256 public constant ANTI_GRAVITY = 2;
    uint256 public constant FLOOD_DRAIN = 3;

    address public signer;

    bytes32 private constant MINT_TYPEHASH = keccak256(
        "Mint(address to,uint256 abilityId,uint256 amount,uint256 nonce,uint256 deadline)"
    );

    mapping(address => uint256) public nonces;

    event AbilityMinted(address indexed to, uint256 abilityId, uint256 amount);
    event SignerUpdated(address indexed newSigner);

    constructor(address _signer)
        ERC1155("https://api.clawdy.io/api/assets/{id}.json")
        Ownable(msg.sender)
        EIP712("MemeMarket", "1")
    {
        signer = _signer;
    }

    function setSigner(address _signer) external onlyOwner {
        signer = _signer;
        emit SignerUpdated(_signer);
    }

    /**
     * @dev Mint ability with a server-signed proof that the player collected the required assets.
     * @param to The address to mint to
     * @param abilityId The ability to mint (SPEED_BOOST, ANTI_GRAVITY, FLOOD_DRAIN)
     * @param amount The amount to mint
     * @param deadline Timestamp after which this proof expires
     * @param signature ECDSA signature from the authorized signer
     */
    function mintWithProof(
        address to,
        uint256 abilityId,
        uint256 amount,
        uint256 deadline,
        bytes calldata signature
    ) external {
        require(block.timestamp <= deadline, "Proof expired");
        require(to != address(0), "Invalid recipient");

        uint256 nonce = nonces[to];
        bytes32 structHash = keccak256(
            abi.encode(MINT_TYPEHASH, to, abilityId, amount, nonce, deadline)
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        address recovered = ECDSA.recover(digest, signature);
        require(recovered == signer, "Invalid signature");

        nonces[to] = nonce + 1;
        _mint(to, abilityId, amount, "");

        emit AbilityMinted(to, abilityId, amount);
    }

    /**
     * @dev Owner can still mint directly for admin/testing purposes.
     */
    function mintAbility(address to, uint256 abilityId, uint256 amount) public onlyOwner {
        _mint(to, abilityId, amount, "");
    }
}
