import { ethers, upgrades } from "hardhat";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { DerpyDragons } from "../typechain-types";

describe("DerpyDragons Admin Tests", async function () {
  async function adminFixture() {
    const [owner, user1, user2] = await ethers.getSigners();

    const MockEntropy = await ethers.getContractFactory("MockEntropy");
    const entropy = await MockEntropy.deploy(await owner.getAddress());
    await entropy.waitForDeployment();

    const Dragons = await ethers.getContractFactory("Dragons");
    const dragons = await Dragons.deploy();
    await dragons.waitForDeployment();

    await dragons.mint(await user1.getAddress(), 10);
    await dragons.mint(await user2.getAddress(), 10);

    const DerpyDragons = await ethers.getContractFactory("DerpyDragons");
    const derpyDragonsUntyped = await upgrades.deployProxy(
      DerpyDragons,
      [
        "Derpy Dragons",
        "DD",
        await entropy.getAddress(),
        1000,
        await dragons.getAddress(),
      ],
      { initializer: "initialize" }
    );
    await derpyDragonsUntyped.waitForDeployment();

    const derpyDragons = derpyDragonsUntyped as unknown as DerpyDragons;

    return {
      owner,
      user1,
      user2,
      derpyDragons,
      dragons,
    };
  }

  describe("DerpyDragons Upgrade Tests", function () {
    it("should upgrade the DerpyDragons contract successfully", async function () {
      const { owner, derpyDragons } = await loadFixture(adminFixture);

      expect(await derpyDragons.version()).to.equal("1.0");
      // New contract version to upgrade to
      const DerpyDragonsV2 = await ethers.getContractFactory("DerpyDragonsV2");

      // Perform the upgrade
      const upgradedDerpyDragons = await upgrades.upgradeProxy(
        derpyDragons,
        DerpyDragonsV2
      );

      // Verify that the upgrade was successful by checking the version
      expect(await upgradedDerpyDragons.version()).to.equal("2.0");
    });

    it("should not allow a non-owner to upgrade the contract", async function () {
      const { user1, derpyDragons } = await loadFixture(adminFixture);

      // Deploy the new version contract
      const DerpyDragonsV2 = await ethers.getContractFactory("DerpyDragonsV2");

      // Attempt to upgrade as a non-owner
      await expect(
        upgrades.upgradeProxy(derpyDragons, DerpyDragonsV2.connect(user1))
      ).to.be.revertedWithCustomError(
        derpyDragons,
        "OwnableUnauthorizedAccount"
      );
    });

    it("should preserve state after upgrading the contract", async function () {
      const { owner, derpyDragons, user1, dragons } = await loadFixture(
        adminFixture
      );

      // Open staking mode and stake some tokens
      await derpyDragons.setStakingMode(true);
      await dragons
        .connect(user1)
        .setApprovalForAll(await derpyDragons.getAddress(), true);
      await derpyDragons.connect(user1).stake([1, 2]);

      // Upgrade the contract
      const DerpyDragonsV2 = await ethers.getContractFactory("DerpyDragonsV2");
      const upgradedDerpyDragons = await upgrades.upgradeProxy(
        derpyDragons,
        DerpyDragonsV2
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
      const { owner, derpyDragons } = await loadFixture(adminFixture);

      // Enable staking
      await expect(derpyDragons.connect(owner).setStakingMode(true))
        .to.emit(derpyDragons, "StakingModeUpdated")
        .withArgs(true);

      // Disable staking
      await expect(derpyDragons.connect(owner).setStakingMode(false))
        .to.emit(derpyDragons, "StakingModeUpdated")
        .withArgs(false);
    });

    it("should revert if a non-owner tries to set staking mode", async function () {
      const { user1, derpyDragons } = await loadFixture(adminFixture);

      await expect(
        derpyDragons.connect(user1).setStakingMode(true)
      ).to.be.revertedWithCustomError(
        derpyDragons,
        "OwnableUnauthorizedAccount"
      );
    });

    it("should allow the owner to set points per day per token and verify both day and hour values", async function () {
      const { owner, derpyDragons } = await loadFixture(adminFixture);

      // Set points per day per token
      const pointsPerDay = 1000;
      await expect(
        derpyDragons.connect(owner).setPointsPerDayPerToken(pointsPerDay)
      )
        .to.emit(derpyDragons, "PointsPerDayPerTokenUpdated")
        .withArgs(pointsPerDay);

      // Calculate expected points per hour
      const expectedPointsPerHour = BigInt(pointsPerDay) / 24n;

      // Verify the updated value for points per hour
      expect(await derpyDragons.pointsPerHourPerToken()).to.equal(
        expectedPointsPerHour
      );

      // Verify the stored points per day value
      expect(await derpyDragons.pointsPerDayPerToken()).to.equal(pointsPerDay);
    });

    it("should allow the owner to set points per day per token and calculate points per hour", async function () {
      const { owner, derpyDragons } = await loadFixture(adminFixture);

      // Set points per day per token
      const pointsPerDay = 1000n;
      await expect(
        derpyDragons.connect(owner).setPointsPerDayPerToken(pointsPerDay)
      )
        .to.emit(derpyDragons, "PointsPerDayPerTokenUpdated")
        .withArgs(pointsPerDay);

      // Calculate expected points per hour
      const expectedPointsPerHour = pointsPerDay / 24n;

      // Verify the updated points per hour value
      expect(await derpyDragons.pointsPerHourPerToken()).to.equal(
        expectedPointsPerHour
      );

      // Verify the stored points per day value
      expect(await derpyDragons.pointsPerDayPerToken()).to.equal(pointsPerDay);
    });

    it("should revert if a non-owner tries to set points per day per token", async function () {
      const { user1, derpyDragons } = await loadFixture(adminFixture);

      await expect(
        derpyDragons.connect(user1).setPointsPerDayPerToken(200)
      ).to.be.revertedWithCustomError(
        derpyDragons,
        "OwnableUnauthorizedAccount"
      );
    });
  });
});
