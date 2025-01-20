import { ethers, upgrades } from "hardhat";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { DragonForge } from "../typechain-types";
import { rarityLevels } from "./rarityLevels";
import { rollTypes } from "./rolltype";

describe("DragonForge Admin Tests", async function () {
  async function adminFixture() {
    const [owner, user1, user2] = await ethers.getSigners();

    const MockEntropy = await ethers.getContractFactory("MockEntropy");
    const entropy = await MockEntropy.deploy(await owner.getAddress());
    await entropy.waitForDeployment();

    const DinnerParty = await ethers.getContractFactory("DinnerParty");
    const dinnerParty = await DinnerParty.deploy();
    await dinnerParty.waitForDeployment();

    const DerpyDragons = await ethers.getContractFactory("DerpyDragons");
    //@ts-ignore
    const derpyDragons = await DerpyDragons.deploy();
    await derpyDragons.waitForDeployment();

    const Dragons = await ethers.getContractFactory("Dragons");
    const dragons = await Dragons.deploy();
    await dragons.waitForDeployment();

    await dragons.mint(await user1.getAddress(), 10);
    await dragons.mint(await user2.getAddress(), 10);

    const DragonForge = await ethers.getContractFactory("DragonForge");
    const dragonForgeUntyped = await upgrades.deployProxy(
      DragonForge,
      [
        await entropy.getAddress(),
        1000,
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

    return {
      owner,
      user1,
      user2,
      dragonForge,
      dragons,
    };
  }

  describe("DragonForge Upgrade Tests", function () {
    it("should upgrade the DragonForge contract successfully", async function () {
      const { owner, dragonForge } = await loadFixture(adminFixture);

      expect(await dragonForge.version()).to.equal("1.0");
      // New contract version to upgrade to
      const DragonForgeV2 = await ethers.getContractFactory("DragonForgeV2");

      // Perform the upgrade
      const upgradedDerpyDragons = await upgrades.upgradeProxy(
        dragonForge,
        DragonForgeV2
      );

      // Verify that the upgrade was successful by checking the version
      expect(await upgradedDerpyDragons.version()).to.equal("2.0");
    });

    it("should not allow a non-owner to upgrade the contract", async function () {
      const { user1, dragonForge } = await loadFixture(adminFixture);

      // Deploy the new version contract
      const DragonForgeV2 = await ethers.getContractFactory("DragonForgeV2");

      // Attempt to upgrade as a non-owner
      await expect(
        upgrades.upgradeProxy(dragonForge, DragonForgeV2.connect(user1))
      ).to.be.revertedWithCustomError(
        dragonForge,
        "OwnableUnauthorizedAccount"
      );
    });

    it("should preserve state after upgrading the contract", async function () {
      const { owner, dragonForge, user1, dragons } = await loadFixture(
        adminFixture
      );

      // Open staking mode and stake some tokens
      await dragonForge.setStakingMode(true);
      await dragons
        .connect(user1)
        .setApprovalForAll(await dragonForge.getAddress(), true);
      await dragonForge.connect(user1).stake([1, 2]);

      // Upgrade the contract
      const DragonForgeV2 = await ethers.getContractFactory("DragonForgeV2");
      const upgradedDerpyDragons = await upgrades.upgradeProxy(
        dragonForge,
        DragonForgeV2
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
      const { owner, dragonForge } = await loadFixture(adminFixture);

      // Enable staking
      await expect(dragonForge.connect(owner).setStakingMode(true))
        .to.emit(dragonForge, "StakingModeUpdated")
        .withArgs(true);

      // Disable staking
      await expect(dragonForge.connect(owner).setStakingMode(false))
        .to.emit(dragonForge, "StakingModeUpdated")
        .withArgs(false);
    });

    it("should revert if a non-owner tries to set staking mode", async function () {
      const { user1, dragonForge } = await loadFixture(adminFixture);

      await expect(
        dragonForge.connect(user1).setStakingMode(true)
      ).to.be.revertedWithCustomError(
        dragonForge,
        "OwnableUnauthorizedAccount"
      );
    });

    it("should allow the owner to set the minting mode", async function () {
      const { owner, dragonForge } = await loadFixture(adminFixture);

      // Enable minting
      await expect(dragonForge.connect(owner).setMintingMode(true))
        .to.emit(dragonForge, "MintingModeUpdated")
        .withArgs(true);

      // Disable minting
      await expect(dragonForge.connect(owner).setMintingMode(false))
        .to.emit(dragonForge, "MintingModeUpdated")
        .withArgs(false);
    });

    it("should revert if a non-owner tries to set minting mode", async function () {
      const { user1, dragonForge } = await loadFixture(adminFixture);

      await expect(
        dragonForge.connect(user1).setMintingMode(true)
      ).to.be.revertedWithCustomError(
        dragonForge,
        "OwnableUnauthorizedAccount"
      );
    });

    it("should revert if a non-owner tries to set rarity intialization", async function () {
      const { user1, dragonForge } = await loadFixture(adminFixture);

      await expect(
        dragonForge.connect(user1).initializeRarityLevels(rarityLevels)
      ).to.be.revertedWithCustomError(
        dragonForge,
        "OwnableUnauthorizedAccount"
      );
    });

    it("should allow the owner to set points per day per token and verify both day and hour values", async function () {
      const { owner, dragonForge } = await loadFixture(adminFixture);

      // Set points per day per token
      const pointsPerDay = 1000;
      await expect(
        dragonForge.connect(owner).setPointsPerDayPerToken(pointsPerDay)
      )
        .to.emit(dragonForge, "PointsPerDayPerTokenUpdated")
        .withArgs(pointsPerDay);

      // Calculate expected points per hour
      const expectedPointsPerHour = BigInt(pointsPerDay) / 24n;

      // Verify the updated value for points per hour
      expect(await dragonForge.pointsPerHourPerToken()).to.equal(
        expectedPointsPerHour
      );

      // Verify the stored points per day value
      expect(await dragonForge.pointsPerDayPerToken()).to.equal(pointsPerDay);
    });

    it("should allow the owner to set points per day per token and calculate points per hour", async function () {
      const { owner, dragonForge } = await loadFixture(adminFixture);

      // Set points per day per token
      const pointsPerDay = 1000n;
      await expect(
        dragonForge.connect(owner).setPointsPerDayPerToken(pointsPerDay)
      )
        .to.emit(dragonForge, "PointsPerDayPerTokenUpdated")
        .withArgs(pointsPerDay);

      // Calculate expected points per hour
      const expectedPointsPerHour = pointsPerDay / 24n;

      // Verify the updated points per hour value
      expect(await dragonForge.pointsPerHourPerToken()).to.equal(
        expectedPointsPerHour
      );

      // Verify the stored points per day value
      expect(await dragonForge.pointsPerDayPerToken()).to.equal(pointsPerDay);
    });

    it("should revert if a non-owner tries to set points per day per token", async function () {
      const { user1, dragonForge } = await loadFixture(adminFixture);

      await expect(
        dragonForge.connect(user1).setPointsPerDayPerToken(200)
      ).to.be.revertedWithCustomError(
        dragonForge,
        "OwnableUnauthorizedAccount"
      );
    });
  });
  describe("Initialize RollTypes", async function () {
    it("should allow the owner to initialize roll types", async function () {
      const { owner, dragonForge } = await loadFixture(adminFixture);

      // Call initializeRollTypes as the owner
      await expect(
        dragonForge.connect(owner).initializeRollTypes(rollTypes)
      ).to.emit(dragonForge, "RollTypesInitialized");

      // Verify roll types using the getRollTypeById function
      const rollType0 = await dragonForge.getRollTypeById(0);
      expect(rollType0.price).to.equal(1000n);
      expect(rollType0.probabilities).to.deep.equal([10000n, 0, 0, 0, 0, 0]);

      const rollType1 = await dragonForge.getRollTypeById(1);
      expect(rollType1.price).to.equal(2000n);
      expect(rollType1.probabilities).to.deep.equal([6000n, 4000, 0, 0, 0, 0]);
    });

    it("should revert if probabilities do not sum to 100", async function () {
      const { owner, dragonForge } = await loadFixture(adminFixture);

      const invalidRollTypes = [
        { price: 1000, probabilities: [50, 50, 10, 0, 0, 0] }, // Sum > 100
      ];

      await expect(
        dragonForge.connect(owner).initializeRollTypes(invalidRollTypes)
      ).to.be.revertedWithCustomError(dragonForge, "InvalidProbabilitySum");
    });

    it("should revert if a non-owner tries to initialize roll types", async function () {
      const { user1, dragonForge } = await loadFixture(adminFixture);

      const rollTypes = [{ price: 1000, probabilities: [100, 0, 0, 0, 0, 0] }];

      await expect(
        dragonForge.connect(user1).initializeRollTypes(rollTypes)
      ).to.be.revertedWithCustomError(
        dragonForge,
        "OwnableUnauthorizedAccount"
      );
    });

    it("should revert if roles are not initialized", async function () {
      const { owner } = await loadFixture(adminFixture);

      const DragonForge = await ethers.getContractFactory("DragonForge");
      const dragonForgeUntyped = await upgrades.deployProxy(
        DragonForge,
        [
          await owner.getAddress(),
          1000,
          await owner.getAddress(),
          await owner.getAddress(),
          await owner.getAddress(),
          "0x52DeaA1c84233F7bb8C8A45baeDE41091c616506",
        ],
        { initializer: "initialize" }
      );
      await dragonForgeUntyped.waitForDeployment();

      const dragonForge = dragonForgeUntyped as unknown as DragonForge;

      await expect(
        dragonForge.connect(owner).initializeRarityLevels(rarityLevels)
      ).to.be.revertedWithCustomError(dragonForge, "RollsNotInitialized");
    });

    it("should revert if rarity levels length does not match existing rolls", async function () {
      const { owner, dragonForge } = await loadFixture(adminFixture);

      // Simulate initializing rolls
      await dragonForge.connect(owner).initializeRollTypes(rollTypes);

      const mockRarityLevels = [
        { minted: 0, maxSupply: 100n, tokenUri: "ar://common-folder/" }, // Provide fewer rarity levels than expected
      ];

      await expect(
        dragonForge.connect(owner).initializeRarityLevels(mockRarityLevels)
      ).to.be.revertedWithCustomError(dragonForge, "ConfigMismatch");
    });

    it("should initialize rarity levels successfully when conditions are met", async function () {
      const { owner, dragonForge } = await loadFixture(adminFixture);

      // Simulate initializing rolls
      await dragonForge.connect(owner).initializeRollTypes(rollTypes);

      await expect(
        dragonForge.connect(owner).initializeRarityLevels(rarityLevels)
      ).to.emit(dragonForge, "RarityLevelsInitialized");

      // Verify initialization
      const rarityLevel0 = await dragonForge.rarityLevels(0);
      expect(rarityLevel0.maxSupply).to.equal(100);
      expect(rarityLevel0.tokenUri).to.equal("ar://common-folder/");
    });
  });
  describe("setProvider", async function () {
    it("should allow the owner to set the provider", async function () {
      const { owner, dragonForge } = await loadFixture(adminFixture);

      const newProvider = "0x000000000000000000000000000000000000dEaD"; // Beispiel-Adresse

      // Owner setzt den Provider
      await expect(dragonForge.connect(owner).setProvider(newProvider))
        .to.emit(dragonForge, "ProviderUpdated") // Falls es ein Event gibt, kannst du es hier prüfen
        .withArgs(newProvider);

      // Überprüfen, ob der Provider korrekt gesetzt wurde
      //@ts-ignore
      const provider = await dragonForge.provider();
      expect(provider).to.equal(newProvider);
    });

    it("should revert if a non-owner tries to set the provider", async function () {
      const { user1, dragonForge } = await loadFixture(adminFixture);

      const newProvider = "0x000000000000000000000000000000000000dEaD"; // Beispiel-Adresse

      // Nicht-Owner versucht den Provider zu ändern
      await expect(
        dragonForge.connect(user1).setProvider(newProvider)
      ).to.be.revertedWithCustomError(
        dragonForge,
        "OwnableUnauthorizedAccount"
      );
    });

    it("should revert if a non-owner tries to set the dinner party discount", async function () {
      const { user1, dragonForge } = await loadFixture(adminFixture);

      // Nicht-Owner versucht den Dinner Party Rabatt zu setzen
      await expect(
        dragonForge.connect(user1).setDinnerPartyDiscount(10)
      ).to.be.revertedWithCustomError(
        dragonForge,
        "OwnableUnauthorizedAccount"
      );
    });

    it("should revert if a non-owner tries to set the dinner party daily bonus", async function () {
      const { user1, dragonForge } = await loadFixture(adminFixture);

      // Nicht-Owner versucht den Dinner Party Daily Bonus zu setzen
      await expect(
        dragonForge.connect(user1).setDinnerPartyDailyBonus(10)
      ).to.be.revertedWithCustomError(
        dragonForge,
        "OwnableUnauthorizedAccount"
      );
    });

    it("should allow the owner to set the dwaginz contract", async function () {
      const { owner, dragonForge, user1 } = await loadFixture(adminFixture);

      const newDwaginzContract = user1.getAddress();

      // Owner setzt den Dwaginz Contract
      await expect(
        dragonForge.connect(owner).setDwaginzContract(newDwaginzContract)
      )
        .to.emit(dragonForge, "DwaginzContractUpdated") // Falls es ein Event gibt, kannst du es hier prüfen
        .withArgs(newDwaginzContract);
    });

    it("should revert if a non-owner tries to set the dwaginz contract", async function () {
      const { user1, dragonForge } = await loadFixture(adminFixture);

      // Nicht-Owner versucht den Dwaginz Contract zu setzen
      await expect(
        dragonForge.connect(user1).setDwaginzContract(await user1.getAddress())
      ).to.be.revertedWithCustomError(
        dragonForge,
        "OwnableUnauthorizedAccount"
      );
    });
  });
});
