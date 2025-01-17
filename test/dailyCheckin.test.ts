import { ethers, upgrades } from "hardhat";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

import { expect } from "chai";
import { DragonForge } from "../typechain-types";
import { rarityLevels } from "./rarityLevels";
import { rollTypes } from "./rolltype";

describe("DragonForge Tests", async function () {
  async function cbcFixture() {
    const [owner, user1, user2, user3] = await ethers.getSigners();

    const MockEntropy = await ethers.getContractFactory("MockEntropy");
    const entropy = await MockEntropy.deploy(await owner.getAddress());
    await entropy.waitForDeployment();

    const DinnerParty = await ethers.getContractFactory("DinnerParty");
    const dinnerParty = await DinnerParty.deploy();
    await dinnerParty.waitForDeployment();

    const Dragons = await ethers.getContractFactory("Dragons");
    const dragons = await Dragons.deploy();
    await dragons.waitForDeployment();

    const DerpyDragons = await ethers.getContractFactory("DerpyDragons");
    //@ts-ignore
    const derpyDragons = await DerpyDragons.deploy();
    await derpyDragons.waitForDeployment();

    await dinnerParty.mint(await user1.getAddress(), 10);

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

    await dragonForge.initializeRollTypes(rollTypes);
    await dragonForge.initializeRarityLevels(rarityLevels);
    await dragonForge.setDailyBonus(40);
    await dragonForge.setDinnerPartyDailyBonus(48);
    await dragonForge.setDinnerPartyDiscount(24);

    await dragonForge.setStakingMode(true);

    // console.log(await dragonForge.getAddress());
    return {
      owner,
      user1,
      user2,
      user3,
      dragonForge,
      dragons,
      dinnerParty,
    };
  }

  describe("Checkin Tests", function () {
    it("should allow a user to check in and update rewards", async function () {
      const { user1, dragonForge } = await loadFixture(cbcFixture);

      await dragonForge.connect(user1).dailyCheckIn();

      const owedRewards = await dragonForge.owedRewards(
        await user1.getAddress()
      );
      const lastCheckin = await dragonForge.lastCheckinTimestamp(
        await user1.getAddress()
      );

      expect(owedRewards).to.equal(520); // Assuming checkinBonus is 40 + (10 tokens * 48)
      expect(lastCheckin).to.be.closeTo(Math.floor(Date.now() / 1000), 20); // Timestamp should be close to now.
    });

    it("should prevent a user from checking in twice within 24 hours", async function () {
      const { user1, dragonForge } = await loadFixture(cbcFixture);

      await dragonForge.connect(user1).dailyCheckIn();

      await expect(
        dragonForge.connect(user1).dailyCheckIn()
      ).to.be.revertedWithCustomError(dragonForge, "CheckinToEarly");
    });

    it("should correctly apply the multiplier for 'DinnerParty' tokens", async function () {
      const { user1, dragonForge, dinnerParty } = await loadFixture(cbcFixture);

      await dinnerParty.mint(await user1.getAddress(), 2); // Mint 2 DinnerParty tokens.

      await dragonForge.connect(user1).dailyCheckIn();

      const owedRewards = await dragonForge.owedRewards(
        await user1.getAddress()
      );
      expect(owedRewards).to.equal(40 + 12 * 48); // 40 + (12 * 48)
    });

    it("should give a minimum bonus to users with zero DinnerParty tokens", async function () {
      const { user2, dragonForge } = await loadFixture(cbcFixture);

      await dragonForge.connect(user2).dailyCheckIn();

      const owedRewards = await dragonForge.owedRewards(
        await user2.getAddress()
      );
      expect(owedRewards).to.equal(40); // Minimum bonus.
    });

    it("should prevent check-in when staking is closed", async function () {
      const { user1, dragonForge } = await loadFixture(cbcFixture);

      await dragonForge.setStakingMode(false);

      await expect(
        dragonForge.connect(user1).dailyCheckIn()
      ).to.be.revertedWithCustomError(dragonForge, "StakingClosed");
    });

    it("should allow the owner to update the daily bonus", async function () {
      const { owner, dragonForge } = await loadFixture(cbcFixture);

      await dragonForge.connect(owner).setDailyBonus(100);

      const bonus = await dragonForge.checkinBonus();
      expect(bonus).to.equal(100);
    });

    it("should prevent non-owners from updating the daily bonus", async function () {
      const { user1, dragonForge } = await loadFixture(cbcFixture);

      await expect(
        dragonForge.connect(user1).setDailyBonus(100)
      ).to.be.revertedWithCustomError(
        dragonForge,
        "OwnableUnauthorizedAccount"
      );
    });

    it("should emit the correct event on daily check-in", async function () {
      const { user2, dragonForge } = await loadFixture(cbcFixture);

      await expect(dragonForge.connect(user2).dailyCheckIn()).to.emit(
        dragonForge,
        "DailyCheckin"
      );
    });
  });
});
