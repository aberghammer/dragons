import { ethers, upgrades } from "hardhat";
import "@nomicfoundation/hardhat-toolbox";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { MockEntropy, DerpyDragons } from "../typechain-types";
import { rarityLevels, lowAmountRarityLevels } from "./rarityLevels";

describe("DerpyDragons Minting with Entropy", async function () {
  async function mintingFixture() {
    const [owner, user1, user2] = await ethers.getSigners();

    const Dragons = await ethers.getContractFactory("Dragons");
    const dragons = await Dragons.deploy();
    await dragons.waitForDeployment();

    await dragons.mint(await user1.getAddress(), 10);
    await dragons.mint(await user2.getAddress(), 10);

    const MockEntropy = await ethers.getContractFactory("MockEntropy");
    const entropy = await MockEntropy.deploy(await owner.getAddress());
    await entropy.waitForDeployment();

    const WrongMockEntropy = await ethers.getContractFactory("MockEntropy");
    const wrongEntropy = await WrongMockEntropy.deploy(
      await owner.getAddress()
    );
    await wrongEntropy.waitForDeployment();

    const DerpyDragons = await ethers.getContractFactory("DerpyDragons");
    const derpyDragonsUntyped = await upgrades.deployProxy(
      DerpyDragons,
      [
        "Derpy Dragons",
        "DD",
        await entropy.getAddress(),
        40,
        await dragons.getAddress(),
      ],
      { initializer: "initialize" }
    );
    await derpyDragonsUntyped.waitForDeployment();

    const derpyDragons = derpyDragonsUntyped as unknown as DerpyDragons;

    await derpyDragons.initializeRarityLevels(rarityLevels);

    // Set the DerpyDragons contract as the caller for the entropy contract
    await entropy.setCallerContract(await derpyDragons.getAddress());

    return {
      owner,
      user1,
      user2,
      derpyDragons,
      dragons,
      entropy,
      wrongEntropy,
    };
  }

  describe("Minting with Randomness", async function () {
    it("should initialize rarity levels correctly", async function () {
      const { derpyDragons } = await loadFixture(mintingFixture);

      for (let i = 0; i < rarityLevels.length; i++) {
        const rarity = await derpyDragons.rarityLevels(i); // Assuming 1-based indexing
        expect(rarity.minted).to.equal(0); // Default value
        expect(rarity.maxSupply).to.equal(rarityLevels[i].maxSupply);
        expect(rarity.tokenUri).to.equal(rarityLevels[i].tokenUri);
      }
    });

    it("should correctly handle a successful mint with randomness callback", async function () {
      const { user1, derpyDragons, dragons, entropy } = await loadFixture(
        mintingFixture
      );

      // Enable staking mode and stake tokens
      await derpyDragons.setStakingMode(true);
      const tokenIds = [1, 2, 3, 4, 5];
      await dragons
        .connect(user1)
        .setApprovalForAll(await derpyDragons.getAddress(), true);
      await derpyDragons.connect(user1).stake(tokenIds);

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10]); // 10 days
      await ethers.provider.send("evm_mine", []);

      // Mint token request
      const tx = await derpyDragons.connect(user1).mintToken(1, {
        value: ethers.parseEther("0.01"), // Mock fee
      });
      const receipt = await tx.wait();

      // console.log("Minted token receipt:", receipt);

      // Set up a filter for the MintRequested event and query it
      const filter = derpyDragons.filters.MintRequested();

      // console.log("Filter:", filter);

      // console.log("Block hash:", receipt.hash);

      const events = await derpyDragons.queryFilter(filter);

      // Verify the MintRequested event was emitted with the correct values
      const event = events[0];

      const sequenceNumber = event.args![1];

      expect(event.args!.user).to.equal(await user1.getAddress());
      expect(sequenceNumber).to.be.a("bigInt");

      // Manually trigger the entropy callback
      await entropy.fireCallbackManually(sequenceNumber, 12);

      // console.log("Minted token event:", await derpyDragons.mintRequests(1));

      await derpyDragons.selectRarityAndMint(sequenceNumber);

      // Verify that the token was minted and assigned to the user
      expect(await derpyDragons.ownerOf(1)).to.equal(await user1.getAddress());
      expect(await derpyDragons.mintedDragonCount()).to.equal(1);

      // Set up a filter for the TokenMinted event and query it
      const mintedFilter = derpyDragons.filters.TokenMinted();
      const mintedEvents = await derpyDragons.queryFilter(mintedFilter);

      // Verify the TokenMinted event
      const mintedEvent = mintedEvents[0];
      expect(mintedEvent.args!.user).to.equal(await user1.getAddress());
      expect(mintedEvent.args!.tokenId).to.equal(1);

      // console.log("Minted token event:", await derpyDragons.mintRequests(1));

      expect(await derpyDragons.balanceOf(await user1.getAddress())).to.equal(
        1
      );
    });

    it("should revert if mint request is not completed", async function () {
      const { user1, derpyDragons, dragons, entropy } = await loadFixture(
        mintingFixture
      );

      await derpyDragons.setStakingMode(true);
      await dragons
        .connect(user1)
        .setApprovalForAll(await derpyDragons.getAddress(), true);
      await derpyDragons.connect(user1).stake([1, 2, 3]);

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10]); // 10 days
      await ethers.provider.send("evm_mine", []);

      // Initialize rarity levels
      await derpyDragons.initializeRarityLevels(lowAmountRarityLevels);

      // Simulate a mint token request
      await derpyDragons.connect(user1).mintToken(1, {
        value: ethers.parseEther("0.01"), // Mock fee
      });

      // Do NOT trigger entropy callback (request remains incomplete)

      // Attempt to select rarity and mint
      await expect(
        derpyDragons.selectRarityAndMint(1)
      ).to.be.revertedWithCustomError(derpyDragons, "RequestNotCompleted");
    });

    it("should revert if rollType is invalid", async function () {
      const { user1, derpyDragons } = await loadFixture(mintingFixture);

      await expect(
        derpyDragons
          .connect(user1)
          .mintToken(7, { value: ethers.parseEther("0.01") })
      ).to.be.revertedWithCustomError(derpyDragons, "InvalidRollType");
    });

    it("should revert if user has insufficient points", async function () {
      const { user1, derpyDragons } = await loadFixture(mintingFixture);

      // User has no staked tokens or rewards
      await expect(
        derpyDragons
          .connect(user1)
          .mintToken(0, { value: ethers.parseEther("0.01") })
      )
        .to.be.revertedWithCustomError(derpyDragons, "InsufficientBalance")
        .withArgs(0, 1000); // Expect balance 0, required 1000
    });

    it("should revert if user provides insufficient fee", async function () {
      const { user1, derpyDragons, dragons, entropy } = await loadFixture(
        mintingFixture
      );

      // Enable staking mode and stake tokens
      await derpyDragons.setStakingMode(true);
      await dragons
        .connect(user1)
        .setApprovalForAll(await derpyDragons.getAddress(), true);
      await derpyDragons.connect(user1).stake([1, 2, 3]);

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10]); // 10 days
      await ethers.provider.send("evm_mine", []);

      // Provide less than required fee
      await expect(
        derpyDragons.connect(user1).mintToken(1, {
          value: ethers.parseEther("0.009"),
        })
      ).to.be.revertedWithCustomError(derpyDragons, "InsufficientFee");
    });

    it("should mint successfully if all conditions are met", async function () {
      const { user1, derpyDragons, dragons, entropy } = await loadFixture(
        mintingFixture
      );

      // Enable staking mode and stake tokens
      await derpyDragons.setStakingMode(true);
      await dragons
        .connect(user1)
        .setApprovalForAll(await derpyDragons.getAddress(), true);
      await derpyDragons.connect(user1).stake([4, 5, 6]);

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10]); // 10 days
      await ethers.provider.send("evm_mine", []);

      // Successful mint
      const tx = await derpyDragons.connect(user1).mintToken(1, {
        value: ethers.parseEther("0.01"),
      });
      await tx.wait();

      // Verify the mint request was logged
      const mintEvent = (
        await derpyDragons.queryFilter(derpyDragons.filters.MintRequested())
      )[0];
      expect(mintEvent.args!.user).to.equal(await user1.getAddress());
    });

    it("should handle minting another rarity when selected rarity is unavailable", async function () {
      const { user1, derpyDragons, dragons, entropy } = await loadFixture(
        mintingFixture
      );

      await derpyDragons.initializeRarityLevels(lowAmountRarityLevels);
      await derpyDragons.setStakingMode(true);
      await dragons
        .connect(user1)
        .setApprovalForAll(await derpyDragons.getAddress(), true);
      await derpyDragons.connect(user1).stake([4, 5, 6]);

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10]); // 10 days
      await ethers.provider.send("evm_mine", []);

      // Mint token request
      await derpyDragons.connect(user1).mintToken(1, {
        value: ethers.parseEther("0.01"), // Mock fee
      });

      // Trigger entropy callback to complete the randomness process
      await entropy.fireCallbackManually(1, 5);

      // Finalize the minting process
      await derpyDragons.selectRarityAndMint(1);

      const request1 = await derpyDragons.mintRequests(1);

      expect(request1.uri).to.equal("ar://common-folder/1.json");

      await derpyDragons.connect(user1).mintToken(1, {
        value: ethers.parseEther("0.01"), // Mock fee
      });

      // Trigger entropy callback to complete the randomness process
      await entropy.fireCallbackManually(2, 5);

      await derpyDragons.selectRarityAndMint(2);

      const request2 = await derpyDragons.mintRequests(2);

      expect(request2.uri).to.equal("ar://uncommon-folder/2.json");
    });

    it("should handle refund when no rarity is available", async function () {
      const { user1, derpyDragons, dragons, entropy } = await loadFixture(
        mintingFixture
      );

      // Initialize rarity levels
      await derpyDragons.initializeRarityLevels(lowAmountRarityLevels);
      await derpyDragons.setStakingMode(true);
      await dragons
        .connect(user1)
        .setApprovalForAll(await derpyDragons.getAddress(), true);
      await derpyDragons.connect(user1).stake([4, 5, 6]);

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10]); // 10 days
      await ethers.provider.send("evm_mine", []);

      // First mint: Token from rarity index 0
      await derpyDragons.connect(user1).mintToken(1, {
        value: ethers.parseEther("0.01"), // Mock fee
      });

      // Trigger entropy callback
      await entropy.fireCallbackManually(1, 5);

      // Finalize the minting process
      await derpyDragons.selectRarityAndMint(1);

      const request1 = await derpyDragons.mintRequests(1);
      expect(request1.uri).to.equal("ar://common-folder/1.json");

      // Second mint: Token from rarity index 1
      await derpyDragons.connect(user1).mintToken(1, {
        value: ethers.parseEther("0.01"), // Mock fee
      });

      const rewardsBefore = await derpyDragons.owedRewards(
        await user1.getAddress()
      );

      // Attempt to mint when no rarity is available
      await derpyDragons.connect(user1).mintToken(1, {
        value: ethers.parseEther("0.01"), // Mock fee
      });

      const rewardsAfter = await derpyDragons.owedRewards(
        await user1.getAddress()
      );

      // Trigger entropy callback
      await entropy.fireCallbackManually(2, 5);

      await derpyDragons.selectRarityAndMint(2);

      const request2 = await derpyDragons.mintRequests(2);
      expect(request2.uri).to.equal("ar://uncommon-folder/2.json");

      expect(rewardsAfter).to.equal(rewardsBefore - 2000n); // Refund should match the rollType price

      // Trigger entropy callback
      await entropy.fireCallbackManually(3, 5);

      // Finalize the minting process
      await derpyDragons.selectRarityAndMint(3);

      const rewardsEnd = await derpyDragons.owedRewards(
        await user1.getAddress()
      );

      const request3 = await derpyDragons.mintRequests(3);

      expect(rewardsBefore).to.equal(rewardsEnd); // Rewards should be depleted

      expect(request3.cancelled).to.equal(true);

      // Verify refund
      const owedRewards = await derpyDragons.owedRewards(
        await user1.getAddress()
      );
      expect(owedRewards).to.equal(rewardsBefore); // Refund should match the rollType price
    });

    it("should refund points for an expired mint request", async function () {
      const { user1, derpyDragons, dragons, entropy } = await loadFixture(
        mintingFixture
      );

      // Enable staking mode and stake tokens
      await derpyDragons.setStakingMode(true);
      await dragons
        .connect(user1)
        .setApprovalForAll(await derpyDragons.getAddress(), true);
      await derpyDragons.connect(user1).stake([1, 2, 3]);

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10]); // 10 days
      await ethers.provider.send("evm_mine", []);

      await derpyDragons.connect(user1).unstake([1, 2, 3]);

      const initialRewards = await derpyDragons.pendingRewards(
        await user1.getAddress()
      );

      // Submit a mint request
      const tx = await derpyDragons.connect(user1).mintToken(1, {
        value: ethers.parseEther("0.01"),
      });
      const receipt = await tx.wait();

      // Extract sequenceNumber from the MintRequested event
      const mintEvent = (
        await derpyDragons.queryFilter(derpyDragons.filters.MintRequested())
      )[0];
      const sequenceNumber = mintEvent.args![1];

      // Try resolving before expiration
      await expect(
        derpyDragons.connect(user1).resolveExpiredMint(sequenceNumber)
      ).to.be.revertedWithCustomError(derpyDragons, "MintRequestNotYetExpired");

      // Simulate expiration by advancing time
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 2]); // 2 more days
      await ethers.provider.send("evm_mine", []);

      // Resolve the expired mint request
      await derpyDragons.connect(user1).resolveExpiredMint(sequenceNumber);

      const finalRewards = await derpyDragons.pendingRewards(
        await user1.getAddress()
      );

      // Check that the request is marked as cancelled
      const mintRequest = await derpyDragons.mintRequests(sequenceNumber);
      expect(mintRequest.cancelled).to.equal(true);
      expect(mintRequest.requestCompleted).to.equal(false);

      // Check that MintFailed event was emitted
      const mintFailedEvent = (
        await derpyDragons.queryFilter(derpyDragons.filters.MintFailed())
      )[0];
      expect(mintFailedEvent.args![0]).to.equal(await user1.getAddress());
      expect(mintFailedEvent.args![1]).to.equal(sequenceNumber);
    });

    it("should revert if trying to resolve a completed mint request", async function () {
      const { user1, derpyDragons, dragons, entropy } = await loadFixture(
        mintingFixture
      );

      // Enable staking mode and stake tokens
      await derpyDragons.setStakingMode(true);
      await dragons
        .connect(user1)
        .setApprovalForAll(await derpyDragons.getAddress(), true);
      await derpyDragons.connect(user1).stake([4, 5, 6]);

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10]); // 10 days
      await ethers.provider.send("evm_mine", []);

      // Submit a mint request
      const tx = await derpyDragons.connect(user1).mintToken(2, {
        value: ethers.parseEther("0.01"),
      });
      const receipt = await tx.wait();

      // Extract sequenceNumber from the MintRequested event
      const mintEvent = (
        await derpyDragons.queryFilter(derpyDragons.filters.MintRequested())
      )[0];
      const sequenceNumber = mintEvent.args![1];

      // Manually complete the mint
      await entropy.fireCallbackManually(sequenceNumber, 42);

      // Try resolving the completed mint
      await expect(
        derpyDragons.connect(user1).resolveExpiredMint(sequenceNumber)
      ).to.be.revertedWithCustomError(derpyDragons, "MintAlreadyCompleted");
    });

    it("should revert if attempting to mint the same sequenceNumber twice", async function () {
      const { user1, derpyDragons, dragons, entropy } = await loadFixture(
        mintingFixture
      );

      await derpyDragons.setStakingMode(true);
      await dragons
        .connect(user1)
        .setApprovalForAll(await derpyDragons.getAddress(), true);
      await derpyDragons.connect(user1).stake([4, 5, 6]);

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10]); // 10 days
      await ethers.provider.send("evm_mine", []);
      // Submit a mint request
      const tx = await derpyDragons.connect(user1).mintToken(1, {
        value: ethers.parseEther("0.01"),
      });
      const receipt = await tx.wait();
      const mintEvent = (
        await derpyDragons.queryFilter(derpyDragons.filters.MintRequested())
      )[0];
      const sequenceNumber = mintEvent.args![1];

      // First callback completes the mint
      await entropy.fireCallbackManually(sequenceNumber, 50);
      await derpyDragons.selectRarityAndMint(sequenceNumber);

      // Attempt to mint the same sequenceNumber again
      await expect(
        derpyDragons.selectRarityAndMint(sequenceNumber)
      ).to.be.revertedWithCustomError(derpyDragons, "MintAlreadyCompleted");
    });

    it("should revert if trying to resolve a cancelled mint request", async function () {
      const { user1, derpyDragons, dragons } = await loadFixture(
        mintingFixture
      );

      // Enable staking mode and stake tokens
      await derpyDragons.setStakingMode(true);
      await dragons
        .connect(user1)
        .setApprovalForAll(await derpyDragons.getAddress(), true);
      await derpyDragons.connect(user1).stake([7, 8, 9]);

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10]); // 10 days
      await ethers.provider.send("evm_mine", []);

      // Submit a mint request
      const tx = await derpyDragons.connect(user1).mintToken(3, {
        value: ethers.parseEther("0.01"),
      });
      const receipt = await tx.wait();

      // Extract sequenceNumber from the MintRequested event
      const mintEvent = (
        await derpyDragons.queryFilter(derpyDragons.filters.MintRequested())
      )[0];
      const sequenceNumber = mintEvent.args![1];

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 2]); // 10 days
      await ethers.provider.send("evm_mine", []);

      // Manually cancel the request
      await derpyDragons.connect(user1).resolveExpiredMint(sequenceNumber);

      // Try resolving the already cancelled mint
      await expect(
        derpyDragons.connect(user1).resolveExpiredMint(sequenceNumber)
      ).to.be.revertedWithCustomError(
        derpyDragons,
        "MintRequestAlreadyCancelled"
      );
    });
  });

  describe("Entropy reverts", async function () {
    it("should revert if the mint request is already completed", async function () {
      const { user1, derpyDragons, dragons, entropy } = await loadFixture(
        mintingFixture
      );

      // Mock a valid mint request
      await derpyDragons.setStakingMode(true);
      await dragons
        .connect(user1)
        .setApprovalForAll(await derpyDragons.getAddress(), true);
      await derpyDragons.connect(user1).stake([7, 8, 9]);

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10]); // 10 days
      await ethers.provider.send("evm_mine", []);

      const tx = await derpyDragons.connect(user1).mintToken(1, {
        value: ethers.parseEther("0.01"),
      });
      const receipt = await tx.wait();
      const mintEvent = (
        await derpyDragons.queryFilter(derpyDragons.filters.MintRequested())
      )[0];
      const sequenceNumber = mintEvent.args![1];

      // First callback completes the request
      await entropy.fireCallbackManually(sequenceNumber, 50);

      // Second callback should revert
      await expect(
        entropy.fireCallbackManually(sequenceNumber, 50)
      ).to.be.revertedWithCustomError(derpyDragons, "RequestAlreadyCompleted");
    });

    it("should revert if the mint request is already cancelled", async function () {
      const { user1, derpyDragons, entropy, dragons } = await loadFixture(
        mintingFixture
      );

      // Mock a mint request
      await derpyDragons.setStakingMode(true);
      await dragons
        .connect(user1)
        .setApprovalForAll(await derpyDragons.getAddress(), true);
      await derpyDragons.connect(user1).stake([7, 8, 9]);

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10]); // 10 days
      await ethers.provider.send("evm_mine", []);

      const tx = await derpyDragons.connect(user1).mintToken(1, {
        value: ethers.parseEther("0.01"),
      });
      const receipt = await tx.wait();
      const mintEvent = (
        await derpyDragons.queryFilter(derpyDragons.filters.MintRequested())
      )[0];
      const sequenceNumber = mintEvent.args![1];

      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 1]); // 1 days
      await ethers.provider.send("evm_mine", []);

      // Cancel the mint request
      await derpyDragons.resolveExpiredMint(sequenceNumber);

      // Callback after cancellation should revert
      await expect(
        entropy.fireCallbackManually(sequenceNumber, 50)
      ).to.be.revertedWithCustomError(derpyDragons, "RequestAlreadyCancelled");
    });
  });
});
