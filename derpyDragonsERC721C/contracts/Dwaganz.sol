// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@limitbreak/creator-token-contracts/contracts/erc721c/ERC721C.sol";
import "@limitbreak/creator-token-contracts/contracts/programmable-royalties/BasicRoyalties.sol";
import "@limitbreak/creator-token-contracts/contracts/access/OwnableBasic.sol";

/**
 * @title Dwaganz
 * @author
 * @notice This contract extends ERC721C to include basic royalty functionality using BasicRoyalties.
 *         It relies on an external "DragonLair" contract to manage minting of tokens.
 */
contract Dwaganz is OwnableBasic, ERC721C, BasicRoyalties {
    /// @notice Address of the dragon lair contract that controls minting.
    address public dragonLairAddress;

    /// @notice Counter for the total number of tokens minted.
    uint public tokenCount;

    /// @notice Mapping from token ID to its corresponding metadata URI.
    mapping(uint256 => string) public tokenURIs;

    /// @dev Thrown when a function is called by an unauthorized sender.
    error InvalidCaller();

    /// @dev Ensures that the caller is the authorized dragon lair contract.
    modifier onlyDragonLair() {
        if (msg.sender != dragonLairAddress) revert InvalidCaller();
        _;
    }

    /**
     * @dev Initializes the contract by setting the royalty receiver, royalty fee, token name, and symbol.
     * @param royaltyReceiver_ The default address that will receive royalty payments.
     * @param royaltyFeeNumerator_ The default royalty fee percentage (in basis points).
     * @param name_ The name of the ERC721 token collection.
     * @param symbol_ The symbol of the ERC721 token collection.
     */
    constructor(
        address royaltyReceiver_,
        uint96 royaltyFeeNumerator_,
        string memory name_,
        string memory symbol_
    )
        ERC721OpenZeppelin(name_, symbol_)
        BasicRoyalties(royaltyReceiver_, royaltyFeeNumerator_)
    {}

    /**
     * @notice Sets the address of the dragon lair contract.
     * @dev Can only be called by the contract owner.
     * @param dragonLairAddress_ The address of the dragon lair contract.
     */
    function setDragonLairAddress(
        address dragonLairAddress_
    ) external onlyOwner {
        require(dragonLairAddress_ != address(0), "Invalid address");
        dragonLairAddress = dragonLairAddress_;
    }

    /**
     * @notice Returns the metadata URI for a given token ID.
     * @dev Overrides the base tokenURI method.
     * @param tokenId The ID of the token.
     * @return The metadata URI for the specified token.
     */
    function tokenURI(
        uint256 tokenId
    ) public view override returns (string memory) {
        return tokenURIs[tokenId];
    }

    /**
     * @notice Updates the metadata URI for a given token ID.
     * @dev Can only be called by the contract owner.
     * IMPORTANT NOTE: THIS IS AN EMERGENCY FUNCTION TO UPDATE METADATA URIS.
     * IT SHOULD NOT BE NECESSARY TO CALL THIS FUNCTION.
     * @param tokenId The ID of the token to update.
     * @param newUri The new metadata URI.
     */
    function setTokenURI(
        uint256 tokenId,
        string memory newUri
    ) external onlyOwner {
        tokenURIs[tokenId] = newUri;
    }

    /**
     * @notice Checks if the contract supports a given interface.
     * @dev Combines the interface checks of both ERC721C and ERC2981.
     * @param interfaceId The interface identifier, as specified in ERC165.
     * @return True if the contract supports the given interface, false otherwise.
     */
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC721C, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    /**
     * @notice Mints a new token to the specified address with the given token URI.
     * @dev Can only be called by the dragon lair contract. Increments the token count and assigns the URI.
     * @param to The address that will receive the minted token.
     * @param tokenUri The metadata URI for the minted token.
     */
    function mint(address to, string memory tokenUri) external onlyDragonLair {
        tokenCount++;
        tokenURIs[tokenCount] = tokenUri;
        _mint(to, tokenCount);
    }

    /**
     * @notice Sets the default royalty information for all tokens.
     * @dev Can only be called by the contract owner.
     * @param receiver The address that will receive the default royalty payments.
     * @param feeNumerator The royalty fee in basis points.
     */
    function setDefaultRoyalty(address receiver, uint96 feeNumerator) public {
        _requireCallerIsContractOwner();
        _setDefaultRoyalty(receiver, feeNumerator);
    }

    /**
     * @notice Sets royalty information for a specific token.
     * @dev Can only be called by the contract owner.
     * @param tokenId The ID of the token for which to set royalty information.
     * @param receiver The address that will receive the royalty payments for this token.
     * @param feeNumerator The royalty fee in basis points for this token.
     */
    function setTokenRoyalty(
        uint256 tokenId,
        address receiver,
        uint96 feeNumerator
    ) public {
        _requireCallerIsContractOwner();
        _setTokenRoyalty(tokenId, receiver, feeNumerator);
    }
}
