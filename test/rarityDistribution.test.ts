import { ethers, upgrades } from "hardhat";
import "@nomicfoundation/hardhat-toolbox";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { MockEntropy, DragonForge } from "../typechain-types";
import { lowAmountRarityLevelsTest } from "./rarityLevels";
import { rollTypesTest } from "./rolltype";

describe("DragonForge Minting with Entropy", async function () {
  async function mintingFixture() {
    const [owner, user1, user2, user3] = await ethers.getSigners();

    const DerpyDragons = await ethers.getContractFactory("DerpyDragons");
    //@ts-ignore
    const derpyDragons = await DerpyDragons.deploy();
    await derpyDragons.waitForDeployment();

    const Dragons = await ethers.getContractFactory("Dragons");
    const dragons = await Dragons.deploy();
    await dragons.waitForDeployment();

    const DinnerParty = await ethers.getContractFactory("DinnerParty");
    const dinnerParty = await DinnerParty.deploy();
    await dinnerParty.waitForDeployment();

    await dragons.mint(await user1.getAddress(), 10);
    await dragons.mint(await user2.getAddress(), 10);

    await dragons.mint(await user3.getAddress(), 10);
    await dinnerParty.mint(await user3.getAddress(), 3);

    const MockEntropy = await ethers.getContractFactory("MockEntropy");
    const entropy = await MockEntropy.deploy(await owner.getAddress());
    await entropy.waitForDeployment();

    const WrongMockEntropy = await ethers.getContractFactory("MockEntropy");
    const wrongEntropy = await WrongMockEntropy.deploy(
      await owner.getAddress()
    );
    await wrongEntropy.waitForDeployment();

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

    await derpyDragons.setDragonLairAddress(await dragonForge.getAddress());

    await dragonForge.setDinnerPartyDiscount(10);
    await dragonForge.setDinnerPartyDailyBonus(48);

    await dragonForge.initializeRollTypes(rollTypesTest);
    await dragonForge.initializeRarityLevels(lowAmountRarityLevelsTest);

    // Set the DragonForge contract as the caller for the entropy contract
    await entropy.setCallerContract(await dragonForge.getAddress());

    await dragonForge.setMintingMode(true);

    await dragonForge.setStakingMode(true);
    const tokenIds = [1, 2, 3, 4, 5];
    await dragons
      .connect(user1)
      .setApprovalForAll(await dragonForge.getAddress(), true);
    await dragonForge.connect(user1).stake(tokenIds);

    // Advance time to accumulate rewards
    await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10]); // 10 days
    await ethers.provider.send("evm_mine", []);

    return {
      owner,
      user1,
      user2,
      user3,
      dragonForge,
      dinnerParty,
      dragons,
      entropy,
      wrongEntropy,
      derpyDragons,
    };
  }

  describe("Minting with Randomness", async function () {
    it("should correctly handle a successful mint with randomness callback", async function () {
      const { user1, dragonForge, dragons, entropy, derpyDragons } =
        await loadFixture(mintingFixture);

      // Enable staking mode and stake tokens

      // Mint token request
      const tx = await dragonForge.connect(user1).requestToken(0, {
        value: ethers.parseEther("0.01"), // Mock fee
      });
      const receipt = await tx.wait();
      const filter = dragonForge.filters.MintRequested();
      const events = await dragonForge.queryFilter(filter);
      const event = events[0];
      const sequenceNumber = event.args![1];
      expect(event.args!.user).to.equal(await user1.getAddress());
      expect(sequenceNumber).to.be.a("bigInt");

      // Manually trigger the entropy callback
      await entropy.fireCallbackManually(sequenceNumber, 12);

      await dragonForge.selectRarityAndMint(sequenceNumber);
      // Verify that the token was minted and assigned to the user
      expect(await derpyDragons.ownerOf(1)).to.equal(await user1.getAddress());
      expect(await dragonForge.mintedDragonCount()).to.equal(1);

      const tokenUri = await derpyDragons.tokenURI(1);

      expect(tokenUri).to.equal("ar://common/1.json");

      // console.log("Minted token event:", await dragonForge.mintRequests(1));

      expect(await derpyDragons.balanceOf(await user1.getAddress())).to.equal(
        1
      );
    });

    it("should correctly handle a mint if one bucket is full", async function () {
      const { user1, dragonForge, dragons, entropy, derpyDragons } =
        await loadFixture(mintingFixture);

      // Enable staking mode and stake tokens

      // Mint token request
      const tx = await dragonForge.connect(user1).requestToken(0, {
        value: ethers.parseEther("0.01"), // Mock fee
      });

      //probabilities: [80, 16, 2, 1, 1], // so we roll 99
      // Manually trigger the entropy callback
      await entropy.fireCallbackManually(1, 99);

      await dragonForge.selectRarityAndMint(1);
      // Verify that the token was minted and assigned to the user
      expect(await derpyDragons.ownerOf(1)).to.equal(await user1.getAddress());
      expect(await dragonForge.mintedDragonCount()).to.equal(1);

      const tokenUri = await derpyDragons.tokenURI(1);

      expect(tokenUri).to.equal("ar://mega/1.json");

      // console.log("Minted token event:", await dragonForge.mintRequests(1));

      await dragonForge.connect(user1).requestToken(0, {
        value: ethers.parseEther("0.01"), // Mock fee
      });
      await dragonForge.connect(user1).requestToken(0, {
        value: ethers.parseEther("0.01"), // Mock fee
      });

      // we mint another mega
      await entropy.fireCallbackManually(2, 99);

      await dragonForge.selectRarityAndMint(2);
      // Verify that the token was minted and assigned to the user
      expect(await derpyDragons.ownerOf(1)).to.equal(await user1.getAddress());
      expect(await dragonForge.mintedDragonCount()).to.equal(2);

      const tokenUri2 = await derpyDragons.tokenURI(2);

      expect(tokenUri2).to.equal("ar://mega/2.json");

      // we mint another mega - but there is no mega left!
      await entropy.fireCallbackManually(3, 99);

      await dragonForge.selectRarityAndMint(3);
      // Verify that the token was minted and assigned to the user
      expect(await derpyDragons.ownerOf(1)).to.equal(await user1.getAddress());
      expect(await dragonForge.mintedDragonCount()).to.equal(3);

      const tokenUri3 = await derpyDragons.tokenURI(3);

      expect(tokenUri3).to.equal("ar://common/1.json"); //99 % 99 (because 99 left) = 0

      expect(await derpyDragons.balanceOf(await user1.getAddress())).to.equal(
        3
      );
    });

    it("should correctly handle a mint if one bucket is full with other numbers just to make it clear for me", async function () {
      const { user1, dragonForge, dragons, entropy, derpyDragons } =
        await loadFixture(mintingFixture);

      // Enable staking mode and stake tokens

      // Mint token request
      const tx = await dragonForge.connect(user1).requestToken(0, {
        value: ethers.parseEther("0.01"), // Mock fee
      });

      //probabilities: [80, 16, 2, 1, 1], // so we roll 96
      // 96 % 100 = 96
      // Manually trigger the entropy callback
      await entropy.fireCallbackManually(1, 95);

      await dragonForge.selectRarityAndMint(1);
      // Verify that the token was minted and assigned to the user
      expect(await derpyDragons.ownerOf(1)).to.equal(await user1.getAddress());
      expect(await dragonForge.mintedDragonCount()).to.equal(1);

      const tokenUri = await derpyDragons.tokenURI(1);

      expect(tokenUri).to.equal("ar://uncommon/1.json");

      // console.log("Minted token event:", await dragonForge.mintRequests(1));

      await dragonForge.connect(user1).requestToken(0, {
        value: ethers.parseEther("0.01"), // Mock fee
      });
      await dragonForge.connect(user1).requestToken(0, {
        value: ethers.parseEther("0.01"), // Mock fee
      });

      // we mint another
      await entropy.fireCallbackManually(2, 95);

      await dragonForge.selectRarityAndMint(2);
      // Verify that the token was minted and assigned to the user
      expect(await derpyDragons.ownerOf(1)).to.equal(await user1.getAddress());
      expect(await dragonForge.mintedDragonCount()).to.equal(2);

      const tokenUri2 = await derpyDragons.tokenURI(2);

      expect(tokenUri2).to.equal("ar://uncommon/2.json");

      // probabilities: [80, 16, 2, 1, 1], // No uncommon left
      // 80 + 2 + 1 + 1 = 84
      // 95 % 84 = 11
      // we get a common

      await entropy.fireCallbackManually(3, 95);

      await dragonForge.selectRarityAndMint(3);
      // Verify that the token was minted and assigned to the user
      expect(await derpyDragons.ownerOf(1)).to.equal(await user1.getAddress());
      expect(await dragonForge.mintedDragonCount()).to.equal(3);

      const tokenUri3 = await derpyDragons.tokenURI(3);

      expect(tokenUri3).to.equal("ar://common/1.json"); //95 % 84 = 11

      expect(await derpyDragons.balanceOf(await user1.getAddress())).to.equal(
        3
      );
    });

    it("should correctly refund if all buckets are full", async function () {
      const { user1, dragonForge, entropy, derpyDragons } = await loadFixture(
        mintingFixture
      );

      const rollTypes = [
        {
          price: 1000,
          probabilities: [100, 0], // 100% Common
        },
        {
          price: 2000,
          probabilities: [0, 100],
        },
      ];

      const rarityLevels = [
        {
          minted: 0,
          maxSupply: 1,
          tokenUri: "ar://common/",
        },
        {
          minted: 0,
          maxSupply: 1,
          tokenUri: "ar://uncommon/",
        },
      ];

      await dragonForge.initializeRollTypes(rollTypes);
      await dragonForge.initializeRarityLevels(rarityLevels);

      // Enable staking mode and stake tokens

      // Mint token request
      await dragonForge.connect(user1).requestToken(0, {
        value: ethers.parseEther("0.01"), // Mock fee
      });

      await dragonForge.connect(user1).requestToken(0, {
        value: ethers.parseEther("0.01"), // Mock fee
      });

      //probabilities: [80, 16, 2, 1, 1], // so we roll 96
      // 96 % 100 = 96
      // Manually trigger the entropy callback
      await entropy.fireCallbackManually(1, 12);
      await entropy.fireCallbackManually(2, 12);

      await dragonForge.selectRarityAndMint(1);
      // Verify that the token was minted and assigned to the user
      expect(await derpyDragons.ownerOf(1)).to.equal(await user1.getAddress());
      expect(await dragonForge.mintedDragonCount()).to.equal(1);

      const tokenUri = await derpyDragons.tokenURI(1);

      expect(tokenUri).to.equal("ar://common/1.json");

      await expect(dragonForge.selectRarityAndMint(2)).to.emit(
        dragonForge,
        "MintFailed"
      );
    });
  });
});
