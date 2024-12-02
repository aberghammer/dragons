import { ethers, upgrades } from "hardhat";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

import { expect } from "chai";
import { DerpyDragons } from "../typechain-types";
import { rarityLevels } from "./rarityLevels";

describe("DerpyDragons Tests", async function () {
  async function cbcFixture() {
    const [owner, user1, user2, user3] = await ethers.getSigners();

    const MockEntropy = await ethers.getContractFactory("MockEntropy");
    const entropy = await MockEntropy.deploy(await owner.getAddress());
    await entropy.waitForDeployment();

    const Dragons = await ethers.getContractFactory("Dragons");
    const dragons = await Dragons.deploy();
    await dragons.waitForDeployment();

    await dragons.mint(await user1.getAddress(), 10);
    await dragons.mint(await user2.getAddress(), 10);
    await dragons.mint(await user3.getAddress(), 10);

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

    // console.log(await derpyDragons.getAddress());
    return {
      owner,
      user1,
      user2,
      user3,
      derpyDragons,
      dragons,
    };
  }

  describe("Staking Tests", async function () {
    it("should allow a user to stake tokens when staking is open", async function () {
      const { user1, derpyDragons, dragons } = await loadFixture(cbcFixture);

      // Open staking mode
      await derpyDragons.setStakingMode(true);

      // Approve the contract to transfer tokens
      const tokenIds = [1, 2, 3];
      await dragons
        .connect(user1)
        .setApprovalForAll(await derpyDragons.getAddress(), true);

      // Stake the tokens
      await expect(derpyDragons.connect(user1).stake(tokenIds))
        .to.emit(derpyDragons, "Staked")
        .withArgs(await user1.getAddress(), 1)
        .and.to.emit(derpyDragons, "Staked")
        .withArgs(await user1.getAddress(), 2)
        .and.to.emit(derpyDragons, "Staked")
        .withArgs(await user1.getAddress(), 3);

      // Verify that tokens are now owned by the contract
      for (const tokenId of tokenIds) {
        expect(await dragons.ownerOf(tokenId)).to.equal(
          await derpyDragons.getAddress()
        );
      }

      // Verify staking properties
      const stakedProps1 = await derpyDragons.stakedTokenProps(1);
      expect(stakedProps1.owner).to.equal(await user1.getAddress());
      expect(stakedProps1.checkInTimestamp).to.be.greaterThan(0);
    });

    it("should revert if staking is closed", async function () {
      const { user1, derpyDragons } = await loadFixture(cbcFixture);

      // Attempt to stake while staking is closed
      const tokenIds = [1];
      await expect(
        derpyDragons.connect(user1).stake(tokenIds)
      ).to.be.revertedWithCustomError(derpyDragons, "StakingClosed");
    });

    it("should revert if token is already staked", async function () {
      const { user1, derpyDragons, dragons } = await loadFixture(cbcFixture);

      // Open staking mode
      await derpyDragons.setStakingMode(true);

      // Approve the contract to transfer tokens
      const tokenIds = [1];
      await dragons
        .connect(user1)
        .setApprovalForAll(await derpyDragons.getAddress(), true);

      // Stake the tokens
      await derpyDragons.connect(user1).stake(tokenIds);

      // Attempt to stake the same tokens again
      await expect(
        derpyDragons.connect(user1).stake(tokenIds)
      ).to.be.revertedWithCustomError(derpyDragons, "AlreadyStaked");
    });

    it("should revert if a user tries to stake a token they don't own", async function () {
      const { user2, derpyDragons, dragons } = await loadFixture(cbcFixture);

      // Open staking mode
      await derpyDragons.setStakingMode(true);

      // Attempt to stake a token owned by another user
      const tokenIds = [1];
      await expect(
        derpyDragons.connect(user2).stake(tokenIds)
      ).to.be.revertedWithCustomError(derpyDragons, "NotOwnerOfToken");
    });

    it("should track new stakers correctly", async function () {
      const { user1, derpyDragons, dragons } = await loadFixture(cbcFixture);

      // Open staking mode
      await derpyDragons.setStakingMode(true);

      // Approve and stake tokens
      const tokenIds = [1, 2];
      await dragons
        .connect(user1)
        .setApprovalForAll(await derpyDragons.getAddress(), true);
      await derpyDragons.connect(user1).stake(tokenIds);

      // Verify allStakers array includes the user
      const allStakers = await derpyDragons.getAllStakers();
      expect(allStakers).to.include(await user1.getAddress());

      // Verify that `hasStaked` is true for the user
      const hasStaked = await derpyDragons.hasStaked(await user1.getAddress());
      expect(hasStaked).to.be.true;
    });
  });

  describe("Unstaking Tests", async function () {
    it("should allow a user to unstake tokens they have staked", async function () {
      const { user1, derpyDragons, dragons } = await loadFixture(cbcFixture);

      // Open staking mode and approve tokens
      await derpyDragons.setStakingMode(true);
      const tokenIds = [1, 2, 3];
      await dragons
        .connect(user1)
        .setApprovalForAll(await derpyDragons.getAddress(), true);

      // Stake the tokens
      await derpyDragons.connect(user1).stake(tokenIds);

      // Unstake the tokens
      await expect(derpyDragons.connect(user1).unstake(tokenIds))
        .to.emit(derpyDragons, "Unstaked")
        .withArgs(await user1.getAddress(), 1)
        .and.to.emit(derpyDragons, "Unstaked")
        .withArgs(await user1.getAddress(), 2)
        .and.to.emit(derpyDragons, "Unstaked")
        .withArgs(await user1.getAddress(), 3);

      // Verify the tokens are returned to the user
      for (const tokenId of tokenIds) {
        expect(await dragons.ownerOf(tokenId)).to.equal(
          await user1.getAddress()
        );
      }

      // Verify staking properties are reset
      for (const tokenId of tokenIds) {
        const stakedProps = await derpyDragons.stakedTokenProps(tokenId);
        expect(stakedProps.owner).to.equal(ethers.ZeroAddress);
        expect(stakedProps.checkInTimestamp).to.equal(0);
      }
    });

    it("should revert if the user tries to unstake a token they don't own", async function () {
      const { user1, user2, derpyDragons, dragons } = await loadFixture(
        cbcFixture
      );

      // Open staking mode and approve tokens for user1
      await derpyDragons.setStakingMode(true);
      const tokenIds = [1];
      await dragons
        .connect(user1)
        .setApprovalForAll(await derpyDragons.getAddress(), true);

      // Stake the tokens
      await derpyDragons.connect(user1).stake(tokenIds);

      // Attempt to unstake by another user
      await expect(
        derpyDragons.connect(user2).unstake(tokenIds)
      ).to.be.revertedWithCustomError(derpyDragons, "NotStakedOwner");
    });

    it("should reset rewards for unstaked tokens", async function () {
      const { user1, derpyDragons, dragons } = await loadFixture(cbcFixture);

      // Open staking mode and approve tokens
      await derpyDragons.setStakingMode(true);
      const tokenIds = [1, 2];
      await dragons
        .connect(user1)
        .setApprovalForAll(await derpyDragons.getAddress(), true);

      // Stake the tokens
      await derpyDragons.connect(user1).stake(tokenIds);

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10]); // 10 days
      await ethers.provider.send("evm_mine", []);

      // Unstake the tokens
      await derpyDragons.connect(user1).unstake(tokenIds);

      // Verify rewards are reset for the unstaked tokens
      for (const tokenId of tokenIds) {
        const stakedProps = await derpyDragons.stakedTokenProps(tokenId);
        expect(stakedProps.checkInTimestamp).to.equal(0);
      }
    });

    it("should update owedRewards if there are pending rewards", async function () {
      const { user1, derpyDragons, dragons } = await loadFixture(cbcFixture);

      // Open staking mode and approve tokens
      await derpyDragons.setStakingMode(true);
      const tokenIds = [1];
      await dragons
        .connect(user1)
        .setApprovalForAll(await derpyDragons.getAddress(), true);

      // Stake the tokens
      await derpyDragons.connect(user1).stake(tokenIds);

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 5]); // 5 days
      await ethers.provider.send("evm_mine", []);

      const pendingRewards = await derpyDragons.pendingRewards(
        await user1.getAddress()
      );
      console.log(pendingRewards);

      // Unstake the tokens
      await derpyDragons.connect(user1).unstake(tokenIds);

      // Verify owedRewards is updated
      const owedRewards = await derpyDragons.owedRewards(
        await user1.getAddress()
      );

      console.log(owedRewards);

      expect(owedRewards).to.be.greaterThan(0);
    });

    it("should revert if no tokens are specified for unstaking", async function () {
      const { user1, derpyDragons } = await loadFixture(cbcFixture);

      // Attempt to unstake with an empty array
      await expect(
        derpyDragons.connect(user1).unstake([])
      ).to.be.revertedWithCustomError(derpyDragons, "InvalidTokenIndex");
    });
  });

  it("should correctly calculate rewards for tokens staked at different times and handle unstaking", async function () {
    const { user1, derpyDragons, dragons } = await loadFixture(cbcFixture);

    await derpyDragons.setStakingMode(true);
    await dragons
      .connect(user1)
      .setApprovalForAll(await derpyDragons.getAddress(), true);

    // Stake tokens
    const tokenIds = [1];
    await derpyDragons.connect(user1).stake(tokenIds);

    // Advance time
    await ethers.provider.send("evm_increaseTime", [5 * 60 * 60]); // 5 hours
    await ethers.provider.send("evm_mine", []);

    // Stake another token after 5 hours
    const tokenIds2 = [2];
    await derpyDragons.connect(user1).stake(tokenIds2);

    // Advance time
    await ethers.provider.send("evm_increaseTime", [10 * 60 * 60]); // 10 hours
    await ethers.provider.send("evm_mine", []);

    // Unstake tokens
    await derpyDragons.connect(user1).unstake([...tokenIds, ...tokenIds2]);

    // Get owed rewards
    const owedRewards = await derpyDragons.owedRewards(
      await user1.getAddress()
    );
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
});
