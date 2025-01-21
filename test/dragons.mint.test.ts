import { ethers, upgrades } from "hardhat";
import "@nomicfoundation/hardhat-toolbox";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { MockEntropy, DragonForge } from "../typechain-types";
import { rarityLevels, lowAmountRarityLevels } from "./rarityLevels";
import { tierTypes } from "./tierType";

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

    await dragonForge.initializeTierTypes(tierTypes);
    await dragonForge.initializeRarityLevels(rarityLevels);

    // Set the DragonForge contract as the caller for the entropy contract
    await entropy.setCallerContract(await dragonForge.getAddress());

    await dragonForge.setMintingMode(true);

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
    it("should initialize rarity levels correctly", async function () {
      const { dragonForge } = await loadFixture(mintingFixture);

      for (let i = 0; i < rarityLevels.length; i++) {
        const rarity = await dragonForge.rarityLevels(i); // Assuming 1-based indexing
        expect(rarity.minted).to.equal(0); // Default value
        expect(rarity.maxSupply).to.equal(rarityLevels[i].maxSupply);
        expect(rarity.tokenUri).to.equal(rarityLevels[i].tokenUri);
      }
    });

    it("should correctly handle a successful mint with randomness callback", async function () {
      const { user1, dragonForge, dragons, entropy, derpyDragons } =
        await loadFixture(mintingFixture);

      // Enable staking mode and stake tokens
      await dragonForge.setStakingMode(true);
      const tokenIds = [1, 2, 3, 4, 5];
      await dragons
        .connect(user1)
        .setApprovalForAll(await dragonForge.getAddress(), true);
      await dragonForge.connect(user1).stake(tokenIds);

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10]); // 10 days
      await ethers.provider.send("evm_mine", []);

      // Mint token request
      const tx = await dragonForge.connect(user1).requestToken(1, {
        value: ethers.parseEther("0.01"), // Mock fee
      });
      const receipt = await tx.wait();

      // console.log("Minted token receipt:", receipt);

      // Set up a filter for the MintRequested event and query it
      const filter = dragonForge.filters.MintRequested();

      // console.log("Filter:", filter);

      // console.log("Block hash:", receipt.hash);

      const events = await dragonForge.queryFilter(filter);

      // Verify the MintRequested event was emitted with the correct values
      const event = events[0];

      const sequenceNumber = event.args![1];

      expect(event.args!.user).to.equal(await user1.getAddress());
      expect(sequenceNumber).to.be.a("bigInt");

      // Manually trigger the entropy callback
      await entropy.fireCallbackManually(sequenceNumber, 12);

      // console.log("Minted token event:", await dragonForge.mintRequests(1));

      await dragonForge.selectRarityAndMint(sequenceNumber);

      // Verify that the token was minted and assigned to the user
      expect(await derpyDragons.ownerOf(1)).to.equal(await user1.getAddress());
      expect(await dragonForge.mintedDragonCount()).to.equal(1);

      // Set up a filter for the TokenMinted event and query it
      const mintedFilter = dragonForge.filters.TokenMinted();
      const mintedEvents = await dragonForge.queryFilter(mintedFilter);

      // Verify the TokenMinted event
      const mintedEvent = mintedEvents[0];
      expect(mintedEvent.args!.user).to.equal(await user1.getAddress());
      expect(mintedEvent.args!.tokenId).to.equal(1);

      // console.log("Minted token event:", await dragonForge.mintRequests(1));

      expect(await derpyDragons.balanceOf(await user1.getAddress())).to.equal(
        1
      );
    });

    it("should calculate full price when user has no Dinner Party tokens", async function () {
      const { user1, dragonForge, dragons, dinnerParty } = await loadFixture(
        mintingFixture
      );

      await dragonForge.setStakingMode(true);
      const tokenIds = [1, 2, 3, 4, 5];
      await dragons
        .connect(user1)
        .setApprovalForAll(await dragonForge.getAddress(), true);
      await dragonForge.connect(user1).stake(tokenIds);
      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10]); // 10 days
      await ethers.provider.send("evm_mine", []);

      const rollType = 1; // Beispiel RollType
      const rollPrice = tierTypes[rollType].price;
      const initialRewards = await dragonForge.pendingRewards(
        user1.getAddress()
      );

      // Ensure user4 has no Dinner Party tokens
      expect(await dinnerParty.balanceOf(await user1.getAddress())).to.equal(0);

      // Request token
      const tx = await dragonForge.connect(user1).requestToken(rollType, {
        value: ethers.parseEther("0.01"),
      });

      // Check that the full price was deducted
      const rewardsAfterRequest = await dragonForge.owedRewards(
        await user1.getAddress()
      );
      expect(rewardsAfterRequest).to.equal(initialRewards - BigInt(rollPrice));
    });

    it("should allow user3 to mint with discount", async function () {
      const {
        user3,
        dragonForge,
        dragons,
        entropy,
        derpyDragons,
        dinnerParty,
      } = await loadFixture(mintingFixture);

      // Set the discount and ensure user3 has DinnerParty tokens
      // Im mintingFixture wird user3 bereits mit 10 DinnerParty-Token gemintet
      expect(await dinnerParty.balanceOf(await user3.getAddress())).to.equal(3);

      // Enable staking mode and stake some Dragons tokens if required by the contract
      await dragonForge.setStakingMode(true);
      await dragons
        .connect(user3)
        .setApprovalForAll(await dragonForge.getAddress(), true);

      const stakedTokenIds = [21, 22, 23, 24, 25];
      await dragonForge.connect(user3).stake(stakedTokenIds);

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10]); // 365 days
      await ethers.provider.send("evm_mine", []);

      await dinnerParty.connect(user3).mint(await user3.getAddress(), 75);

      // Berechne den erwarteten Rabatt
      const dinnerPartyBalance = await dinnerParty.balanceOf(
        await user3.getAddress()
      );

      const rollType = 1; // Beispiel-RollType
      const rollPrice = tierTypes[rollType].price;
      const discount = (rollPrice * 100) / 30; // dinnerPartyDiscount ist 24

      console.log("Roll price:", rollPrice);
      console.log("Discount:", discount);

      const expectedPointsRequired =
        rollPrice > discount ? rollPrice - discount : rollPrice / 2;

      console.log("Expected points required:", expectedPointsRequired);

      // Prüfe die Anfangsbelohnungen
      const initialRewards = await dragonForge.pendingRewards(
        await user3.getAddress()
      );

      console.log("Initial rewards:", initialRewards);

      // Initiere die Mint-Anfrage mit dem Rabatt
      const tx = await dragonForge.connect(user3).requestToken(rollType, {
        value: ethers.parseEther("0.01"), // Mock-Gebühr
      });

      // Set up a filter for the MintRequested event and query it
      const filter = dragonForge.filters.MintRequested();

      // console.log("Filter:", filter);

      // console.log("Block hash:", receipt.hash);

      const events = await dragonForge.queryFilter(filter);

      // Verify the MintRequested event was emitted with the correct values
      const event = events[0];

      const sequenceNumber = event.args![1];

      expect(event.args!.user).to.equal(await user3.getAddress());
      expect(sequenceNumber).to.be.a("bigInt");

      // Manually trigger the entropy callback
      await entropy.fireCallbackManually(sequenceNumber, 12);

      // Prüfe, ob die Punkteanforderungen korrekt abgezogen wurden
      const rewardsAfterRequest = await dragonForge.owedRewards(
        await user3.getAddress()
      );
      expect(rewardsAfterRequest).to.equal(
        initialRewards - BigInt(expectedPointsRequired)
      );

      // Finalisiere den Mint-Prozess
      await dragonForge.selectRarityAndMint(sequenceNumber);

      // Überprüfe, ob der Token an user3 gemintet wurde
      const mintedTokenId = 1; // Annahme: TokenId 1 wird gemintet
      expect(await derpyDragons.ownerOf(mintedTokenId)).to.equal(
        await user3.getAddress()
      );
      expect(await dragonForge.mintedDragonCount()).to.equal(1);

      // Überprüfe das TokenURI, falls relevant
      const mintRequest = await dragonForge.mintRequests(sequenceNumber);
      expect(mintRequest.user).to.equal(await user3.getAddress());
      expect(mintRequest.uri).to.not.equal(""); // Überprüfe, ob ein URI gesetzt wurde

      // Überprüfe das Balance von user3 nach dem Mint
      expect(await derpyDragons.balanceOf(await user3.getAddress())).to.equal(
        1
      );
    });

    it("should allow user3 to mint with max discount", async function () {
      const {
        user3,
        dragonForge,
        dragons,
        entropy,
        derpyDragons,
        dinnerParty,
      } = await loadFixture(mintingFixture);

      await dinnerParty.mint(await user3.getAddress(), 7);

      // Set the discount and ensure user3 has DinnerParty tokens
      // Im mintingFixture wird user3 bereits mit 10 DinnerParty-Token gemintet
      expect(await dinnerParty.balanceOf(await user3.getAddress())).to.equal(
        10
      );

      // Enable staking mode and stake some Dragons tokens if required by the contract
      await dragonForge.setStakingMode(true);
      await dragons
        .connect(user3)
        .setApprovalForAll(await dragonForge.getAddress(), true);

      const stakedTokenIds = [21, 22, 23, 24, 25];
      await dragonForge.connect(user3).stake(stakedTokenIds);

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10]); // 10 Tage
      await ethers.provider.send("evm_mine", []);

      // Berechne den erwarteten Rabatt
      const dinnerPartyBalance = await dinnerParty.balanceOf(
        await user3.getAddress()
      );
      const rollType = 1; // Beispiel-RollType
      const rollPrice = tierTypes[rollType].price;
      const discount = (rollPrice * 100) / 30; // dinnerPartyDiscount ist 24

      console.log("Roll price:", rollPrice);
      console.log("Discount:", discount);

      const expectedPointsRequired =
        rollPrice > discount ? rollPrice - discount : rollPrice / 2;

      console.log("Expected points required:", expectedPointsRequired);

      // Prüfe die Anfangsbelohnungen
      const initialRewards = await dragonForge.pendingRewards(
        await user3.getAddress()
      );

      console.log("Initial rewards:", initialRewards);

      // Initiere die Mint-Anfrage mit dem Rabatt
      const tx = await dragonForge.connect(user3).requestToken(rollType, {
        value: ethers.parseEther("0.01"), // Mock-Gebühr
      });

      // Set up a filter for the MintRequested event and query it
      const filter = dragonForge.filters.MintRequested();

      // console.log("Filter:", filter);

      // console.log("Block hash:", receipt.hash);

      const events = await dragonForge.queryFilter(filter);

      // Verify the MintRequested event was emitted with the correct values
      const event = events[0];

      const sequenceNumber = event.args![1];

      expect(event.args!.user).to.equal(await user3.getAddress());
      expect(sequenceNumber).to.be.a("bigInt");

      // Manually trigger the entropy callback
      await entropy.fireCallbackManually(sequenceNumber, 12);

      // Prüfe, ob die Punkteanforderungen korrekt abgezogen wurden
      const rewardsAfterRequest = await dragonForge.owedRewards(
        await user3.getAddress()
      );
      expect(rewardsAfterRequest).to.equal(
        initialRewards - BigInt(expectedPointsRequired)
      );

      // Finalisiere den Mint-Prozess
      await dragonForge.selectRarityAndMint(sequenceNumber);

      // Überprüfe, ob der Token an user3 gemintet wurde
      const mintedTokenId = 1; // Annahme: TokenId 1 wird gemintet
      expect(await derpyDragons.ownerOf(mintedTokenId)).to.equal(
        await user3.getAddress()
      );
      expect(await dragonForge.mintedDragonCount()).to.equal(1);

      // Überprüfe das TokenURI, falls relevant
      const mintRequest = await dragonForge.mintRequests(sequenceNumber);
      expect(mintRequest.user).to.equal(await user3.getAddress());
      expect(mintRequest.uri).to.not.equal(""); // Überprüfe, ob ein URI gesetzt wurde

      // Überprüfe das Balance von user3 nach dem Mint
      expect(await derpyDragons.balanceOf(await user3.getAddress())).to.equal(
        1
      );
    });

    it("should revert if minting mode is disabled", async function () {
      const { user1, dragonForge } = await loadFixture(mintingFixture);

      await dragonForge.setMintingMode(false);

      await expect(
        dragonForge.connect(user1).requestToken(1, {
          value: ethers.parseEther("0.01"),
        })
      ).to.be.revertedWithCustomError(dragonForge, "MintingClosed");
    });

    it("should revert if mint request is not completed", async function () {
      const { user1, dragonForge, dragons, entropy } = await loadFixture(
        mintingFixture
      );

      await dragonForge.setStakingMode(true);
      await dragons
        .connect(user1)
        .setApprovalForAll(await dragonForge.getAddress(), true);
      await dragonForge.connect(user1).stake([1, 2, 3]);

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10]); // 10 days
      await ethers.provider.send("evm_mine", []);

      // Initialize rarity levels
      await dragonForge.initializeRarityLevels(lowAmountRarityLevels);

      // Simulate a mint token request
      await dragonForge.connect(user1).requestToken(1, {
        value: ethers.parseEther("0.01"), // Mock fee
      });

      // Do NOT trigger entropy callback (request remains incomplete)

      // Attempt to select rarity and mint
      await expect(
        dragonForge.selectRarityAndMint(1)
      ).to.be.revertedWithCustomError(dragonForge, "RequestNotCompleted");
    });

    it("should revert if rollType is invalid", async function () {
      const { user1, dragonForge } = await loadFixture(mintingFixture);

      await expect(
        dragonForge
          .connect(user1)
          .requestToken(7, { value: ethers.parseEther("0.01") })
      ).to.be.revertedWithCustomError(dragonForge, "InvalidTierType");
    });

    it("should revert if user has insufficient points", async function () {
      const { user1, dragonForge } = await loadFixture(mintingFixture);

      // User has no staked tokens or rewards
      await expect(
        dragonForge
          .connect(user1)
          .requestToken(0, { value: ethers.parseEther("0.01") })
      )
        .to.be.revertedWithCustomError(dragonForge, "InsufficientBalance")
        .withArgs(0, 1000); // Expect balance 0, required 1000
    });

    it("should revert if user provides insufficient fee", async function () {
      const { user1, dragonForge, dragons, entropy } = await loadFixture(
        mintingFixture
      );

      // Enable staking mode and stake tokens
      await dragonForge.setStakingMode(true);
      await dragons
        .connect(user1)
        .setApprovalForAll(await dragonForge.getAddress(), true);
      await dragonForge.connect(user1).stake([1, 2, 3]);

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10]); // 10 days
      await ethers.provider.send("evm_mine", []);

      // Provide less than required fee
      await expect(
        dragonForge.connect(user1).requestToken(1, {
          value: ethers.parseEther("0.009"),
        })
      ).to.be.revertedWithCustomError(dragonForge, "InsufficientFee");
    });

    it("should mint successfully if all conditions are met", async function () {
      const { user1, dragonForge, dragons, entropy } = await loadFixture(
        mintingFixture
      );

      // Enable staking mode and stake tokens
      await dragonForge.setStakingMode(true);
      await dragons
        .connect(user1)
        .setApprovalForAll(await dragonForge.getAddress(), true);
      await dragonForge.connect(user1).stake([4, 5, 6]);

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10]); // 10 days
      await ethers.provider.send("evm_mine", []);

      // Successful mint
      const tx = await dragonForge.connect(user1).requestToken(1, {
        value: ethers.parseEther("0.01"),
      });
      await tx.wait();

      // Verify the mint request was logged
      const mintEvent = (
        await dragonForge.queryFilter(dragonForge.filters.MintRequested())
      )[0];
      expect(mintEvent.args!.user).to.equal(await user1.getAddress());
    });

    it("should handle minting another rarity when selected rarity is unavailable", async function () {
      const { user1, dragonForge, dragons, entropy, derpyDragons } =
        await loadFixture(mintingFixture);

      await dragonForge.initializeRarityLevels(lowAmountRarityLevels);
      await dragonForge.setStakingMode(true);
      await dragons
        .connect(user1)
        .setApprovalForAll(await dragonForge.getAddress(), true);
      await dragonForge.connect(user1).stake([4, 5, 6]);

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10]); // 10 days
      await ethers.provider.send("evm_mine", []);

      // Mint token request
      await dragonForge.connect(user1).requestToken(1, {
        value: ethers.parseEther("0.01"), // Mock fee
      });

      await dragonForge.connect(user1).requestToken(1, {
        value: ethers.parseEther("0.01"), // Mock fee
      });

      // Trigger entropy callback to complete the randomness process
      await entropy.fireCallbackManually(1, 5);

      // Finalize the minting process
      await dragonForge.selectRarityAndMint(1);

      const request1 = await dragonForge.mintRequests(1);

      expect(request1.uri).to.equal("ar://common-folder/1.json");

      expect(await derpyDragons.tokenURI(1)).to.equal(
        "ar://common-folder/1.json"
      );

      // Trigger entropy callback to complete the randomness process
      await entropy.fireCallbackManually(2, 5);

      await dragonForge.selectRarityAndMint(2);

      const request2 = await dragonForge.mintRequests(2);

      expect(request2.uri).to.equal("ar://uncommon-folder/1.json");
    });

    it("should not be able to mint if no tokens are left", async function () {
      const { user1, dragonForge, dragons, entropy, derpyDragons } =
        await loadFixture(mintingFixture);

      await dragonForge.initializeRarityLevels(lowAmountRarityLevels);
      await dragonForge.setStakingMode(true);
      await dragons
        .connect(user1)
        .setApprovalForAll(await dragonForge.getAddress(), true);
      await dragonForge.connect(user1).stake([4, 5, 6]);

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10]); // 10 days
      await ethers.provider.send("evm_mine", []);

      // Mint token request
      await dragonForge.connect(user1).requestToken(1, {
        value: ethers.parseEther("0.01"), // Mock fee
      });

      await dragonForge.connect(user1).requestToken(1, {
        value: ethers.parseEther("0.01"), // Mock fee
      });

      // Trigger entropy callback to complete the randomness process
      await entropy.fireCallbackManually(1, 5);
      await entropy.fireCallbackManually(2, 5);

      // Finalize the minting process
      await dragonForge.selectRarityAndMint(1);
      await dragonForge.selectRarityAndMint(2);

      await expect(
        dragonForge.connect(user1).requestToken(1)
      ).to.be.revertedWithCustomError(dragonForge, "NoMintsLeft");
    });

    it("should handle refund when no rarity is available", async function () {
      const { user1, dragonForge, dragons, entropy } = await loadFixture(
        mintingFixture
      );

      // Initialize rarity levels
      await dragonForge.initializeRarityLevels(lowAmountRarityLevels);
      await dragonForge.setStakingMode(true);
      await dragons
        .connect(user1)
        .setApprovalForAll(await dragonForge.getAddress(), true);
      await dragonForge.connect(user1).stake([4, 5, 6]);

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10]); // 10 days
      await ethers.provider.send("evm_mine", []);

      // First mint: Token from rarity index 0
      await dragonForge.connect(user1).requestToken(1, {
        value: ethers.parseEther("0.01"), // Mock fee
      });

      // Trigger entropy callback
      await entropy.fireCallbackManually(1, 5);

      // Finalize the minting process
      await dragonForge.selectRarityAndMint(1);

      const request1 = await dragonForge.mintRequests(1);
      expect(request1.uri).to.equal("ar://common-folder/1.json");

      // Second mint: Token from rarity index 1
      await dragonForge.connect(user1).requestToken(1, {
        value: ethers.parseEther("0.01"), // Mock fee
      });
      const rewardsBefore = await dragonForge.owedRewards(
        await user1.getAddress()
      );

      // Attempt to mint when no rarity is available
      await dragonForge.connect(user1).requestToken(1, {
        value: ethers.parseEther("0.01"), // Mock fee
      });

      const rewardsAfter = await dragonForge.owedRewards(
        await user1.getAddress()
      );

      // Trigger entropy callback
      await entropy.fireCallbackManually(2, 5);

      await dragonForge.selectRarityAndMint(2);

      const request2 = await dragonForge.mintRequests(2);
      expect(request2.uri).to.equal("ar://uncommon-folder/1.json");

      expect(rewardsAfter).to.equal(rewardsBefore - 2000n); // Refund should match the rollType price

      // Trigger entropy callback
      await entropy.fireCallbackManually(3, 5);

      // Finalize the minting process
      await dragonForge.selectRarityAndMint(3);

      const rewardsEnd = await dragonForge.owedRewards(
        await user1.getAddress()
      );

      const request3 = await dragonForge.mintRequests(3);

      expect(rewardsBefore).to.equal(rewardsEnd); // Rewards should be depleted

      expect(request3.cancelled).to.equal(true);

      // Verify refund
      const owedRewards = await dragonForge.owedRewards(
        await user1.getAddress()
      );
      expect(owedRewards).to.equal(rewardsBefore); // Refund should match the rollType price

      expect(
        await dragonForge.getMintRequestsByUser(await user1.getAddress())
      ).to.deep.equal([1, 2, 3]);
    });

    it("should refund points for an expired mint request", async function () {
      const { user1, dragonForge, dragons, entropy } = await loadFixture(
        mintingFixture
      );

      // Enable staking mode and stake tokens
      await dragonForge.setStakingMode(true);
      await dragons
        .connect(user1)
        .setApprovalForAll(await dragonForge.getAddress(), true);
      await dragonForge.connect(user1).stake([1, 2, 3]);

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10]); // 10 days
      await ethers.provider.send("evm_mine", []);

      await dragonForge.connect(user1).unstake([1, 2, 3]);

      const initialRewards = await dragonForge.pendingRewards(
        await user1.getAddress()
      );

      // Submit a mint request
      const tx = await dragonForge.connect(user1).requestToken(1, {
        value: ethers.parseEther("0.01"),
      });
      const receipt = await tx.wait();

      // Extract sequenceNumber from the MintRequested event
      const mintEvent = (
        await dragonForge.queryFilter(dragonForge.filters.MintRequested())
      )[0];
      const sequenceNumber = mintEvent.args![1];

      // Try resolving before expiration
      await expect(
        dragonForge.connect(user1).resolveExpiredMint(sequenceNumber)
      ).to.be.revertedWithCustomError(dragonForge, "MintRequestNotYetExpired");

      // Simulate expiration by advancing time
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 2]); // 2 more days
      await ethers.provider.send("evm_mine", []);

      // Resolve the expired mint request
      await dragonForge.connect(user1).resolveExpiredMint(sequenceNumber);

      const finalRewards = await dragonForge.pendingRewards(
        await user1.getAddress()
      );

      // Check that the request is marked as cancelled
      const mintRequest = await dragonForge.mintRequests(sequenceNumber);
      expect(mintRequest.cancelled).to.equal(true);
      expect(mintRequest.requestCompleted).to.equal(false);

      // Check that MintFailed event was emitted
      const mintFailedEvent = (
        await dragonForge.queryFilter(dragonForge.filters.MintFailed())
      )[0];
      expect(mintFailedEvent.args![0]).to.equal(await user1.getAddress());
      expect(mintFailedEvent.args![1]).to.equal(sequenceNumber);
    });

    it("should revert if trying to resolve a completed mint request", async function () {
      const { user1, dragonForge, dragons, entropy } = await loadFixture(
        mintingFixture
      );

      // Enable staking mode and stake tokens
      await dragonForge.setStakingMode(true);
      await dragons
        .connect(user1)
        .setApprovalForAll(await dragonForge.getAddress(), true);
      await dragonForge.connect(user1).stake([4, 5, 6]);

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10]); // 10 days
      await ethers.provider.send("evm_mine", []);

      // Submit a mint request
      const tx = await dragonForge.connect(user1).requestToken(2, {
        value: ethers.parseEther("0.01"),
      });
      const receipt = await tx.wait();

      // Extract sequenceNumber from the MintRequested event
      const mintEvent = (
        await dragonForge.queryFilter(dragonForge.filters.MintRequested())
      )[0];
      const sequenceNumber = mintEvent.args![1];

      // Manually complete the mint
      await entropy.fireCallbackManually(sequenceNumber, 42);

      // Try resolving the completed mint
      await expect(
        dragonForge.connect(user1).resolveExpiredMint(sequenceNumber)
      ).to.be.revertedWithCustomError(dragonForge, "MintAlreadyCompleted");
    });

    it("should revert if attempting to mint the same sequenceNumber twice", async function () {
      const { user1, dragonForge, dragons, entropy } = await loadFixture(
        mintingFixture
      );

      await dragonForge.setStakingMode(true);
      await dragons
        .connect(user1)
        .setApprovalForAll(await dragonForge.getAddress(), true);
      await dragonForge.connect(user1).stake([4, 5, 6]);

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10]); // 10 days
      await ethers.provider.send("evm_mine", []);
      // Submit a mint request
      const tx = await dragonForge.connect(user1).requestToken(1, {
        value: ethers.parseEther("0.01"),
      });
      const receipt = await tx.wait();
      const mintEvent = (
        await dragonForge.queryFilter(dragonForge.filters.MintRequested())
      )[0];
      const sequenceNumber = mintEvent.args![1];

      // First callback completes the mint
      await entropy.fireCallbackManually(sequenceNumber, 50);
      await dragonForge.selectRarityAndMint(sequenceNumber);

      // Attempt to mint the same sequenceNumber again
      await expect(
        dragonForge.selectRarityAndMint(sequenceNumber)
      ).to.be.revertedWithCustomError(dragonForge, "MintAlreadyCompleted");
    });

    it("should revert if trying to resolve a cancelled mint request", async function () {
      const { user1, dragonForge, dragons } = await loadFixture(mintingFixture);

      // Enable staking mode and stake tokens
      await dragonForge.setStakingMode(true);
      await dragons
        .connect(user1)
        .setApprovalForAll(await dragonForge.getAddress(), true);
      await dragonForge.connect(user1).stake([7, 8, 9]);

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10]); // 10 days
      await ethers.provider.send("evm_mine", []);

      // Submit a mint request
      const tx = await dragonForge.connect(user1).requestToken(3, {
        value: ethers.parseEther("0.01"),
      });
      const receipt = await tx.wait();

      // Extract sequenceNumber from the MintRequested event
      const mintEvent = (
        await dragonForge.queryFilter(dragonForge.filters.MintRequested())
      )[0];
      const sequenceNumber = mintEvent.args![1];

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 2]); // 10 days
      await ethers.provider.send("evm_mine", []);

      // Manually cancel the request
      await dragonForge.connect(user1).resolveExpiredMint(sequenceNumber);

      // Try resolving the already cancelled mint
      await expect(
        dragonForge.connect(user1).resolveExpiredMint(sequenceNumber)
      ).to.be.revertedWithCustomError(
        dragonForge,
        "MintRequestAlreadyCancelled"
      );
    });
  });

  describe("Entropy reverts", async function () {
    it("should revert if the mint request is already completed", async function () {
      const { user1, dragonForge, dragons, entropy } = await loadFixture(
        mintingFixture
      );

      // Mock a valid mint request
      await dragonForge.setStakingMode(true);
      await dragons
        .connect(user1)
        .setApprovalForAll(await dragonForge.getAddress(), true);
      await dragonForge.connect(user1).stake([7, 8, 9]);

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10]); // 10 days
      await ethers.provider.send("evm_mine", []);

      const tx = await dragonForge.connect(user1).requestToken(1, {
        value: ethers.parseEther("0.01"),
      });
      const receipt = await tx.wait();
      const mintEvent = (
        await dragonForge.queryFilter(dragonForge.filters.MintRequested())
      )[0];
      const sequenceNumber = mintEvent.args![1];

      // First callback completes the request
      await entropy.fireCallbackManually(sequenceNumber, 50);

      // Second callback should revert
      await expect(
        entropy.fireCallbackManually(sequenceNumber, 50)
      ).to.be.revertedWithCustomError(dragonForge, "RequestAlreadyCompleted");
    });

    it("should revert if the mint request is already cancelled", async function () {
      const { user1, dragonForge, entropy, dragons } = await loadFixture(
        mintingFixture
      );

      // Mock a mint request
      await dragonForge.setStakingMode(true);
      await dragons
        .connect(user1)
        .setApprovalForAll(await dragonForge.getAddress(), true);
      await dragonForge.connect(user1).stake([7, 8, 9]);

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10]); // 10 days
      await ethers.provider.send("evm_mine", []);

      const tx = await dragonForge.connect(user1).requestToken(1, {
        value: ethers.parseEther("0.01"),
      });
      const receipt = await tx.wait();
      const mintEvent = (
        await dragonForge.queryFilter(dragonForge.filters.MintRequested())
      )[0];
      const sequenceNumber = mintEvent.args![1];

      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 1]); // 1 days
      await ethers.provider.send("evm_mine", []);

      // Cancel the mint request
      await dragonForge.resolveExpiredMint(sequenceNumber);

      // Callback after cancellation should revert
      await expect(
        entropy.fireCallbackManually(sequenceNumber, 50)
      ).to.be.revertedWithCustomError(dragonForge, "RequestAlreadyCancelled");
    });
  });
});
