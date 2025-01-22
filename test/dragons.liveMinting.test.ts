import { ethers, upgrades } from "hardhat";
import "@nomicfoundation/hardhat-toolbox";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { MockEntropy, DragonForge } from "../typechain-types";
import { rollTypes } from "../scripts/rolltype";
import { liveRarityLevels } from "../scripts/rarityLevels";

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
        395850, // * 24 = 9.500.400
        await dragons.getAddress(),
        await dinnerParty.getAddress(),
        await derpyDragons.getAddress(),
        "0x52DeaA1c84233F7bb8C8A45baeDE41091c616506",
      ],
      { initializer: "initialize" }
    );
    await dragonForgeUntyped.waitForDeployment();

    const dragonForge = dragonForgeUntyped as unknown as DragonForge;

    await derpyDragons.setDragonForgeAddress(await dragonForge.getAddress());

    await dragonForge.setDinnerPartyDiscount(0);
    await dragonForge.setDinnerPartyDailyBonus(0);

    await dragonForge.initializeTierTypes(rollTypes);
    await dragonForge.initializeRarityLevels(liveRarityLevels);

    // Set the DragonForge contract as the caller for the entropy contract
    await entropy.setCallerContract(await dragonForge.getAddress());

    await dragonForge.setMintingMode(true);

    await dragonForge.setStakingMode(true);
    const tokenIds = [1];
    await dragons
      .connect(user1)
      .setApprovalForAll(await dragonForge.getAddress(), true);
    await dragonForge.connect(user1).stake(tokenIds);

    // Advance time to accumulate rewards
    await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 1]); // 1 day
    await ethers.provider.send("evm_mine", []);

    await dragonForge.connect(user1).unstake(tokenIds);

    console.log(
      await dragonForge.connect(user1).pendingRewards(user1.getAddress())
    );

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

  describe("Minting all Tokens", async function () {
    it("should correctly mint all tokens without problems", async function () {
      const { user1, dragonForge, entropy, derpyDragons } = await loadFixture(
        mintingFixture
      );

      let commonCount = 0;
      let uncommonCount = 0;
      let rareCount = 0;
      let legendaryCount = 0;
      let megaCount = 0;

      let initialRewards = await dragonForge.pendingRewards(user1.getAddress());

      // let mintsperbin = [624, 250, 153, 75, 56, 42];
      let mintsperbin = [1200]; // fails
      // Enable staking mode and stake tokens
      let sequenceNumber = 0;
      //for loop from 0 to 5 tiers
      for (let i = 0; i < 6; i++) {
        let balance = await derpyDragons.balanceOf(await user1.getAddress());

        //200 requests for each tier
        for (let j = 0; j < mintsperbin[i]; j++) {
          sequenceNumber++;
          //   console.log(sequenceNumber);
          await dragonForge.connect(user1).requestToken(i, {
            value: ethers.parseEther("0.01"),
          });
          await entropy.fireCallbackManually(
            sequenceNumber,
            Math.round(Math.random() * 10000)
          );
          await dragonForge.connect(user1).selectRarityAndMint(sequenceNumber);
          let mr = await dragonForge.mintRequests(sequenceNumber);

          let uri = mr[5];

          //   console.log("Minted token event:", uri);
          if (uri.includes("//common")) {
            commonCount++;
          }
          if (uri.includes("//uncommon")) {
            uncommonCount++;
          }
          if (uri.includes("//rare")) {
            rareCount++;
          }
          if (uri.includes("//legendary")) {
            legendaryCount++;
          }
          if (uri.includes("//mega")) {
            megaCount++;
          }
        }
        const cost =
          initialRewards -
          (await dragonForge.pendingRewards(user1.getAddress()));

        initialRewards = await dragonForge.pendingRewards(user1.getAddress());

        console.log(
          "minted: ",
          (await derpyDragons.balanceOf(await user1.getAddress())) - balance
        );

        console.log("costs for tier", i, ":", cost);

        for (let i = 0; i < 5; i++) {
          let rl = await dragonForge.rarityLevels(i);
          console.log("Rarity Level", i, ":", rl[0], " / ", rl[1]);
        }
      }

      console.log("Common:", commonCount);
      console.log("Uncommon:", uncommonCount);
      console.log("Rare:", rareCount);
      console.log("Legendary:", legendaryCount);
      console.log("Mega:", megaCount);

      for (let i = 0; i < 5; i++) {
        console.log(await dragonForge.rarityLevels(i));
      }

      expect(await dragonForge.mintedDragonCount()).to.equal(1200);

      // console.log("Minted token event:", await dragonForge.mintRequests(1));

      expect(await derpyDragons.balanceOf(await user1.getAddress())).to.equal(
        1200
      );

      console.log(await dragonForge.pendingRewards(await user1.getAddress()));
    });
  });
});
