// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";

import {IEntropyConsumer} from "@pythnetwork/entropy-sdk-solidity/IEntropyConsumer.sol";
import {IEntropy} from "@pythnetwork/entropy-sdk-solidity/IEntropy.sol";

import "hardhat/console.sol";

contract DerpyDragons is
    IEntropyConsumer,
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    ERC721EnumerableUpgradeable,
    ReentrancyGuardUpgradeable,
    ERC721HolderUpgradeable
{
    error NotOwnerOfToken(uint256 tokenId);
    error AlreadyStaked();
    error StakingClosed();
    error NotStakedOwner();
    error InvalidTokenIndex();
    error DirectTransferNotAllowed();
    error InsufficientBalance(uint256 currentRewards, uint256 pointsRequired);
    error InsufficientFee(uint256 sent, uint256 required);
    error InvalidSender();
    error InvalidProvider();
    error InvalidEntropySender(address sender);
    error InvalidEntropyProvider(address provider);
    error RequestAlreadyCompleted(uint64 sequenceNumber);
    error RequestAlreadyCancelled(uint64 sequenceNumber);
    error MintAlreadyCompleted(uint64 sequenceNumber);
    error MintRequestAlreadyCancelled(uint64 sequenceNumber);
    error MintRequestNotYetExpired(uint64 requestId, uint256 timeLeft);
    error InvalidRollType();

    event StakingModeUpdated(bool open);
    event Staked(address indexed user, uint256 tokenId);
    event PointsPerDayPerTokenUpdated(uint points);
    event Unstaked(address indexed user, uint256 tokenId);
    event TokenMinted(address indexed user, uint256 tokenId);
    event PointsRequiredUpdated(uint256 tokenType, uint256 points);
    event MintRequested(address indexed user, uint64 requestId);
    event MintFailed(address indexed user, uint64 requestId);

    struct StakedTokens {
        address owner; // The current owner of the staked token.
        uint256 checkInTimestamp; // The timestamp of the last check-in.
    }

    struct MintRequest {
        address user;
        uint256 tokenId;
        uint256 randomNumber;
        uint256 timestamp;
        uint8 rollType;
        bool completed;
        bool cancelled;
    }

    struct Rarity {
        uint256 price; // Punkte, die benötigt werden
        uint256[6] probabilities; // Wahrscheinlichkeiten für jede Stufe
        uint256 minted; // Bereits gemintete Tokens dieser Rarität
        uint256 maxSupply; // Maximale Anzahl an Tokens dieser Rarität
    }

    bool public stakingOpen;
    uint public pointsPerHourPerToken;
    uint public pointsPerDayPerToken;
    uint public mintedDragonCount;
    bool internal stakingInProgress;
    address[] public allStakers;
    IERC721 public dragons;
    IEntropy public entropy;
    address public provider;

    mapping(uint256 => Rarity) public rarities;
    mapping(address user => uint256[] stakedTokens) public stakedTokenIds;
    mapping(uint256 tokenId => StakedTokens stakedTokens)
        public stakedTokenProps;
    mapping(address => bool) public hasStaked;
    mapping(uint256 => uint256) internal tokenIndexInArray;
    mapping(address => uint256) public owedRewards;
    mapping(uint64 => uint256) public requestIdToMintId;
    mapping(uint64 => MintRequest) public mintRequests;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        string calldata contractName_,
        string calldata contractSymbol_,
        address _entropy,
        uint256 pointsPerHourPerToken_,
        address dragonsAddress
    ) public initializer {
        __Ownable_init(msg.sender);
        __ERC721_init(contractName_, contractSymbol_);
        __ERC721Enumerable_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        __ERC721Holder_init();
        dragons = IERC721(dragonsAddress);
        entropy = IEntropy(_entropy);
        provider = entropy.getDefaultProvider();

        // Verwenden der sichereren Logik
        pointsPerHourPerToken = pointsPerHourPerToken_;
        pointsPerDayPerToken = pointsPerHourPerToken_ * 24;
        initializeRarities();

        stakedTokenIds[address(0)].push();
    }

    function setStakingMode(bool open) external onlyOwner {
        stakingOpen = open;
        emit StakingModeUpdated(open);
    }

    function initializeRarities() internal {
        rarities[1] = Rarity({
            price: 1000,
            probabilities: [uint256(100), 0, 0, 0, 0, 0], // 100% Common
            minted: 0,
            maxSupply: 1000
        });
        rarities[2] = Rarity({
            price: 2000,
            probabilities: [uint256(60), 40, 0, 0, 0, 0], // 60% Common, 40% Uncommon
            minted: 0,
            maxSupply: 800
        });
        rarities[3] = Rarity({
            price: 3000,
            probabilities: [uint256(50), 40, 10, 0, 0, 0], // 50% Common, 40% Uncommon, 10% Rare
            minted: 0,
            maxSupply: 500
        });
        rarities[4] = Rarity({
            price: 4000,
            probabilities: [uint256(45), 35, 15, 5, 0, 0], // 45% Common, 35% Uncommon, 15% Rare, 5% Epic
            minted: 0,
            maxSupply: 200
        });
        rarities[5] = Rarity({
            price: 5000,
            probabilities: [uint256(40), 30, 15, 10, 5, 0], // 40% Common, 30% Uncommon, 15% Rare, 10% Epic, 5% Legendary
            minted: 0,
            maxSupply: 100
        });
        rarities[6] = Rarity({
            price: 6000,
            probabilities: [uint256(35), 25, 15, 15, 5, 5], // 35% Common, 25% Uncommon, 15% Rare, 15% Epic, 5% Legendary, 5% Mythic
            minted: 0,
            maxSupply: 50
        });
    }

    function getEntropy() internal view override returns (address) {
        return address(entropy); // Return the stored entropy contract address
    }

    function setPointsPerDayPerToken(uint256 pointsPerDay) external onlyOwner {
        pointsPerHourPerToken = pointsPerDay / 24;
        pointsPerDayPerToken = pointsPerDay;
        emit PointsPerDayPerTokenUpdated(pointsPerDay);
    }

    function getAllStakers() external view returns (address[] memory) {
        return allStakers;
    }

    /**
     * @dev Allows a user to stake one or more tokens by transferring them to the contract.
     * Staking is only allowed when staking is open.
     * @param tokenIds An array of token IDs to be staked.
     */
    function stake(uint256[] calldata tokenIds) external nonReentrant {
        if (!stakingOpen) revert StakingClosed();

        stakingInProgress = true;

        for (uint256 i = 0; i < tokenIds.length; i++) {
            _stake(tokenIds[i]);
        }

        stakingInProgress = false;
    }

    /**
     * @dev Internal function to handle the logic of staking a single token.
     * Checks if the token is already staked and transfers the token to the contract.
     * @param tokenId The ID of the token to be staked.
     */
    function _stake(uint256 tokenId) internal {
        if (stakedTokenProps[tokenId].owner != address(0))
            revert AlreadyStaked();

        if (dragons.ownerOf(tokenId) != msg.sender)
            revert NotOwnerOfToken(tokenId);
        stakedTokenProps[tokenId].owner = msg.sender;
        stakedTokenProps[tokenId].checkInTimestamp = block.timestamp;

        add(tokenId);

        if (!hasStaked[msg.sender]) {
            hasStaked[msg.sender] = true;
            allStakers.push(msg.sender);
        }

        dragons.safeTransferFrom(msg.sender, address(this), tokenId);

        emit Staked(msg.sender, tokenId);
    }

    function entropyCallback(
        uint64 sequenceNumber,
        address providerAddress,
        bytes32 randomNumber
    ) internal override {
        if (msg.sender != address(entropy)) {
            revert InvalidEntropySender(msg.sender);
        }

        if (providerAddress != provider) {
            revert InvalidEntropyProvider(providerAddress);
        }

        MintRequest storage request = mintRequests[sequenceNumber];

        if (request.completed) {
            revert RequestAlreadyCompleted(sequenceNumber);
        }

        if (request.cancelled) {
            revert RequestAlreadyCancelled(sequenceNumber);
        }

        uint256 randomValue = uint256(randomNumber) % 100; // Zufallswert zwischen 0 und 99
        uint8 rollType = request.rollType;

        // Überprüfen, ob der Roll-Typ valide ist
        if (rollType < 1 || rollType > 6) revert InvalidRollType();

        uint8 rarityIndex = 0;
        uint256 cumulativeProbability = 0;

        // Wahrscheinlichkeit für Rarität bestimmen
        for (uint8 i = 0; i < 6; i++) {
            cumulativeProbability += rarities[rollType].probabilities[i];

            if (randomValue < cumulativeProbability) {
                rarityIndex = i + 1; // Raritäten starten bei 1
                break;
            }
        }

        // Überprüfung und Fallback-Logik für verfügbare Raritäten
        Rarity storage selectedRarity = rarities[rarityIndex];

        // Aufsteigend prüfen (nur wenn Wahrscheinlichkeit > 0)
        while (
            rarityIndex <= 6 &&
            (selectedRarity.minted >= selectedRarity.maxSupply ||
                rarities[rarityIndex].probabilities[rarityIndex - 1] == 0)
        ) {
            rarityIndex += 1;
            if (rarityIndex <= 6) {
                selectedRarity = rarities[rarityIndex];
            }
        }

        // Absteigend prüfen, wenn keine höhere Rarität verfügbar
        if (
            rarityIndex > 6 || selectedRarity.minted >= selectedRarity.maxSupply
        ) {
            rarityIndex = request.rollType;
            while (
                rarityIndex > 0 &&
                rarities[rarityIndex].minted >= rarities[rarityIndex].maxSupply
            ) {
                rarityIndex -= 1;
            }
        }

        // Falls keine Rarität verfügbar ist, Punkte zurückgeben
        if (
            rarityIndex == 0 ||
            rarities[rarityIndex].minted >= rarities[rarityIndex].maxSupply
        ) {
            owedRewards[request.user] += rarities[request.rollType].price;
            request.cancelled = true;
            emit MintFailed(request.user, sequenceNumber);
            return;
        }

        // Mint-Logik, wenn Rarität verfügbar ist
        selectedRarity.minted += 1;
        request.completed = true;

        // NFT minten
        _safeMint(request.user, request.tokenId);

        emit TokenMinted(request.user, request.tokenId);
    }

    function resolveExpiredMint(uint64 sequenceNumber) external {
        MintRequest storage request = mintRequests[sequenceNumber];

        if (request.completed) {
            revert MintAlreadyCompleted(sequenceNumber);
        }

        if (request.cancelled) {
            revert MintRequestAlreadyCancelled(sequenceNumber);
        }

        if (block.timestamp <= request.timestamp + 1 days) {
            revert MintRequestNotYetExpired(
                sequenceNumber,
                (request.timestamp + 1 days) - block.timestamp
            );
        }

        // Punkte zurückerstatten
        owedRewards[request.user] += rarities[request.rollType].price;

        // Anfrage als abgebrochen markieren
        request.cancelled = true;

        emit MintFailed(request.user, sequenceNumber);
    }

    function mintToken(uint8 rollType) external payable nonReentrant {
        if (rollType < 1 && rollType > 6) revert InvalidRollType();

        uint256 pointsRequired = rarities[rollType].price;

        (
            uint256 totalClaimable,
            uint256[] memory tokenIdsToReset
        ) = _calculatePendingRewards(msg.sender);

        _resetCurrentStakedRewards(tokenIdsToReset);

        uint256 allRewards = totalClaimable + owedRewards[msg.sender];
        if (allRewards < pointsRequired) {
            revert InsufficientBalance(allRewards, pointsRequired);
        }

        uint fee = entropy.getFee(provider);
        if (msg.value < fee) {
            revert InsufficientFee(msg.value, fee);
        }

        uint64 sequenceNumber = entropy.requestWithCallback{value: fee}(
            provider,
            keccak256(abi.encodePacked(block.timestamp, msg.sender))
        );

        uint256 rewardsLeft = allRewards - pointsRequired;
        owedRewards[msg.sender] = rewardsLeft;

        mintedDragonCount += 1;

        mintRequests[sequenceNumber] = MintRequest({
            user: msg.sender,
            tokenId: mintedDragonCount,
            randomNumber: 0,
            timestamp: block.timestamp,
            rollType: rollType,
            completed: false,
            cancelled: false
        });

        emit MintRequested(msg.sender, sequenceNumber);
    }

    /**
     * @dev Allows a user to unstake one or more tokens, transferring them back from the contract.
     * If the contract doesn't have enough TOKEN, the rewards are stored.
     * @param tokenIds An array of token IDs to be unstaked.
     */
    function unstake(uint256[] calldata tokenIds) external nonReentrant {
        if (tokenIds.length == 0) revert InvalidTokenIndex();

        (
            uint256 totalClaimable,
            uint256[] memory tokenIdsToReset
        ) = _calculatePendingRewards(msg.sender);

        _resetCurrentStakedRewards(tokenIdsToReset);

        if (totalClaimable > 0) {
            owedRewards[msg.sender] += totalClaimable;
        }

        for (uint256 i = 0; i < tokenIds.length; i++) {
            _unstake(tokenIds[i]);
        }
    }

    function _unstake(uint256 tokenId) internal {
        address owner = stakedTokenProps[tokenId].owner;
        if (owner != msg.sender) revert NotStakedOwner();

        stakedTokenProps[tokenId].owner = address(0);
        stakedTokenProps[tokenId].checkInTimestamp = 0;
        remove(tokenId);

        dragons.safeTransferFrom(address(this), owner, tokenId);
        emit Unstaked(owner, tokenId);
    }

    /**
     * @dev Allows a user to view their earned rewards without modifying state.
     * @param user The address of the user to calculate rewards for.
     * @return totalClaimable The total rewards earned by the user.
     */
    function pendingRewards(
        address user
    ) public view returns (uint256 totalClaimable) {
        uint256 owed = owedRewards[user];
        (totalClaimable, ) = _calculatePendingRewards(user);
        totalClaimable = totalClaimable + owed;
    }

    /**
     * @dev Internal view function to calculate the total pending rewards for a user's staked tokens.
     * Does not modify state.
     * @param user The address of the user to calculate rewards for.
     * @return totalClaimable The total rewards earned by the user.
     * @return tokenIdsToReset The token IDs that need their timestamp reset.
     */
    function _calculatePendingRewards(
        address user
    )
        internal
        view
        returns (uint256 totalClaimable, uint256[] memory tokenIdsToReset)
    {
        uint256[] storage userStakedTokens = stakedTokenIds[user];
        uint256 tokenCount = userStakedTokens.length;

        uint256[] memory tempTokenIdsToReset = new uint256[](tokenCount);
        uint256 resetIndex = 0;

        for (uint256 i = 0; i < tokenCount; i++) {
            uint256 tokenId = userStakedTokens[i];
            StakedTokens storage staked = stakedTokenProps[tokenId];

            uint256 startTime = staked.checkInTimestamp;

            if (block.timestamp > startTime) {
                uint256 stakingDuration = block.timestamp - startTime;
                uint256 earnedPoints = (stakingDuration *
                    pointsPerHourPerToken) / (1 hours);

                totalClaimable += earnedPoints;

                if (earnedPoints > 0) {
                    tempTokenIdsToReset[resetIndex] = tokenId;
                    resetIndex++;
                }
            }
        }

        tokenIdsToReset = new uint256[](resetIndex);
        for (uint256 i = 0; i < resetIndex; i++) {
            tokenIdsToReset[i] = tempTokenIdsToReset[i];
        }
    }

    /**
     * @dev Internal function to calculate the total rewards for a specific set of tokens.
     * Updates the check-in timestamp only for the specified tokens.
     * @param tokenIds The array of token IDs to calculate rewards for.
     */
    function _resetCurrentStakedRewards(uint256[] memory tokenIds) internal {
        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 tokenId = tokenIds[i];
            StakedTokens storage staked = stakedTokenProps[tokenId];
            staked.checkInTimestamp = block.timestamp;
        }
    }

    // -------------------------------------------------------
    // Utility functions
    // ------------------------------------------------------

    function add(uint256 tokenId) internal {
        uint256[] storage tokenIds = stakedTokenIds[msg.sender];
        tokenIndexInArray[tokenId] = tokenIds.length;
        tokenIds.push(tokenId);
    }

    function remove(uint256 tokenId) internal {
        uint256[] storage tokenIds = stakedTokenIds[msg.sender];
        uint256 index = tokenIndexInArray[tokenId];

        if (index >= tokenIds.length) revert InvalidTokenIndex();

        uint256 lastTokenId = tokenIds[tokenIds.length - 1];
        tokenIds[index] = lastTokenId;

        tokenIndexInArray[lastTokenId] = index;

        tokenIds.pop();

        delete tokenIndexInArray[tokenId];
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes memory
    ) public view override returns (bytes4) {
        if (!stakingInProgress) revert DirectTransferNotAllowed();
        return this.onERC721Received.selector;
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}

    function version() public pure returns (string memory) {
        return "1.0";
    }
}
