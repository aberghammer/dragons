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

    const DragonsLair = await ethers.getContractFactory("DragonsLair");
    const dragonsLairUntyped = await upgrades.deployProxy(
      DragonsLair,
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
    await dragonsLairUntyped.waitForDeployment();

    const dragonsLair = dragonsLairUntyped as unknown as DragonsLair;

    await dragonsLair.initializeRollTypes(rollTypes);
    await dragonsLair.initializeRarityLevels(rarityLevels);
    await dragonsLair.setDailyBonus(40);

    await dragonsLair.setStakingMode(true);

    // console.log(await dragonsLair.getAddress());
    return {
      owner,
      user1,
      user2,
      user3,
      dragonsLair,
      dragons,
      dinnerParty,
    };
  }

  describe("Checkin Tests", function () {
    it("should allow a user to check in and update rewards", async function () {
      const { user1, dragonsLair } = await loadFixture(cbcFixture);

      await dragonsLair.connect(user1).dailyCheckIn();

      const owedRewards = await dragonsLair.owedRewards(
        await user1.getAddress()
      );
      const lastCheckin = await dragonsLair.lastCheckinTimestamp(
        await user1.getAddress()
      );

      expect(owedRewards).to.equal(440); // Assuming checkinBonus is 40 * (10 tokens + 1)
      expect(lastCheckin).to.be.closeTo(Math.floor(Date.now() / 1000), 20); // Timestamp should be close to now.
    });

    it("should prevent a user from checking in twice within 24 hours", async function () {
      const { user1, dragonsLair } = await loadFixture(cbcFixture);

      await dragonsLair.connect(user1).dailyCheckIn();

      await expect(
        dragonsLair.connect(user1).dailyCheckIn()
      ).to.be.revertedWithCustomError(dragonsLair, "CheckinToEarly");
    });

    it("should correctly apply the multiplier for 'DinnerParty' tokens", async function () {
      const { user1, dragonsLair, dinnerParty } = await loadFixture(cbcFixture);

      await dinnerParty.mint(await user1.getAddress(), 2); // Mint 2 DinnerParty tokens.

      await dragonsLair.connect(user1).dailyCheckIn();

      const owedRewards = await dragonsLair.owedRewards(
        await user1.getAddress()
      );
      expect(owedRewards).to.equal(40 * 13); // 40 * (12 + 1)
    });

    it("should give a minimum bonus to users with zero DinnerParty tokens", async function () {
      const { user2, dragonsLair } = await loadFixture(cbcFixture);

      await dragonsLair.connect(user2).dailyCheckIn();

      const owedRewards = await dragonsLair.owedRewards(
        await user2.getAddress()
      );
      expect(owedRewards).to.equal(40); // Minimum bonus.
    });

    it("should prevent check-in when staking is closed", async function () {
      const { user1, dragonsLair } = await loadFixture(cbcFixture);

      await dragonsLair.setStakingMode(false);

      await expect(
        dragonsLair.connect(user1).dailyCheckIn()
      ).to.be.revertedWithCustomError(dragonsLair, "StakingClosed");
    });

    it("should allow the owner to update the daily bonus", async function () {
      const { owner, dragonsLair } = await loadFixture(cbcFixture);

      await dragonsLair.connect(owner).setDailyBonus(100);

      const bonus = await dragonsLair.checkinBonus();
      expect(bonus).to.equal(100);
    });

    it("should prevent non-owners from updating the daily bonus", async function () {
      const { user1, dragonsLair } = await loadFixture(cbcFixture);

      await expect(
        dragonsLair.connect(user1).setDailyBonus(100)
      ).to.be.revertedWithCustomError(
        dragonsLair,
        "OwnableUnauthorizedAccount"
      );
    });

    it("should emit the correct event on daily check-in", async function () {
      const { user2, dragonsLair } = await loadFixture(cbcFixture);

      await expect(dragonsLair.connect(user2).dailyCheckIn()).to.emit(
        dragonsLair,
        "DailyCheckin"
      );
    });
  });
});
