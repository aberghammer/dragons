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

interface IDerpyDragons {
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

    struct StakedTokens {
        address owner; // The current owner of the staked token.
        uint256 checkInTimestamp; // The timestamp of the last check-in.
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
        uint256 minted; // Bereits gemintete Tokens dieser Rarität
        uint256 maxSupply; // Maximale Anzahl an Tokens dieser Rarität
        string tokenUri; // Basis-URI für die Token-JSONs
    }

    struct RollType {
        uint256 price; // Punkte, die benötigt werden
        uint256[] probabilities; // Wahrscheinlichkeiten für jede Stufe
    }

    bool public stakingOpen;
    uint public pointsPerHourPerToken;
    uint public pointsPerDayPerToken;
    uint public mintedDragonCount;
    uint public mintRequestId;
    bool internal stakingInProgress;
    address[] public allStakers;
    IERC721 public dragons;
    IDerpyDragons public derpyDragons;
    IEntropy public entropy;
    address public provider;
    bool public rolesInitialized;
    bool public rarityLevelsInitialized;
    uint public existingRolls;

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
        address dragonsAddress,
        address derpyDragonsAddress_
    ) public initializer {
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        __ERC721Holder_init();
        derpyDragons = IDerpyDragons(derpyDragonsAddress_);
        dragons = IERC721(dragonsAddress);
        entropy = IEntropy(entropy_);
        provider = 0x52DeaA1c84233F7bb8C8A45baeDE41091c616506;

        pointsPerHourPerToken = pointsPerHourPerToken_;
        pointsPerDayPerToken = pointsPerHourPerToken_ * 24;

        stakedTokenIds[address(0)].push();
    }

    function setStakingMode(bool open) external onlyOwner {
        stakingOpen = open;
        emit StakingModeUpdated(open);
    }

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

    function initializeRollTypes(
        RollType[] memory newRollTypes
    ) external onlyOwner {
        for (uint8 i = 0; i < newRollTypes.length; i++) {
            uint256 totalProbability = 0;

            // Validierung der Wahrscheinlichkeiten
            for (uint8 j = 0; j < newRollTypes[i].probabilities.length; j++) {
                totalProbability += newRollTypes[i].probabilities[j];
            }

            if (totalProbability != 100) {
                revert InvalidProbabilitySum();
            }

            // Roll-Typ initialisieren
            rollTypes[i] = newRollTypes[i];
        }
        rolesInitialized = true;
        existingRolls = newRollTypes.length;
        emit RollTypesInitialized();
    }

    function getEntropy() internal view override returns (address) {
        return address(entropy); // Return the stored entropy contract address
    }

    function getmintRequestsByUser(
        address user
    ) external view returns (uint256[] memory) {
        return mintRequestsByUser[user];
    }

    function setPointsPerDayPerToken(uint256 pointsPerDay) external onlyOwner {
        pointsPerHourPerToken = pointsPerDay / 24;
        pointsPerDayPerToken = pointsPerDay;
        emit PointsPerDayPerTokenUpdated(pointsPerDay);
    }

    function getAllStakers() external view returns (address[] memory) {
        return allStakers;
    }

    function getRollTypeById(
        uint8 rollTypeId
    ) external view returns (RollType memory) {
        RollType storage rollType = rollTypes[rollTypeId];
        return (rollType);
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
        // Zufallszahl speichern
        request.randomNumber = uint256(randomNumber);
        request.requestCompleted = true;

        emit TokenReadyForMint(request.user, sequenceNumber);
    }

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
        // Punkte zurückerstatten
        owedRewards[request.user] += pointsRequired;

        // Anfrage als abgebrochen markieren
        request.cancelled = true;

        emit MintFailed(request.user, sequenceNumber);
    }

    function selectRarityAndMint(uint64 sequenceNumber) external {
        MintRequest storage request = mintRequests[sequenceNumber];

        if (!request.requestCompleted) {
            revert RequestNotCompleted(sequenceNumber);
        }

        if (request.mintFinalized) {
            revert MintAlreadyCompleted(sequenceNumber);
        }

        uint8[] memory availableRarities = new uint8[](existingRolls);
        uint256 randomValue = request.randomNumber % 100; // Zufallswert zwischen 0 und 99
        uint8 finalRarityIndex = 0; // Platzhalter für die endgültige Rarität
        uint256 cumulativeProbability = 0; // Kumulative Wahrscheinlichkeit
        uint256 usedRandomness = 0; // Zähler für die Anzahl der verwendeten Zufallszahlen
        uint256 availableCount = 0; // Zähler für verfügbare Raritäten

        // Prüfe verfügbare Raritäten
        for (uint8 i = 0; i < existingRolls; i++) {
            // wenn die Rarität noch nicht ausverkauft ist
            if (rarityLevels[i].minted < rarityLevels[i].maxSupply) {
                availableRarities[availableCount] = i; // Speichere die verfügbare Rarität
                availableCount++;
            }
        }

        // Kombinierte Schleife: Verteile Wahrscheinlichkeiten und prüfe Verfügbarkeit
        for (uint8 attempt = 0; attempt < availableCount; attempt++) {
            // Generiere Zufallszahl beim ersten Versuch oder bei Fallback
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

            // Prüfe Verfügbarkeit der gewählten Rarität
            if (
                rarityLevels[finalRarityIndex].minted <
                rarityLevels[finalRarityIndex].maxSupply
            ) {
                break; // Gültige Rarität gefunden
            }

            // Fallback: Zufällige neue Rarität generieren
            cumulativeProbability = 0; // Reset für nächste Iteration
            usedRandomness++;
            finalRarityIndex = 0; // Reset, falls keine Rarität gefunden
        }

        // Falls keine verfügbare Rarität gefunden wurde (extrem unwahrscheinlich)
        if (
            rarityLevels[finalRarityIndex].minted >=
            rarityLevels[finalRarityIndex].maxSupply
        ) {
            owedRewards[request.user] += rollTypes[request.rollType].price;
            request.cancelled = true; // Markiere den Request als abgebrochen
            emit MintFailed(request.user, sequenceNumber);
            return;
        }

        // Mint-Logik, wenn Rarität verfügbar ist
        rarityLevels[finalRarityIndex].minted += 1;
        mintedDragonCount += 1;

        request.tokenId = mintedDragonCount;

        // URI für den geminteten Token erstellen
        string memory fullUri = string(
            abi.encodePacked(
                rarityLevels[finalRarityIndex].tokenUri,
                Strings.toString(mintedDragonCount),
                ".json"
            )
        );

        mintRequests[sequenceNumber].uri = fullUri;
        mintRequests[sequenceNumber].mintFinalized = true;

        // NFT minten
        derpyDragons.mint(request.user, fullUri);

        emit TokenMinted(request.user, mintedDragonCount);
    }

    function mintToken(uint8 rollType) external payable nonReentrant {
        if (rollType > existingRolls) revert InvalidRollType();

        RollType storage selectedRollType = rollTypes[rollType];
        bool hasMintCapacity = false;

        // Überprüfe die Mint-Kapazität für alle relevanten Wahrscheinlichkeiten
        for (uint8 i = 0; i < selectedRollType.probabilities.length; i++) {
            // Überspringe Wahrscheinlichkeiten von 0
            if (selectedRollType.probabilities[i] == 0) {
                continue;
            }

            // Prüfe, ob Mint-Kapazität vorhanden ist
            if (rarityLevels[i].minted < rarityLevels[i].maxSupply) {
                hasMintCapacity = true;
                break; // Mint-Kapazität gefunden, keine weitere Prüfung erforderlich
            }
        }

        // Wenn keine Mint-Kapazität gefunden wurde, breche ab
        if (!hasMintCapacity) {
            revert NoMintsLeft();
        }

        uint256 pointsRequired = rollTypes[rollType].price;

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
