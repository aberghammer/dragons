// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";

contract DerpyDragonsV2 is
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

    event StakingModeUpdated(bool open);
    event Staked(address indexed user, uint256 tokenId);
    event PointsPerDayPerTokenUpdated(uint points);
    event Unstaked(address indexed user, uint256 tokenId);
    event TokenMinted(address indexed user, uint256 tokenId);
    event PointsRequiredUpdated(uint points);

    struct StakedTokens {
        address owner; // The current owner of the staked token.
        uint256 checkInTimestamp; // The timestamp of the last check-in.
    }

    bool public stakingOpen;
    uint public pointsPerHourPerToken;
    uint public pointsPerDayPerToken;
    uint public mintedDragonCount;
    bool internal stakingInProgress;
    address[] public allStakers;
    IERC721 public dragons;
    uint public pointsRequired;

    mapping(address user => uint256[] stakedTokens) public stakedTokenIds;
    mapping(uint256 tokenId => StakedTokens stakedTokens)
        public stakedTokenProps;
    mapping(address => bool) public hasStaked;
    mapping(uint256 => uint256) internal tokenIndexInArray;
    mapping(address => uint256) public owedRewards;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        string calldata contractName_,
        string calldata contractSymbol_,
        uint256 pointsPerDayPerToken_,
        uint256 pointsRequired_,
        address dragonsAddress
    ) public initializer {
        __Ownable_init(msg.sender);
        __ERC721_init(contractName_, contractSymbol_);
        __ERC721Enumerable_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        __ERC721Holder_init();
        dragons = IERC721(dragonsAddress);
        pointsRequired = pointsRequired_;
        pointsPerDayPerToken = pointsPerDayPerToken_;
        pointsPerHourPerToken = pointsPerDayPerToken_ / 24;
        stakedTokenIds[address(0)].push();
    }

    function setStakingMode(bool open) external onlyOwner {
        stakingOpen = open;
        emit StakingModeUpdated(open);
    }

    function setPointsRequired(uint points) external onlyOwner {
        pointsRequired = points;
        emit PointsRequiredUpdated(points);
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

    /**
     * @dev Mints a new token to the caller's address. Requires the caller to own 5 unclaimed tokens and pay 1,000,000 TOKEN.
     */
    function mintToken() external nonReentrant {
        (
            uint256 totalClaimable,
            uint256[] memory tokenIdsToReset
        ) = _calculatePendingRewards(msg.sender);

        _resetCurrentStakedRewards(tokenIdsToReset);

        uint256 allRewards = totalClaimable + owedRewards[msg.sender];

        if (allRewards < pointsRequired) {
            revert InsufficientBalance(allRewards, pointsRequired);
        }

        mintedDragonCount += 1;

        uint256 rewardsLeft = allRewards - pointsRequired;
        owedRewards[msg.sender] = rewardsLeft;

        _safeMint(msg.sender, mintedDragonCount);

        emit TokenMinted(msg.sender, mintedDragonCount);
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
        return "2.0";
    }
}
