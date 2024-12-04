import { ethers, upgrades } from "hardhat";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

import { expect } from "chai";
import { DragonsLair } from "../typechain-types";
import { rarityLevels } from "./rarityLevels";
import { rollTypes } from "./rolltype";

describe("DragonsLair Tests", async function () {
  async function cbcFixture() {
    const [owner, user1, user2, user3] = await ethers.getSigners();

    const MockEntropy = await ethers.getContractFactory("MockEntropy");
    const entropy = await MockEntropy.deploy(await owner.getAddress());
    await entropy.waitForDeployment();

    const Dragons = await ethers.getContractFactory("Dragons");
    const dragons = await Dragons.deploy();
    await dragons.waitForDeployment();

    const DerpyDragons = await ethers.getContractFactory("DerpyDragons");
    //@ts-ignore
    const derpyDragons = await DerpyDragons.deploy();
    await derpyDragons.waitForDeployment();

    await dragons.mint(await user1.getAddress(), 10);
    await dragons.mint(await user2.getAddress(), 10);
    await dragons.mint(await user3.getAddress(), 10);

    const DragonsLair = await ethers.getContractFactory("DragonsLair");
    const dragonsLairUntyped = await upgrades.deployProxy(
      DragonsLair,
      [
        await entropy.getAddress(),
        40,
        await dragons.getAddress(),
        await derpyDragons.getAddress(),
        "0x52DeaA1c84233F7bb8C8A45baeDE41091c616506",
      ],
      { initializer: "initialize" }
    );
    await dragonsLairUntyped.waitForDeployment();

    const dragonsLair = dragonsLairUntyped as unknown as DragonsLair;

    await dragonsLair.initializeRollTypes(rollTypes);
    await dragonsLair.initializeRarityLevels(rarityLevels);

    // console.log(await dragonsLair.getAddress());
    return {
      owner,
      user1,
      user2,
      user3,
      dragonsLair,
      dragons,
    };
  }

  describe("Staking Tests", async function () {
    it("should allow a user to stake tokens when staking is open", async function () {
      const { user1, dragonsLair, dragons } = await loadFixture(cbcFixture);

      // Open staking mode
      await dragonsLair.setStakingMode(true);

      // Approve the contract to transfer tokens
      const tokenIds = [1, 2, 3];
      await dragons
        .connect(user1)
        .setApprovalForAll(await dragonsLair.getAddress(), true);

      // Stake the tokens
      await expect(dragonsLair.connect(user1).stake(tokenIds))
        .to.emit(dragonsLair, "Staked")
        .withArgs(await user1.getAddress(), 1)
        .and.to.emit(dragonsLair, "Staked")
        .withArgs(await user1.getAddress(), 2)
        .and.to.emit(dragonsLair, "Staked")
        .withArgs(await user1.getAddress(), 3);

      // Verify that tokens are now owned by the contract
      for (const tokenId of tokenIds) {
        expect(await dragons.ownerOf(tokenId)).to.equal(
          await dragonsLair.getAddress()
        );
      }

      // Verify staking properties
      const stakedProps1 = await dragonsLair.stakedTokenProps(1);
      expect(stakedProps1.owner).to.equal(await user1.getAddress());
      expect(stakedProps1.checkInTimestamp).to.be.greaterThan(0);
    });

    it("should revert if staking is closed", async function () {
      const { user1, dragonsLair } = await loadFixture(cbcFixture);

      // Attempt to stake while staking is closed
      const tokenIds = [1];
      await expect(
        dragonsLair.connect(user1).stake(tokenIds)
      ).to.be.revertedWithCustomError(dragonsLair, "StakingClosed");
    });

    it("should revert if token is already staked", async function () {
      const { user1, dragonsLair, dragons } = await loadFixture(cbcFixture);

      // Open staking mode
      await dragonsLair.setStakingMode(true);

      // Approve the contract to transfer tokens
      const tokenIds = [1];
      await dragons
        .connect(user1)
        .setApprovalForAll(await dragonsLair.getAddress(), true);

      // Stake the tokens
      await dragonsLair.connect(user1).stake(tokenIds);

      // Attempt to stake the same tokens again
      await expect(
        dragonsLair.connect(user1).stake(tokenIds)
      ).to.be.revertedWithCustomError(dragonsLair, "AlreadyStaked");
    });

    it("should revert if a user tries to stake a token they don't own", async function () {
      const { user2, dragonsLair, dragons } = await loadFixture(cbcFixture);

      // Open staking mode
      await dragonsLair.setStakingMode(true);

      // Attempt to stake a token owned by another user
      const tokenIds = [1];
      await expect(
        dragonsLair.connect(user2).stake(tokenIds)
      ).to.be.revertedWithCustomError(dragonsLair, "NotOwnerOfToken");
    });

    it("should track new stakers correctly", async function () {
      const { user1, dragonsLair, dragons } = await loadFixture(cbcFixture);

      // Open staking mode
      await dragonsLair.setStakingMode(true);

      // Approve and stake tokens
      const tokenIds = [1, 2];
      await dragons
        .connect(user1)
        .setApprovalForAll(await dragonsLair.getAddress(), true);
      await dragonsLair.connect(user1).stake(tokenIds);

      // Verify allStakers array includes the user
      const allStakers = await dragonsLair.getAllStakers();
      expect(allStakers).to.include(await user1.getAddress());

      // Verify that `hasStaked` is true for the user
      const hasStaked = await dragonsLair.hasStaked(await user1.getAddress());
      expect(hasStaked).to.be.true;
    });
  });

  describe("Unstaking Tests", async function () {
    it("should allow a user to unstake tokens they have staked", async function () {
      const { user1, dragonsLair, dragons } = await loadFixture(cbcFixture);

      // Open staking mode and approve tokens
      await dragonsLair.setStakingMode(true);
      const tokenIds = [1, 2, 3];
      await dragons
        .connect(user1)
        .setApprovalForAll(await dragonsLair.getAddress(), true);

      // Stake the tokens
      await dragonsLair.connect(user1).stake(tokenIds);

      // Unstake the tokens
      await expect(dragonsLair.connect(user1).unstake(tokenIds))
        .to.emit(dragonsLair, "Unstaked")
        .withArgs(await user1.getAddress(), 1)
        .and.to.emit(dragonsLair, "Unstaked")
        .withArgs(await user1.getAddress(), 2)
        .and.to.emit(dragonsLair, "Unstaked")
        .withArgs(await user1.getAddress(), 3);

      // Verify the tokens are returned to the user
      for (const tokenId of tokenIds) {
        expect(await dragons.ownerOf(tokenId)).to.equal(
          await user1.getAddress()
        );
      }

      // Verify staking properties are reset
      for (const tokenId of tokenIds) {
        const stakedProps = await dragonsLair.stakedTokenProps(tokenId);
        expect(stakedProps.owner).to.equal(ethers.ZeroAddress);
        expect(stakedProps.checkInTimestamp).to.equal(0);
      }
    });

    it("should revert if the user tries to unstake a token they don't own", async function () {
      const { user1, user2, dragonsLair, dragons } = await loadFixture(
        cbcFixture
      );

      // Open staking mode and approve tokens for user1
      await dragonsLair.setStakingMode(true);
      const tokenIds = [1];
      await dragons
        .connect(user1)
        .setApprovalForAll(await dragonsLair.getAddress(), true);

      // Stake the tokens
      await dragonsLair.connect(user1).stake(tokenIds);

      // Attempt to unstake by another user
      await expect(
        dragonsLair.connect(user2).unstake(tokenIds)
      ).to.be.revertedWithCustomError(dragonsLair, "NotStakedOwner");
    });

    it("should reset rewards for unstaked tokens", async function () {
      const { user1, dragonsLair, dragons } = await loadFixture(cbcFixture);

      // Open staking mode and approve tokens
      await dragonsLair.setStakingMode(true);
      const tokenIds = [1, 2];
      await dragons
        .connect(user1)
        .setApprovalForAll(await dragonsLair.getAddress(), true);

      // Stake the tokens
      await dragonsLair.connect(user1).stake(tokenIds);

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10]); // 10 days
      await ethers.provider.send("evm_mine", []);

      // Unstake the tokens
      await dragonsLair.connect(user1).unstake(tokenIds);

      // Verify rewards are reset for the unstaked tokens
      for (const tokenId of tokenIds) {
        const stakedProps = await dragonsLair.stakedTokenProps(tokenId);
        expect(stakedProps.checkInTimestamp).to.equal(0);
      }
    });

    it("should update owedRewards if there are pending rewards", async function () {
      const { user1, dragonsLair, dragons } = await loadFixture(cbcFixture);

      // Open staking mode and approve tokens
      await dragonsLair.setStakingMode(true);
      const tokenIds = [1];
      await dragons
        .connect(user1)
        .setApprovalForAll(await dragonsLair.getAddress(), true);

      // Stake the tokens
      await dragonsLair.connect(user1).stake(tokenIds);

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 5]); // 5 days
      await ethers.provider.send("evm_mine", []);

      const pendingRewards = await dragonsLair.pendingRewards(
        await user1.getAddress()
      );
      console.log(pendingRewards);

      // Unstake the tokens
      await dragonsLair.connect(user1).unstake(tokenIds);

      // Verify owedRewards is updated
      const owedRewards = await dragonsLair.owedRewards(
        await user1.getAddress()
      );

      console.log(owedRewards);

      expect(owedRewards).to.be.greaterThan(0);
    });

    it("should revert if no tokens are specified for unstaking", async function () {
      const { user1, dragonsLair } = await loadFixture(cbcFixture);

      // Attempt to unstake with an empty array
      await expect(
        dragonsLair.connect(user1).unstake([])
      ).to.be.revertedWithCustomError(dragonsLair, "InvalidTokenIndex");
    });
  });

  it("should correctly calculate rewards for tokens staked at different times and handle unstaking", async function () {
    const { user1, dragonsLair, dragons } = await loadFixture(cbcFixture);

    await dragonsLair.setStakingMode(true);
    await dragons
      .connect(user1)
      .setApprovalForAll(await dragonsLair.getAddress(), true);

    // Stake tokens
    const tokenIds = [1];
    await dragonsLair.connect(user1).stake(tokenIds);

    // Advance time
    await ethers.provider.send("evm_increaseTime", [5 * 60 * 60]); // 5 hours
    await ethers.provider.send("evm_mine", []);

    // Stake another token after 5 hours
    const tokenIds2 = [2];
    await dragonsLair.connect(user1).stake(tokenIds2);

    // Advance time
    await ethers.provider.send("evm_increaseTime", [10 * 60 * 60]); // 10 hours
    await ethers.provider.send("evm_mine", []);

    // Unstake tokens
    await dragonsLair.connect(user1).unstake([...tokenIds, ...tokenIds2]);

    // Get owed rewards
    const owedRewards = await dragonsLair.owedRewards(await user1.getAddress());
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
    const { user1, dragons, dragonsLair } = await loadFixture(cbcFixture);

    await expect(
      dragons
        .connect(user1)
        ["safeTransferFrom(address,address,uint256)"](
          user1.address,
          await dragonsLair.getAddress(),
          1
        )
    ).to.be.revertedWithCustomError(dragonsLair, "DirectTransferNotAllowed");
  });
});
