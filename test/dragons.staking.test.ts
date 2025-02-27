import { ethers, upgrades } from "hardhat";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

import { expect } from "chai";
import { DragonForge } from "../typechain-types";
import { rarityLevels } from "./rarityLevels";
import { tierTypes } from "./tierType";

describe("DragonForge Tests", async function () {
  async function cbcFixture() {
    const [owner, user1, user2, user3] = await ethers.getSigners();

    const MockEntropy = await ethers.getContractFactory("MockEntropy");
    const entropy = await MockEntropy.deploy(await owner.getAddress());
    await entropy.waitForDeployment();

    const Dragons = await ethers.getContractFactory("Dragons");
    const dragons = await Dragons.deploy();
    await dragons.waitForDeployment();

    const DinnerParty = await ethers.getContractFactory("DinnerParty");
    const dinnerParty = await DinnerParty.deploy();
    await dinnerParty.waitForDeployment();

    const DerpyDragons = await ethers.getContractFactory("DerpyDragons");
    //@ts-ignore
    const derpyDragons = await DerpyDragons.deploy();
    await derpyDragons.waitForDeployment();

    await dragons.mint(await user1.getAddress(), 10);
    await dragons.mint(await user2.getAddress(), 10);
    await dragons.mint(await user3.getAddress(), 10);

    const DragonForge = await ethers.getContractFactory("DragonForge");
    const dragonForgeUntyped = await upgrades.deployProxy(
      DragonForge,
      [
        await entropy.getAddress(),
        40,
        await dragons.getAddress(),
        await dinnerParty.getAddress(),
        await derpyDragons.getAddress(),
        "0x52DeaA1c84233F7bb8C8A45baeDE41091c616506",
      ],
      { initializer: "initialize" }
    );
    await dragonForgeUntyped.waitForDeployment();

    const dragonForge = dragonForgeUntyped as unknown as DragonForge;

    await dragonForge.initializeTierTypes(tierTypes);
    await dragonForge.initializeRarityLevels(rarityLevels);

    // console.log(await dragonForge.getAddress());
    return {
      owner,
      user1,
      user2,
      user3,
      dragonForge,
      dragons,
    };
  }

  describe("Staking Tests", async function () {
    it("should allow a user to stake tokens when staking is open", async function () {
      const { user1, dragonForge, dragons } = await loadFixture(cbcFixture);

      // Open staking mode
      await dragonForge.setStakingMode(true);

      // Approve the contract to transfer tokens
      const tokenIds = [1, 2, 3];
      await dragons
        .connect(user1)
        .setApprovalForAll(await dragonForge.getAddress(), true);

      // Stake the tokens
      await expect(dragonForge.connect(user1).stake(tokenIds))
        .to.emit(dragonForge, "Staked")
        .withArgs(await user1.getAddress(), 1)
        .and.to.emit(dragonForge, "Staked")
        .withArgs(await user1.getAddress(), 2)
        .and.to.emit(dragonForge, "Staked")
        .withArgs(await user1.getAddress(), 3);

      // Verify that tokens are now owned by the contract
      for (const tokenId of tokenIds) {
        expect(await dragons.ownerOf(tokenId)).to.equal(
          await dragonForge.getAddress()
        );
      }

      expect(
        await dragonForge.getTokensStaked(await user1.getAddress())
      ).to.deep.equal([1n, 2n, 3n]);
      // Verify staking properties
      const stakedProps1 = await dragonForge.stakedTokenProps(1);
      expect(stakedProps1.owner).to.equal(await user1.getAddress());
      expect(stakedProps1.checkInTimestamp).to.be.greaterThan(0);
    });

    it("should revert if staking is closed", async function () {
      const { user1, dragonForge } = await loadFixture(cbcFixture);

      // Attempt to stake while staking is closed
      const tokenIds = [1];
      await expect(
        dragonForge.connect(user1).stake(tokenIds)
      ).to.be.revertedWithCustomError(dragonForge, "StakingClosed");
    });

    it("should revert if token is already staked", async function () {
      const { user1, dragonForge, dragons } = await loadFixture(cbcFixture);

      // Open staking mode
      await dragonForge.setStakingMode(true);

      // Approve the contract to transfer tokens
      const tokenIds = [1];
      await dragons
        .connect(user1)
        .setApprovalForAll(await dragonForge.getAddress(), true);

      // Stake the tokens
      await dragonForge.connect(user1).stake(tokenIds);

      // Attempt to stake the same tokens again
      await expect(
        dragonForge.connect(user1).stake(tokenIds)
      ).to.be.revertedWithCustomError(dragonForge, "AlreadyStaked");
    });

    it("should revert if a user tries to stake a token they don't own", async function () {
      const { user2, dragonForge, dragons } = await loadFixture(cbcFixture);

      // Open staking mode
      await dragonForge.setStakingMode(true);

      // Attempt to stake a token owned by another user
      const tokenIds = [1];
      await expect(
        dragonForge.connect(user2).stake(tokenIds)
      ).to.be.revertedWithCustomError(dragonForge, "NotOwnerOfToken");
    });

    it("should track new stakers correctly", async function () {
      const { user1, dragonForge, dragons } = await loadFixture(cbcFixture);

      // Open staking mode
      await dragonForge.setStakingMode(true);

      // Approve and stake tokens
      const tokenIds = [1, 2];
      await dragons
        .connect(user1)
        .setApprovalForAll(await dragonForge.getAddress(), true);
      await dragonForge.connect(user1).stake(tokenIds);

      // Verify allStakers array includes the user
      const allStakers = await dragonForge.getAllStakers();
      expect(allStakers).to.include(await user1.getAddress());

      // Verify that `hasStaked` is true for the user
      const hasStaked = await dragonForge.hasStaked(await user1.getAddress());
      expect(hasStaked).to.be.true;
    });
  });

  describe("Unstaking Tests", async function () {
    it("should allow a user to unstake tokens they have staked", async function () {
      const { user1, dragonForge, dragons } = await loadFixture(cbcFixture);

      // Open staking mode and approve tokens
      await dragonForge.setStakingMode(true);
      const tokenIds = [1, 2, 3];
      await dragons
        .connect(user1)
        .setApprovalForAll(await dragonForge.getAddress(), true);

      // Stake the tokens
      await dragonForge.connect(user1).stake(tokenIds);

      // Unstake the tokens
      await expect(dragonForge.connect(user1).unstake(tokenIds))
        .to.emit(dragonForge, "Unstaked")
        .withArgs(await user1.getAddress(), 1)
        .and.to.emit(dragonForge, "Unstaked")
        .withArgs(await user1.getAddress(), 2)
        .and.to.emit(dragonForge, "Unstaked")
        .withArgs(await user1.getAddress(), 3);

      // Verify the tokens are returned to the user
      for (const tokenId of tokenIds) {
        expect(await dragons.ownerOf(tokenId)).to.equal(
          await user1.getAddress()
        );
      }

      // Verify staking properties are reset
      for (const tokenId of tokenIds) {
        const stakedProps = await dragonForge.stakedTokenProps(tokenId);
        expect(stakedProps.owner).to.equal(ethers.ZeroAddress);
        expect(stakedProps.checkInTimestamp).to.equal(0);
      }
    });

    it("should revert if the user tries to unstake a token they don't own", async function () {
      const { user1, user2, dragonForge, dragons } = await loadFixture(
        cbcFixture
      );

      // Open staking mode and approve tokens for user1
      await dragonForge.setStakingMode(true);
      const tokenIds = [1];
      await dragons
        .connect(user1)
        .setApprovalForAll(await dragonForge.getAddress(), true);

      // Stake the tokens
      await dragonForge.connect(user1).stake(tokenIds);

      // Attempt to unstake by another user
      await expect(
        dragonForge.connect(user2).unstake(tokenIds)
      ).to.be.revertedWithCustomError(dragonForge, "NotStakedOwner");
    });

    it("should reset rewards for unstaked tokens", async function () {
      const { user1, dragonForge, dragons } = await loadFixture(cbcFixture);

      // Open staking mode and approve tokens
      await dragonForge.setStakingMode(true);
      const tokenIds = [1, 2];
      await dragons
        .connect(user1)
        .setApprovalForAll(await dragonForge.getAddress(), true);

      // Stake the tokens
      await dragonForge.connect(user1).stake(tokenIds);

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10]); // 10 days
      await ethers.provider.send("evm_mine", []);

      // Unstake the tokens
      await dragonForge.connect(user1).unstake(tokenIds);

      // Verify rewards are reset for the unstaked tokens
      for (const tokenId of tokenIds) {
        const stakedProps = await dragonForge.stakedTokenProps(tokenId);
        expect(stakedProps.checkInTimestamp).to.equal(0);
      }
    });

    it("should update owedRewards if there are pending rewards", async function () {
      const { user1, dragonForge, dragons } = await loadFixture(cbcFixture);

      // Open staking mode and approve tokens
      await dragonForge.setStakingMode(true);
      const tokenIds = [1];
      await dragons
        .connect(user1)
        .setApprovalForAll(await dragonForge.getAddress(), true);

      // Stake the tokens
      await dragonForge.connect(user1).stake(tokenIds);

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 5]); // 5 days
      await ethers.provider.send("evm_mine", []);

      const pendingRewards = await dragonForge.pendingRewards(
        await user1.getAddress()
      );
      console.log(pendingRewards);

      // Unstake the tokens
      await dragonForge.connect(user1).unstake(tokenIds);

      // Verify owedRewards is updated
      const owedRewards = await dragonForge.owedRewards(
        await user1.getAddress()
      );

      console.log(owedRewards);

      expect(owedRewards).to.be.greaterThan(0);
    });

    it("should calculate rewards correctly with pointsPerHourPerToken set to 1000", async function () {
      const { user1, dragonForge, dragons } = await loadFixture(cbcFixture);

      // Set pointsPerHourPerToken to 1000
      await dragonForge.setPointsPerHourPerToken(1000);

      // Open staking mode
      await dragonForge.setStakingMode(true);

      // Approve and stake tokens
      const tokenIds = [1];
      await dragons
        .connect(user1)
        .setApprovalForAll(await dragonForge.getAddress(), true);
      await dragonForge.connect(user1).stake(tokenIds);

      // Advance time by 10 hours
      await ethers.provider.send("evm_increaseTime", [10 * 60 * 60]); // 10 hours
      await ethers.provider.send("evm_mine", []);

      // Calculate pending rewards
      const pendingRewards = await dragonForge.pendingRewards(
        await user1.getAddress()
      );

      // Expected rewards: 10 hours * 100000 points/hour
      const expectedRewards = 10 * 1000;

      console.log("Pending Rewards:", pendingRewards.toString());
      console.log("Expected Rewards:", expectedRewards.toString());

      // Check if pending rewards match expected rewards
      expect(pendingRewards).to.equal(expectedRewards);
    });

    it("should continue using the old pointsPerHourPerToken for already staked tokens until unstaked", async function () {
      const { user1, dragonForge, dragons } = await loadFixture(cbcFixture);

      // Set initial pointsPerHourPerToken to 10000
      await dragonForge.setPointsPerHourPerToken(1);

      // Open staking mode
      await dragonForge.setStakingMode(true);

      // Approve and stake tokens
      const tokenIds = [1];
      await dragons
        .connect(user1)
        .setApprovalForAll(await dragonForge.getAddress(), true);
      await dragonForge.connect(user1).stake(tokenIds);

      // Advance time by 5 hours
      await ethers.provider.send("evm_increaseTime", [5 * 60 * 60]); // 5 hours
      await ethers.provider.send("evm_mine", []);

      await dragonForge.connect(user1).unstake(tokenIds);

      const fistPendingRewards = await dragonForge.pendingRewards(
        await user1.getAddress()
      );
      expect(fistPendingRewards).to.equal(5 * 1);
      console.log("First Pending Rewards:", fistPendingRewards.toString());
      console.log("Expected Rewards:", 5 * 1);
      await dragonForge.setPointsPerHourPerToken(1000);
      console.log(
        "currentRewards unstaked after point increase:",
        await dragonForge.pendingRewards(await user1.getAddress()) // Ausgabe: 5
      );

      expect(
        await dragonForge.pendingRewards(await user1.getAddress())
      ).to.equal(5);

      await dragonForge.connect(user1).stake(tokenIds);

      // Advance time by another 5 hours
      await ethers.provider.send("evm_increaseTime", [5 * 60 * 60]); // 5 hours
      await ethers.provider.send("evm_mine", []);

      // Calculate pending rewards
      const pendingRewards = await dragonForge.pendingRewards(
        await user1.getAddress()
      );

      // Expected rewards:
      // First 5 hours: 5 * 10000
      const secondPendingRewards = 5 * 1 + 5 * 1000;

      console.log("Second Pending Rewards:", pendingRewards.toString()); // Ausgabe: 50005 (5 von davor und 5000 von den 5 Stunden nach dem restaken)
      console.log("Second Expected Rewards:", secondPendingRewards.toString()); // Ausgabe: 50005

      // Verify pending rewards match expected rewards
      expect(pendingRewards).to.equal(secondPendingRewards);

      // Unstake tokens
      await dragonForge.connect(user1).unstake(tokenIds);

      // Stake again with new pointsPerHourPerToken
      await dragonForge.connect(user1).stake(tokenIds);

      console.log("Pending Rewards:", pendingRewards.toString());
      console.log("Expected Rewards:", secondPendingRewards.toString());

      // Advance time by another 5 hours
      await ethers.provider.send("evm_increaseTime", [5 * 60 * 60]); // 5 hours
      await ethers.provider.send("evm_mine", []);

      await dragonForge.connect(user1).unstake(tokenIds);

      // Calculate pending rewards after unstake and restake
      const newPendingRewards = await dragonForge.pendingRewards(
        await user1.getAddress()
      );

      // Expected rewards:
      // First 10 hours: 10 * 1000 (old calculation before unstake)
      // Next 5 hours: 5 * 1000 (new calculation after restake)
      const thirdExpectedRewards = 5 * 1 + 10 * 1000;

      console.log("New Pending Rewards:", newPendingRewards.toString()); // Ausgabe: 1000
      console.log("New Expected Rewards:", thirdExpectedRewards.toString()); // Ausgabe: 1000

      // Verify new pending rewards match new expected rewards
      expect(newPendingRewards).to.equal(thirdExpectedRewards);
    });

    it("should revert if no tokens are specified for unstaking", async function () {
      const { user1, dragonForge } = await loadFixture(cbcFixture);

      // Attempt to unstake with an empty array
      await expect(
        dragonForge.connect(user1).unstake([])
      ).to.be.revertedWithCustomError(dragonForge, "InvalidTokenIndex");
    });
  });

  it("should correctly calculate rewards for tokens staked at different times and handle unstaking", async function () {
    const { user1, dragonForge, dragons } = await loadFixture(cbcFixture);

    await dragonForge.setStakingMode(true);
    await dragons
      .connect(user1)
      .setApprovalForAll(await dragonForge.getAddress(), true);

    // Stake tokens
    const tokenIds = [1];
    await dragonForge.connect(user1).stake(tokenIds);

    // Advance time
    await ethers.provider.send("evm_increaseTime", [5 * 60 * 60]); // 5 hours
    await ethers.provider.send("evm_mine", []);

    // Stake another token after 5 hours
    const tokenIds2 = [2];
    await dragonForge.connect(user1).stake(tokenIds2);

    // Advance time
    await ethers.provider.send("evm_increaseTime", [10 * 60 * 60]); // 10 hours
    await ethers.provider.send("evm_mine", []);

    // Unstake tokens
    await dragonForge.connect(user1).unstake([...tokenIds, ...tokenIds2]);

    // Get owed rewards
    const owedRewards = await dragonForge.owedRewards(await user1.getAddress());
    console.log("Owed rewards after unstake:", owedRewards.toString());

    // Expected rewards
    const pointsPerHour = 960n / 24n; // Points per hour per token
    const expectedRewards =
      5n * pointsPerHour + // Token 1: First 5 hours
      10n * pointsPerHour + // Token 1: Next 10 hours
      10n * pointsPerHour; // Token 2: 10 hours

    console.log("Difference:", (owedRewards - expectedRewards).toString());

    // Check with a tolerance of ±1
    const tolerance = 1n;
    expect(owedRewards).to.be.closeTo(expectedRewards, tolerance);
  });

  it("should prevent users from directly transferring tokens to the contract", async function () {
    const { user1, dragons, dragonForge } = await loadFixture(cbcFixture);

    await expect(
      dragons
        .connect(user1)
        ["safeTransferFrom(address,address,uint256)"](
          user1.address,
          await dragonForge.getAddress(),
          1
        )
    ).to.be.revertedWithCustomError(dragonForge, "DirectTransferNotAllowed");
  });
});
