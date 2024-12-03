// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.22;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract DerpyDragons is ERC721, Ownable {
    constructor() ERC721("DerpyDragons", "DD") Ownable(msg.sender) {}

    modifier onlyDragonLair() {
        if (msg.sender != dragonLairAddress) revert InvalidCaller();
        _;
    }

    address public dragonLairAddress;
    uint public tokenCount;
    mapping(uint256 => string) public tokenURIs;

    error InvalidCaller();

    function mint(address to, string memory tokenUri) external onlyDragonLair {
        tokenCount += 1;
        tokenURIs[tokenCount] = tokenUri;
        _mint(to, tokenCount);
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
}
