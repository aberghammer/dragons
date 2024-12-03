import { ethers, upgrades } from "hardhat";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { DragonsLair } from "../typechain-types";
import { rarityLevels } from "./rarityLevels";

describe("DragonsLair Admin Tests", async function () {
  async function adminFixture() {
    const [owner, user1, user2] = await ethers.getSigners();

    const MockEntropy = await ethers.getContractFactory("MockEntropy");
    const entropy = await MockEntropy.deploy(await owner.getAddress());
    await entropy.waitForDeployment();

    const DerpyDragons = await ethers.getContractFactory("DerpyDragons");
    const derpyDragons = await DerpyDragons.deploy();
    await derpyDragons.waitForDeployment();

    const Dragons = await ethers.getContractFactory("Dragons");
    const dragons = await Dragons.deploy();
    await dragons.waitForDeployment();

    await dragons.mint(await user1.getAddress(), 10);
    await dragons.mint(await user2.getAddress(), 10);

    const DragonsLair = await ethers.getContractFactory("DragonsLair");
    const dragonsLairUntyped = await upgrades.deployProxy(
      DragonsLair,
      [
        await entropy.getAddress(),
        1000,
        await dragons.getAddress(),
        await derpyDragons.getAddress(),
      ],
      { initializer: "initialize" }
    );
    await dragonsLairUntyped.waitForDeployment();

    const dragonsLair = dragonsLairUntyped as unknown as DragonsLair;

    await dragonsLair.initializeRarityLevels(rarityLevels);

    return {
      owner,
      user1,
      user2,
      dragonsLair,
      dragons,
    };
  }

  describe("DragonsLair Upgrade Tests", function () {
    it("should upgrade the DragonsLair contract successfully", async function () {
      const { owner, dragonsLair } = await loadFixture(adminFixture);

      expect(await dragonsLair.version()).to.equal("1.0");
      // New contract version to upgrade to
      const DragonsLairV2 = await ethers.getContractFactory("DragonsLairV2");

      // Perform the upgrade
      const upgradedDerpyDragons = await upgrades.upgradeProxy(
        dragonsLair,
        DragonsLairV2
      );

      // Verify that the upgrade was successful by checking the version
      expect(await upgradedDerpyDragons.version()).to.equal("2.0");
    });

    it("should not allow a non-owner to upgrade the contract", async function () {
      const { user1, dragonsLair } = await loadFixture(adminFixture);

      // Deploy the new version contract
      const DragonsLairV2 = await ethers.getContractFactory("DragonsLairV2");

      // Attempt to upgrade as a non-owner
      await expect(
        upgrades.upgradeProxy(dragonsLair, DragonsLairV2.connect(user1))
      ).to.be.revertedWithCustomError(
        dragonsLair,
        "OwnableUnauthorizedAccount"
      );
    });

    it("should preserve state after upgrading the contract", async function () {
      const { owner, dragonsLair, user1, dragons } = await loadFixture(
        adminFixture
      );

      // Open staking mode and stake some tokens
      await dragonsLair.setStakingMode(true);
      await dragons
        .connect(user1)
        .setApprovalForAll(await dragonsLair.getAddress(), true);
      await dragonsLair.connect(user1).stake([1, 2]);

      // Upgrade the contract
      const DragonsLairV2 = await ethers.getContractFactory("DragonsLairV2");
      const upgradedDerpyDragons = await upgrades.upgradeProxy(
        dragonsLair,
        DragonsLairV2
      );

      // Verify that state is preserved
      const stakedProps = await upgradedDerpyDragons.stakedTokenProps(1);
      expect(stakedProps.owner).to.equal(await user1.getAddress());
      expect(stakedProps.checkInTimestamp).to.be.greaterThan(0);

      const stakers = await upgradedDerpyDragons.getAllStakers();
      expect(stakers).to.include(await user1.getAddress());
    });
  });

  describe("Admin Functions", async function () {
    it("should allow the owner to set staking mode", async function () {
      const { owner, dragonsLair } = await loadFixture(adminFixture);

      // Enable staking
      await expect(dragonsLair.connect(owner).setStakingMode(true))
        .to.emit(dragonsLair, "StakingModeUpdated")
        .withArgs(true);

      // Disable staking
      await expect(dragonsLair.connect(owner).setStakingMode(false))
        .to.emit(dragonsLair, "StakingModeUpdated")
        .withArgs(false);
    });

    it("should revert if a non-owner tries to set staking mode", async function () {
      const { user1, dragonsLair } = await loadFixture(adminFixture);

      await expect(
        dragonsLair.connect(user1).setStakingMode(true)
      ).to.be.revertedWithCustomError(
        dragonsLair,
        "OwnableUnauthorizedAccount"
      );
    });

    it("should revert if a non-owner tries to set rarity intialization", async function () {
      const { user1, dragonsLair } = await loadFixture(adminFixture);

      await expect(
        dragonsLair.connect(user1).initializeRarityLevels(rarityLevels)
      ).to.be.revertedWithCustomError(
        dragonsLair,
        "OwnableUnauthorizedAccount"
      );
    });

    it("should allow the owner to set points per day per token and verify both day and hour values", async function () {
      const { owner, dragonsLair } = await loadFixture(adminFixture);

      // Set points per day per token
      const pointsPerDay = 1000;
      await expect(
        dragonsLair.connect(owner).setPointsPerDayPerToken(pointsPerDay)
      )
        .to.emit(dragonsLair, "PointsPerDayPerTokenUpdated")
        .withArgs(pointsPerDay);

      // Calculate expected points per hour
      const expectedPointsPerHour = BigInt(pointsPerDay) / 24n;

      // Verify the updated value for points per hour
      expect(await dragonsLair.pointsPerHourPerToken()).to.equal(
        expectedPointsPerHour
      );

      // Verify the stored points per day value
      expect(await dragonsLair.pointsPerDayPerToken()).to.equal(pointsPerDay);
    });

    it("should allow the owner to set points per day per token and calculate points per hour", async function () {
      const { owner, dragonsLair } = await loadFixture(adminFixture);

      // Set points per day per token
      const pointsPerDay = 1000n;
      await expect(
        dragonsLair.connect(owner).setPointsPerDayPerToken(pointsPerDay)
      )
        .to.emit(dragonsLair, "PointsPerDayPerTokenUpdated")
        .withArgs(pointsPerDay);

      // Calculate expected points per hour
      const expectedPointsPerHour = pointsPerDay / 24n;

      // Verify the updated points per hour value
      expect(await dragonsLair.pointsPerHourPerToken()).to.equal(
        expectedPointsPerHour
      );

      // Verify the stored points per day value
      expect(await dragonsLair.pointsPerDayPerToken()).to.equal(pointsPerDay);
    });

    it("should revert if a non-owner tries to set points per day per token", async function () {
      const { user1, dragonsLair } = await loadFixture(adminFixture);

      await expect(
        dragonsLair.connect(user1).setPointsPerDayPerToken(200)
      ).to.be.revertedWithCustomError(
        dragonsLair,
        "OwnableUnauthorizedAccount"
      );
    });
  });
});
