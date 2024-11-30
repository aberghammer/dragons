// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";

contract Dragons is ERC721Enumerable {
    uint256 private _nextTokenId = 1; // Start from 1

    constructor() ERC721("Dragons", "D") {}

    // Allows minting tokens to the specified address
    function mint(address to, uint256 amount) public {
        for (uint256 i = 0; i < amount; i++) {
            uint256 tokenId = _nextTokenId++;
            _safeMint(to, tokenId);
        }
    }
}
