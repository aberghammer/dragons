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

contract DragonForge is
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
    error InvalidTierType();
    error InputMismatch();
    error TooManyTierTypes();
    error InvalidProbabilitySum();
    error ConfigMismatch();
    error TiersNotInitialized();
    error NoMintsLeft();
    error CheckinToEarly();
    error MintingClosed();
    error MinPerDayNotMatched();

    event StakingModeUpdated(bool open);
    event Staked(address indexed user, uint256 tokenId);
    event PointsPerHourPerDayUpdated(uint256 points);
    event Unstaked(address indexed user, uint256 tokenId);
    event TokenMinted(address indexed user, uint256 tokenId);
    event PointsRequiredUpdated(uint256 tokenType, uint256 points);
    event MintRequested(address indexed user, uint64 requestId);
    event MintFailed(address indexed user, uint64 requestId);
    event TokenReadyForMint(address indexed user, uint64 requestId);
    event TierTypesInitialized();
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
        uint256 payedPrice;
        uint256 tokenId;
        uint256 randomNumber;
        uint256 timestamp;
        string uri;
        uint8 tierType;
        bool requestCompleted;
        bool cancelled;
        bool mintFinalized;
    }

    struct RarityLevel {
        uint256 minted;
        uint256 maxSupply;
        string tokenUri;
    }

    struct TierType {
        uint256 price;
        uint256[] probabilities;
    }

    bool public stakingOpen;
    bool public mintingOpen;
    bool public tiersInitialized;
    bool public rarityLevelsInitialized;
    bool internal stakingInProgress;

    uint public pointsPerHourPerToken;

    uint public mintedDragonCount;
    uint public mintRequestId;
    uint public checkinBonus;
    uint public dinnerPartyDiscount;
    uint public existingTiers;
    uint public existingRarityLevels;
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

    mapping(uint8 => TierType) public tierTypes;
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

        stakedTokenIds[address(0)].push();
    }

    /**
     * @dev Initializes the rarity levels for the contract.
     * @param _rarityLevels The rarity levels to be initialized.
     */
    function initializeRarityLevels(
        RarityLevel[] memory _rarityLevels
    ) external onlyOwner {
        if (!tiersInitialized) revert TiersNotInitialized();
        if (_rarityLevels.length != tierTypes[0].probabilities.length)
            revert ConfigMismatch();
        for (uint8 i = 0; i < _rarityLevels.length; i++) {
            rarityLevels[i] = RarityLevel({
                minted: 0,
                maxSupply: _rarityLevels[i].maxSupply,
                tokenUri: _rarityLevels[i].tokenUri
            });
        }
        existingRarityLevels = _rarityLevels.length;
        rarityLevelsInitialized = true;
        emit RarityLevelsInitialized();
    }

    /**
     * @dev Initializes the tier types for the contract.
     * @param newTierTypes The tier types to be initialized.
     */
    function initializeTierTypes(
        TierType[] memory newTierTypes
    ) external onlyOwner {
        for (uint8 i = 0; i < newTierTypes.length; i++) {
            uint256 totalProbability = 0;

            for (uint8 j = 0; j < newTierTypes[i].probabilities.length; j++) {
                totalProbability += newTierTypes[i].probabilities[j];
            }

            if (totalProbability != 10000) {
                revert InvalidProbabilitySum();
            }

            tierTypes[i] = newTierTypes[i];
        }
        tiersInitialized = true;
        existingTiers = newTierTypes.length;
        emit TierTypesInitialized();
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
     * @param pointsPerHour The new points required.
     */
    function setPointsPerHourPerToken(
        uint256 pointsPerHour
    ) external onlyOwner {
        pointsPerHourPerToken = pointsPerHour;
        emit PointsPerHourPerDayUpdated(pointsPerHour);
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
     * @param discount The discount in percent (required).
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
     * @dev helper functon for getting the tierType configuration
     * @param tierTypeId The ID of the tier type to be retrieved.
     */
    function getTierTypeById(
        uint8 tierTypeId
    ) external view returns (TierType memory) {
        TierType storage tierType = tierTypes[tierTypeId];
        return (tierType);
    }

    function getAllTierTypes() external view returns (TierType[] memory) {
        TierType[] memory allTierTypes = new TierType[](existingTiers);
        for (uint8 i = 0; i < existingTiers; i++) {
            allTierTypes[i] = tierTypes[i];
        }
        return allTierTypes;
    }

    function getAllRarityLevels() external view returns (RarityLevel[] memory) {
        RarityLevel[] memory allRarityLevels = new RarityLevel[](
            existingRarityLevels
        );
        for (uint8 i = 0; i < existingRarityLevels; i++) {
            allRarityLevels[i] = rarityLevels[i];
        }
        return allRarityLevels;
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
     * @param tierType The type of tier to be requested.
     */
    function requestToken(uint8 tierType) external payable nonReentrant {
        if (tierType >= existingTiers) revert InvalidTierType();
        if (!mintingOpen) revert MintingClosed();

        TierType storage selectedTierType = tierTypes[tierType];
        bool hasMintCapacity = false;

        for (uint8 i = 0; i < selectedTierType.probabilities.length; i++) {
            if (selectedTierType.probabilities[i] == 0) {
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

        uint256 discountPercentage = 0;

        if (dinnerPartyDiscount > 0) {
            discountPercentage =
                (dinnerParty.balanceOf(msg.sender) * 100) /
                dinnerPartyDiscount;
        }

        uint256 pointsRequired = tierTypes[tierType].price;

        if (discountPercentage > 50) {
            discountPercentage = 50; // max 50% discount
        }

        pointsRequired = (pointsRequired * (100 - discountPercentage)) / 100;

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
            payedPrice: pointsRequired,
            tokenId: 0,
            randomNumber: 0,
            timestamp: block.timestamp,
            uri: "",
            tierType: tierType,
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

        owedRewards[request.user] += request.payedPrice;

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

        //1) First we check which rarities are still available
        // Example: {common -> 18%, uncommon -> 20%} => sum = 38.
        uint8[] memory availableRarities = new uint8[](existingRarityLevels);
        uint256 availableCount = 0;
        for (uint8 i = 0; i < existingRarityLevels; i++) {
            if (
                // rarities with 0% probability are not available
                rarityLevels[i].minted < rarityLevels[i].maxSupply &&
                tierTypes[request.tierType].probabilities[i] > 0
            ) {
                availableRarities[availableCount] = i;
                availableCount++;
            }
        }

        //if a request wasn't resolved quick enough, and another user minted out, we refund the user
        if (availableCount == 0) {
            // If no tokens of rarity left -> Fail + Refund
            owedRewards[request.user] += request.payedPrice;
            request.cancelled = true;
            emit MintFailed(request.user, sequenceNumber);
            return;
        }

        // 2) Calculate the total probability space
        // Example: {common -> 18%, uncomon -> 20%} => totalAvalableProbability = 38.
        // Example: User tiers a 25 => effectiveRandomValue = 25.
        // We need to find the rarity bin that corresponds to the effective random value
        // common -> 18% so 25 fits not in Bin2
        // uncommon + common --> 20% + 18% = 38% => 25% < 38%. So we select uncommon
        uint256 totalAvailableProbability = 0;
        for (uint8 k = 0; k < availableCount; k++) {
            uint8 rarId = availableRarities[k];
            totalAvailableProbability += tierTypes[request.tierType]
                .probabilities[rarId];
        }
        // Security check: totalAvailableProbability must not be 0
        // (should never happen if the contract is set up correctly)
        // => Refund the user
        if (totalAvailableProbability == 0) {
            owedRewards[request.user] += request.payedPrice;
            request.cancelled = true;
            emit MintFailed(request.user, sequenceNumber);
            return;
        }

        // We set up a logic to retier if the selected rarity is minted out
        uint8 finalRarityIndex = 0;
        uint256 usedRandomness = 0;
        bool minted = false;

        // we try 5 times to find a rarity that is not full
        for (uint8 attempt = 0; attempt < 5; attempt++) {
            // 3) calculate the effective random value on the *entire* probability space
            // instead of random % 100 => random % totalAvailableProbability
            // So a number between 0 and totalAvailableProbability - 1
            // Example: {common -> 18%, uncommon -> 20%} => totalAvalableProbability = 38%.
            // => effectiveRandomValue = random % 38 = {0,...,37}
            uint256 effectiveRandomValue = (attempt == 0)
                ? (request.randomNumber % totalAvailableProbability)
                : (uint256(
                    keccak256(abi.encode(request.randomNumber, usedRandomness))
                ) % totalAvailableProbability);

            // 4) Find the rarity bin that corresponds to the effective random value
            uint256 cumulativeProbability = 0;
            for (uint8 j = 0; j < availableCount; j++) {
                uint8 rarityIdx = availableRarities[j];
                cumulativeProbability += tierTypes[request.tierType]
                    .probabilities[rarityIdx];

                if (effectiveRandomValue < cumulativeProbability) {
                    // We found the rarity bin that corresponds to the effective random value
                    finalRarityIndex = rarityIdx;
                    break;
                }
            }

            // 5) Check if the rarity bin is still available
            if (
                rarityLevels[finalRarityIndex].minted <
                rarityLevels[finalRarityIndex].maxSupply
            ) {
                minted = true;
                break; // exit the loop
            } else {
                // If the rarity bin is full
                // (should never happen if the contract is set up correctly)
                // as we dont't know if future szenarios will be different
                // we leave it as it is
                usedRandomness++;
                finalRarityIndex = 0; // reset optional
            }
        }

        // 6) Check if we found a rarity that is not full
        // (should never happen if the contract is set up correctly)
        // as we dont't know if future szenarios will be different
        // we leave it as it is
        if (!minted) {
            // If no tokens left -> Fail + Refund
            owedRewards[request.user] += request.payedPrice;
            request.cancelled = true;
            emit MintFailed(request.user, sequenceNumber);
            return;
        }

        // 7) Minting the token
        rarityLevels[finalRarityIndex].minted += 1;
        mintedDragonCount += 1;
        request.tokenId = mintedDragonCount;

        // Generate new URI
        uint256 dragonNumberPerFolder = rarityLevels[finalRarityIndex].minted;
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
