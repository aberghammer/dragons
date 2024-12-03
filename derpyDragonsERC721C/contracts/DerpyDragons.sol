// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@limitbreak/creator-token-contracts/contracts/erc721c/ERC721C.sol";
import "@limitbreak/creator-token-contracts/contracts/programmable-royalties/BasicRoyalties.sol";
import "@limitbreak/creator-token-contracts/contracts/access/OwnableBasic.sol";

/**
 * @title ERC721CWithBasicRoyalties
 * @author Limit Break, Inc.
 * @notice Extension of ERC721C that adds basic royalties support.
 * @dev These contracts are intended for example use and are not intended for production deployments as-is.
 */
contract DerpyDragons is OwnableBasic, ERC721C, BasicRoyalties {
    constructor(
        address royaltyReceiver_,
        uint96 royaltyFeeNumerator_,
        string memory name_,
        string memory symbol_
    )
        ERC721OpenZeppelin(name_, symbol_)
        BasicRoyalties(royaltyReceiver_, royaltyFeeNumerator_)
    {}

    address public dragonLairAddress;
    uint public tokenCount;
    mapping(uint256 => string) public tokenURIs;

    error InvalidCaller();

    modifier onlyDragonLair() {
        if (msg.sender != dragonLairAddress) revert InvalidCaller();
        _;
    }

    function setDragonLairAddress(
        address dragonLairAddress_
    ) external onlyOwner {
        require(dragonLairAddress_ != address(0), "Invalid address");
        dragonLairAddress = dragonLairAddress_;
    }

    function tokenURI(
        uint256 tokenId
    ) public view override returns (string memory) {
        return tokenURIs[tokenId];
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC721C, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function mint(address to, string memory tokenUri) external onlyDragonLair {
        tokenCount++;
        tokenURIs[tokenCount] = tokenUri;
        _mint(to, tokenCount);
    }

    function setDefaultRoyalty(address receiver, uint96 feeNumerator) public {
        _requireCallerIsContractOwner();
        _setDefaultRoyalty(receiver, feeNumerator);
    }

    function setTokenRoyalty(
        uint256 tokenId,
        address receiver,
        uint96 feeNumerator
    ) public {
        _requireCallerIsContractOwner();
        _setTokenRoyalty(tokenId, receiver, feeNumerator);
    }
}
