// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IEntropy} from "@pythnetwork/entropy-sdk-solidity/IEntropy.sol";
import {IEntropyConsumer} from "@pythnetwork/entropy-sdk-solidity/IEntropyConsumer.sol";
import {EntropyStructs} from "@pythnetwork/entropy-sdk-solidity/EntropyStructs.sol";

// Mock Contract for testing
import "hardhat/console.sol";

contract MockEntropy is IEntropy {
    event RandomNumberRequested(uint64 sequenceNumber, address provider);
    event RandomNumberFulfilled(
        uint64 sequenceNumber,
        address provider,
        bytes32 randomNumber
    );

    address callerContract;

    function setCallerContract(address _callerContract) external {
        callerContract = _callerContract;
    }

    uint64 public nextSequenceNumber = 1;
    mapping(uint64 => bytes32) public randomNumbers;

    // Store a default provider address for testing purposes
    address public mockProvider;

    constructor(address _provider) {
        mockProvider = _provider;
    }

    function getDefaultProvider() external view override returns (address) {
        return mockProvider;
    }

    // Simulate the getFee method for testing
    function getFee(address provider) external pure override returns (uint128) {
        // Return a fixed fee for simplicity in testing (e.g., 0.01 ETH)
        return 0.01 ether;
    }

    function requestWithCallback(
        address, // provider
        bytes32 userRandomNumber
    ) external payable override returns (uint64 assignedSequenceNumber) {
        // Simulate assigning a sequence number
        assignedSequenceNumber = nextSequenceNumber++;

        // Emit an event for testing purposes
        emit RandomNumberRequested(assignedSequenceNumber, mockProvider);

        // Emit an event to indicate the random number was fulfilled

        return assignedSequenceNumber;
    }

    function fireCallbackManually(
        uint64 sequenceNumber,
        uint256 customRandomNumber
    ) public {
        // Use the custom random number if provided, otherwise simulate one
        bytes32 simulatedRandomNumber;
        if (customRandomNumber > 0) {
            simulatedRandomNumber = bytes32(customRandomNumber);
        } else {
            simulatedRandomNumber = keccak256(
                abi.encodePacked("userRandomNumber")
            );
        }

        // Directly call the callback function on the contract that needs the random number
        IEntropyConsumer(callerContract)._entropyCallback(
            sequenceNumber,
            mockProvider,
            simulatedRandomNumber
        );

        // Emit an event to indicate the random number was fulfilled
        emit RandomNumberFulfilled(
            sequenceNumber,
            mockProvider,
            simulatedRandomNumber
        );
    }

    function register(
        uint128 feeInWei,
        bytes32 commitment,
        bytes calldata commitmentMetadata,
        uint64 chainLength,
        bytes calldata uri
    ) external override {}

    function withdraw(uint128 amount) external override {}

    function withdrawAsFeeManager(
        address provider,
        uint128 amount
    ) external override {}

    function request(
        address provider,
        bytes32 userCommitment,
        bool useBlockHash
    ) external payable override returns (uint64 assignedSequenceNumber) {}

    function reveal(
        address provider,
        uint64 sequenceNumber,
        bytes32 userRevelation,
        bytes32 providerRevelation
    ) external override returns (bytes32 randomNumber) {}

    function revealWithCallback(
        address provider,
        uint64 sequenceNumber,
        bytes32 userRandomNumber,
        bytes32 providerRevelation
    ) external override {}

    function getProviderInfo(
        address provider
    ) external view override returns (EntropyStructs.ProviderInfo memory info) {
        // Mock implementation
        return
            EntropyStructs.ProviderInfo({
                feeInWei: 0.01 ether, // Beispielwert für die Gebühr in Wei
                accruedFeesInWei: 0.02 ether, // Beispiel für angesammelte Gebühren
                originalCommitment: keccak256(abi.encodePacked("commitment")), // Beispielcommitment
                originalCommitmentSequenceNumber: 1, // Beispielhafte Sequenznummer
                commitmentMetadata: abi.encodePacked("metadata"), // Beispielmetadaten
                uri: abi.encodePacked("https://example.com/reveal"), // Beispiel-URI
                endSequenceNumber: 1000, // Beispielhafte Endsequenznummer
                sequenceNumber: 500, // Beispielhafte aktuelle Sequenznummer
                currentCommitment: keccak256(
                    abi.encodePacked("currentCommitment")
                ), // Beispiel für aktuelle Verpflichtung
                currentCommitmentSequenceNumber: 500, // Sequenznummer für das aktuelle Commitment
                feeManager: mockProvider // Beispielhafte Fee Manager Adresse (mockProvider)
            });
    }

    function getRequest(
        address provider,
        uint64 sequenceNumber
    ) external view override returns (EntropyStructs.Request memory req) {
        // Mock implementation
        return
            EntropyStructs.Request({
                provider: address(0),
                sequenceNumber: 0,
                numHashes: 0,
                commitment: bytes32(0),
                blockNumber: 0,
                requester: address(0),
                useBlockhash: false,
                isRequestWithCallback: false
            });
    }

    function getAccruedPythFees()
        external
        view
        override
        returns (uint128 accruedPythFeesInWei)
    {}

    function setProviderFee(uint128 newFeeInWei) external override {}

    function setProviderFeeAsFeeManager(
        address provider,
        uint128 newFeeInWei
    ) external override {}

    function setProviderUri(bytes calldata newUri) external override {}

    function setFeeManager(address manager) external override {}

    function constructUserCommitment(
        bytes32 userRandomness
    ) external pure override returns (bytes32 userCommitment) {}

    function combineRandomValues(
        bytes32 userRandomness,
        bytes32 providerRandomness,
        bytes32 blockHash
    ) external pure override returns (bytes32 combinedRandomness) {}
}
