// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import {IEntropyConsumer} from "@pythnetwork/entropy-sdk-solidity/IEntropyConsumer.sol";
import {IEntropy} from "@pythnetwork/entropy-sdk-solidity/IEntropy.sol";

interface IDwaginz {
    /// @notice Mints a new token to the specified address with the given token URI.
    /// @param to The address to receive the newly minted token.
    /// @param tokenUri The metadata URI for the minted token.
    function mint(address to, string memory tokenUri) external;
}

contract DragonsLair is
    IEntropyConsumer,
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable,
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
    error RequestNotCompleted(uint64 sequenceNumber);
    error RequestAlreadyCancelled(uint64 sequenceNumber);
    error MintAlreadyCompleted(uint64 sequenceNumber);
    error MintRequestAlreadyCancelled(uint64 sequenceNumber);
    error MintRequestNotYetExpired(uint64 requestId, uint256 timeLeft);
    error InvalidRollType();
    error InputMismatch();
    error TooManyRollTypes();
    error InvalidProbabilitySum();
    error ConfigMismatch();
    error RollsNotInitialized();
    error NoMintsLeft();
    error CheckinToEarly();
    error MintingClosed();

    event StakingModeUpdated(bool open);
    event Staked(address indexed user, uint256 tokenId);
    event PointsPerDayPerTokenUpdated(uint points);
    event Unstaked(address indexed user, uint256 tokenId);
    event TokenMinted(address indexed user, uint256 tokenId);
    event PointsRequiredUpdated(uint256 tokenType, uint256 points);
    event MintRequested(address indexed user, uint64 requestId);
    event MintFailed(address indexed user, uint64 requestId);
    event TokenReadyForMint(address indexed user, uint64 requestId);
    event RollTypesInitialized();
    event RarityLevelsInitialized();
    event ProviderUpdated(address provider);
    event DailyCheckin(address indexed user, uint256 timestamp, uint256 bonus);
    event DailyBonusUpdated(uint256 bonus);
    event DwaginzContractUpdated(address dwaginzAddress);
    event DinnerPartyDiscountUpdated(uint256 discount);
    event DinnerPartyDailyBonusUpdated(uint256 bonus);
    event MintingModeUpdated(bool open);

    struct StakedTokens {
        address owner;
        uint256 checkInTimestamp;
    }

    struct MintRequest {
        address user;
        uint256 tokenId;
        uint256 randomNumber;
        uint256 timestamp;
        string uri;
        uint8 rollType;
        bool requestCompleted;
        bool cancelled;
        bool mintFinalized;
    }

    struct RarityLevel {
        uint256 minted;
        uint256 maxSupply;
        string tokenUri;
    }

    struct RollType {
        uint256 price;
        uint256[] probabilities;
    }

    bool public stakingOpen;
    bool public mintingOpen;
    bool public rolesInitialized;
    bool public rarityLevelsInitialized;
    bool internal stakingInProgress;

    uint public pointsPerHourPerToken;
    uint public pointsPerDayPerToken;
    uint public mintedDragonCount;
    uint public mintRequestId;
    uint public checkinBonus;
    uint public dinnerPartyDiscount;
    uint public existingRolls;
    uint public dinnerPartyDailyBonus;

    address[] public allStakers;
    address public provider;

    IERC721 public dragons;
    IERC721 public dinnerParty;
    IDwaginz public dwaginz;
    IEntropy public entropy;

    mapping(address => uint256) public lastCheckinTimestamp;
    mapping(address user => uint256[] stakedTokens) public stakedTokenIds;
    mapping(uint256 tokenId => StakedTokens stakedTokens)
        public stakedTokenProps;
    mapping(address => bool) public hasStaked;
    mapping(uint256 => uint256) internal tokenIndexInArray;
    mapping(address => uint256) public owedRewards;
    mapping(uint64 => uint256) public requestIdToMintId;
    mapping(uint64 => MintRequest) public mintRequests;
    mapping(address => uint256[]) public mintRequestsByUser;

    mapping(uint8 => RollType) public rollTypes;
    mapping(uint8 => RarityLevel) public rarityLevels;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address entropy_,
        uint256 pointsPerHourPerToken_,
        address dragonsAddress_,
        address dinnerPartyAddress_,
        address dwaginzAddress_,
        address provider_
    ) public initializer {
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        __ERC721Holder_init();
        dwaginz = IDwaginz(dwaginzAddress_);
        dragons = IERC721(dragonsAddress_);
        dinnerParty = IERC721(dinnerPartyAddress_);
        entropy = IEntropy(entropy_);
        provider = provider_;

        pointsPerHourPerToken = pointsPerHourPerToken_;
        pointsPerDayPerToken = pointsPerHourPerToken_ * 24;

        stakedTokenIds[address(0)].push();
    }

    /**
     * @dev Initializes the rarity levels for the contract.
     * @param _rarityLevels The rarity levels to be initialized.
     */
    function initializeRarityLevels(
        RarityLevel[] memory _rarityLevels
    ) external onlyOwner {
        if (!rolesInitialized) revert RollsNotInitialized();
        if (_rarityLevels.length != existingRolls) revert ConfigMismatch();
        for (uint8 i = 0; i < _rarityLevels.length; i++) {
            rarityLevels[i] = RarityLevel({
                minted: 0,
                maxSupply: _rarityLevels[i].maxSupply,
                tokenUri: _rarityLevels[i].tokenUri
            });
        }
        rarityLevelsInitialized = true;
        emit RarityLevelsInitialized();
    }

    /**
     * @dev Initializes the roll types for the contract.
     * @param newRollTypes The roll types to be initialized.
     */
    function initializeRollTypes(
        RollType[] memory newRollTypes
    ) external onlyOwner {
        for (uint8 i = 0; i < newRollTypes.length; i++) {
            uint256 totalProbability = 0;

            for (uint8 j = 0; j < newRollTypes[i].probabilities.length; j++) {
                totalProbability += newRollTypes[i].probabilities[j];
            }

            if (totalProbability != 100) {
                revert InvalidProbabilitySum();
            }

            rollTypes[i] = newRollTypes[i];
        }
        rolesInitialized = true;
        existingRolls = newRollTypes.length;
        emit RollTypesInitialized();
    }

    /**
     * @dev Allows the owner to update the staking mode.
     * @param open The new staking mode.
     */
    function setStakingMode(bool open) external onlyOwner {
        stakingOpen = open;
        emit StakingModeUpdated(open);
    }

    /**
     * @dev Allows the owner to update the minting mode.
     * @param open The new minting mode.
     */
    function setMintingMode(bool open) external onlyOwner {
        mintingOpen = open;
        emit MintingModeUpdated(open);
    }

    /**
     * @dev Allows the owner to update the provider address.
     * @param provider_ The new provider address.
     */
    function setProvider(address provider_) external onlyOwner {
        provider = provider_;
        emit ProviderUpdated(provider_);
    }

    /**
     * @dev Allows the owner to update the points per day.
     * @param pointsPerDay The new points required.
     */
    function setPointsPerDayPerToken(uint256 pointsPerDay) external onlyOwner {
        pointsPerHourPerToken = pointsPerDay / 24;
        pointsPerDayPerToken = pointsPerDay;
        emit PointsPerDayPerTokenUpdated(pointsPerDay);
    }

    /**
     * @dev Allows the owner to update the daily bonus.
     * @param bonus The new daily bonus.
     */
    function setDailyBonus(uint256 bonus) external onlyOwner {
        checkinBonus = bonus;
        emit DailyBonusUpdated(bonus);
    }

    /**
     * @dev Allows the owner to update the discount.
     * @param discount The new points required.
     */
    function setDinnerPartyDiscount(uint discount) external onlyOwner {
        dinnerPartyDiscount = discount;
        emit DinnerPartyDiscountUpdated(discount);
    }

    /**
     * @dev Allows the owner to update the daily bonus.
     * @param bonus The new daily bonus.
     */
    function setDinnerPartyDailyBonus(uint bonus) external onlyOwner {
        dinnerPartyDailyBonus = bonus;
        emit DinnerPartyDailyBonusUpdated(bonus);
    }

    /**
     * @dev Allows the owner to update the minting contract.
     */
    function setDwaginzContract(address dwaginzAddress) external onlyOwner {
        dwaginz = IDwaginz(dwaginzAddress);
        emit DwaginzContractUpdated(dwaginzAddress);
    }

    /**
     * @dev gets the entropy provider address
     */
    function getEntropy() internal view override returns (address) {
        return address(entropy); // Return the stored entropy contract address
    }

    /**
     * @dev Returns a list of token IDs that are staked by a particular address.
     * @param addr The address to query staked tokens for.
     * @return An array of token IDs that the address has staked.
     */
    function getTokensStaked(
        address addr
    ) external view returns (uint256[] memory) {
        return stakedTokenIds[addr];
    }

    /**
     * @dev returns te mint requests by user
     * this can be used in fronted to display a history or unfinished requests
     */
    function getMintRequestsByUser(
        address user
    ) external view returns (uint256[] memory) {
        return mintRequestsByUser[user];
    }

    /**
     * @dev returns all the stakers of the contract
     * this can be used in fronted to display a leaderboard
     */
    function getAllStakers() external view returns (address[] memory) {
        return allStakers;
    }

    /**
     * @dev helper functon for getting the rollType configuration
     * @param rollTypeId The ID of the roll type to be retrieved.
     */
    function getRollTypeById(
        uint8 rollTypeId
    ) external view returns (RollType memory) {
        RollType storage rollType = rollTypes[rollTypeId];
        return (rollType);
    }

    //--------------------------------------------------------------------------------
    // Daily checkin functions
    //--------------------------------------------------------------------------------

    /**
     * @dev Allows a user to check in daily to earn points.
     * Points increased based on the number of "The Dinner Party" tokens owned.
     */

    function dailyCheckIn() external nonReentrant {
        if (!stakingOpen) revert StakingClosed();
        if (block.timestamp < lastCheckinTimestamp[msg.sender] + 24 hours) {
            revert CheckinToEarly();
        }

        uint256 dinnerPartyMultiplier = dinnerParty.balanceOf(msg.sender);
        owedRewards[msg.sender] +=
            checkinBonus +
            dinnerPartyMultiplier *
            dinnerPartyDailyBonus;

        lastCheckinTimestamp[msg.sender] = block.timestamp;

        emit DailyCheckin(msg.sender, block.timestamp, checkinBonus);
    }

    //--------------------------------------------------------------------------------
    // Staking functions
    //--------------------------------------------------------------------------------

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

    /**
     * @dev Internal function to handle the logic of unstaking a single token.
     * Checks if the token is staked by the user and transfers the token back to the user.
     * @param tokenId The ID of the token to be unstaked.
     */
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

    //--------------------------------------------------------------------------------
    // Minting functions
    //--------------------------------------------------------------------------------

    /**
     * @dev Allows a user to request a token mint.
     * The user must have enough points to request the token.
     * @param rollType The type of roll to be requested.
     */
    function requestToken(uint8 rollType) external payable nonReentrant {
        if (rollType >= existingRolls) revert InvalidRollType();
        if (!mintingOpen) revert MintingClosed();

        RollType storage selectedRollType = rollTypes[rollType];
        bool hasMintCapacity = false;

        for (uint8 i = 0; i < selectedRollType.probabilities.length; i++) {
            if (selectedRollType.probabilities[i] == 0) {
                continue;
            }

            if (rarityLevels[i].minted < rarityLevels[i].maxSupply) {
                hasMintCapacity = true;
                break;
            }
        }

        if (!hasMintCapacity) {
            revert NoMintsLeft();
        }

        uint discount = dinnerParty.balanceOf(msg.sender) * dinnerPartyDiscount;

        uint256 pointsRequired = rollTypes[rollType].price;

        if (discount > pointsRequired) {
            pointsRequired = 0;
        } else {
            pointsRequired -= discount;
        }

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

        uint256 rewardsLeft = allRewards - pointsRequired;
        owedRewards[msg.sender] = rewardsLeft;
        mintRequestId += 1;

        uint64 sequenceNumber = entropy.requestWithCallback{value: fee}(
            provider,
            keccak256(abi.encodePacked(block.timestamp, msg.sender))
        );

        mintRequests[sequenceNumber] = MintRequest({
            user: msg.sender,
            tokenId: 0,
            randomNumber: 0,
            timestamp: block.timestamp,
            uri: "",
            rollType: rollType,
            requestCompleted: false,
            cancelled: false,
            mintFinalized: false
        });

        requestIdToMintId[sequenceNumber] = mintRequestId;
        mintRequestsByUser[msg.sender].push(sequenceNumber);

        emit MintRequested(msg.sender, sequenceNumber);
    }

    /**
     * @dev callback function leveraged by pyth giving the entropy
     * @param sequenceNumber The sequence number of the request.
     * @param randomNumber The random number generated by the entropy provider.
     */
    function entropyCallback(
        uint64 sequenceNumber,
        address,
        bytes32 randomNumber
    ) internal override {
        MintRequest storage request = mintRequests[sequenceNumber];

        if (request.requestCompleted) {
            revert RequestAlreadyCompleted(sequenceNumber);
        }

        if (request.cancelled) {
            revert RequestAlreadyCancelled(sequenceNumber);
        }

        request.randomNumber = uint256(randomNumber);
        request.requestCompleted = true;

        emit TokenReadyForMint(request.user, sequenceNumber);
    }

    /**
     * @dev Allows a user to cancel a mint request if it has not been completed by the provider.
     * @param sequenceNumber The sequence number of the mint request to be cancelled.
     */
    function resolveExpiredMint(uint64 sequenceNumber) external {
        MintRequest storage request = mintRequests[sequenceNumber];

        if (request.requestCompleted) {
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

        uint256 pointsRequired = rollTypes[request.rollType].price;
        owedRewards[request.user] += pointsRequired;

        request.cancelled = true;

        emit MintFailed(request.user, sequenceNumber);
    }

    /**
     * @dev Allows the provider to mint the token based on a calculated rarity.
     * @param sequenceNumber The sequence number of the mint request to be completed.
     */
    function selectRarityAndMint(uint64 sequenceNumber) external {
        MintRequest storage request = mintRequests[sequenceNumber];

        if (!request.requestCompleted) {
            revert RequestNotCompleted(sequenceNumber);
        }

        if (request.mintFinalized) {
            revert MintAlreadyCompleted(sequenceNumber);
        }

        uint8[] memory availableRarities = new uint8[](existingRolls);
        uint256 randomValue = request.randomNumber % 100;
        uint8 finalRarityIndex = 0;
        uint256 cumulativeProbability = 0;
        uint256 usedRandomness = 0;
        uint256 availableCount = 0;

        // Find the available rarities for the roll type example: [0,2,3] is still mintable.
        for (uint8 i = 0; i < existingRolls; i++) {
            if (rarityLevels[i].minted < rarityLevels[i].maxSupply) {
                availableRarities[availableCount] = i;
                availableCount++;
            }
        }

        for (uint8 attempt = 0; attempt < availableCount; attempt++) {
            uint256 effectiveRandomValue = (attempt == 0)
                ? randomValue
                : uint256(
                    keccak256(abi.encode(request.randomNumber, usedRandomness))
                ) % 100;

            for (uint8 j = 0; j < availableCount; j++) {
                uint8 rarityIndex = availableRarities[j];
                uint256 probability = rollTypes[request.rollType].probabilities[
                    rarityIndex
                ];

                cumulativeProbability += probability;

                if (effectiveRandomValue < cumulativeProbability) {
                    finalRarityIndex = rarityIndex;
                    break;
                }
            }

            if (
                rarityLevels[finalRarityIndex].minted <
                rarityLevels[finalRarityIndex].maxSupply
            ) {
                break;
            }

            cumulativeProbability = 0;
            usedRandomness++;
            finalRarityIndex = 0;
        }

        if (
            rarityLevels[finalRarityIndex].minted >=
            rarityLevels[finalRarityIndex].maxSupply
        ) {
            owedRewards[request.user] += rollTypes[request.rollType].price;
            request.cancelled = true;
            emit MintFailed(request.user, sequenceNumber);
            return;
        }

        uint dragonNumberPerFolder = rarityLevels[finalRarityIndex].minted += 1;
        mintedDragonCount += 1;

        request.tokenId = mintedDragonCount;

        string memory fullUri = string(
            abi.encodePacked(
                rarityLevels[finalRarityIndex].tokenUri,
                Strings.toString(dragonNumberPerFolder),
                ".json"
            )
        );

        mintRequests[sequenceNumber].uri = fullUri;
        mintRequests[sequenceNumber].mintFinalized = true;

        dwaginz.mint(request.user, fullUri);

        emit TokenMinted(request.user, mintedDragonCount);
    }

    // -------------------------------------------------------
    // Utility functions
    // ------------------------------------------------------

    /**
     * @dev Adds a token ID to the staked token array for a user.
     * @param tokenId The ID of the token to be added.
     */
    function add(uint256 tokenId) internal {
        uint256[] storage tokenIds = stakedTokenIds[msg.sender];
        tokenIndexInArray[tokenId] = tokenIds.length;
        tokenIds.push(tokenId);
    }

    /**
     * @dev Removes a token ID from the staked token array for a user.
     * @param tokenId The ID of the token to be removed.
     */
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

    /**
     * @dev prevent direct transfers of tokens to the contract
     */
    function onERC721Received(
        address,
        address,
        uint256,
        bytes memory
    ) public view override returns (bytes4) {
        if (!stakingInProgress) revert DirectTransferNotAllowed();
        return this.onERC721Received.selector;
    }

    /**
     * @dev upgrading the contract
     */
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}

    /**
     * @dev returns the version of the contract
     */
    function version() public pure returns (string memory) {
        return "1.0";
    }
}
