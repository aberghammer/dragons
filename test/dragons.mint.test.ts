import { ethers, upgrades } from "hardhat";
import "@nomicfoundation/hardhat-toolbox";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { DerpyDragons } from "../typechain-types";

describe("DerpyDragons Minting Tests", async function () {
  async function mintingFixture() {
    const [owner, user1, user2] = await ethers.getSigners();

    const Dragons = await ethers.getContractFactory("Dragons");
    const dragons = await Dragons.deploy();
    await dragons.waitForDeployment();

    await dragons.mint(await user1.getAddress(), 10);
    await dragons.mint(await user2.getAddress(), 10);

    const DerpyDragons = await ethers.getContractFactory("DerpyDragons");
    const derpyDragonsUntyped = await upgrades.deployProxy(
      DerpyDragons,
      ["Derpy Dragons", "DD", 40, 10000, await dragons.getAddress()],
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

  describe("Minting Tokens", async function () {
    it("should allow minting if the user has enough rewards", async function () {
      const { user1, derpyDragons, dragons } = await loadFixture(
        mintingFixture
      );

      // Open staking mode and stake some tokens
      await derpyDragons.setStakingMode(true);
      const tokenIds = [1, 2, 3, 4, 5];
      await dragons
        .connect(user1)
        .setApprovalForAll(await derpyDragons.getAddress(), true);
      await derpyDragons.connect(user1).stake(tokenIds);

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10]); // 10 days
      await ethers.provider.send("evm_mine", []);

      // Mint a new token
      await expect(derpyDragons.connect(user1).mintToken())
        .to.emit(derpyDragons, "TokenMinted")
        .withArgs(await user1.getAddress(), 1);

      // Verify new token exists and is owned by the user
      expect(await derpyDragons.ownerOf(1)).to.equal(await user1.getAddress());

      // Verify remaining rewards
      const owedRewards = await derpyDragons.owedRewards(
        await user1.getAddress()
      );
      const expectedRewards = 10 * 960 * 5 - 10000; // 10 days * 960 points/day * 5 tokens - 10000 pointsRequired
      expect(owedRewards).to.equal(expectedRewards);
    });

    it("should revert if the user does not have enough rewards", async function () {
      const { user1, derpyDragons, dragons } = await loadFixture(
        mintingFixture
      );

      // Open staking mode and stake some tokens
      await derpyDragons.setStakingMode(true);
      const tokenIds = [1, 2];
      await dragons
        .connect(user1)
        .setApprovalForAll(await derpyDragons.getAddress(), true);
      await derpyDragons.connect(user1).stake(tokenIds);

      // Attempt to mint without sufficient rewards
      await expect(
        derpyDragons.connect(user1).mintToken()
      ).to.be.revertedWithCustomError(derpyDragons, "InsufficientBalance");
    });

    it("should ensure staked tokens remain staked after minting", async function () {
      const { user1, derpyDragons, dragons } = await loadFixture(
        mintingFixture
      );

      // Open staking mode and stake some tokens
      await derpyDragons.setStakingMode(true);
      const tokenIds = [1, 2, 3];
      await dragons
        .connect(user1)
        .setApprovalForAll(await derpyDragons.getAddress(), true);
      await derpyDragons.connect(user1).stake(tokenIds);

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10]); // 10 days
      await ethers.provider.send("evm_mine", []);

      // Mint a token
      await derpyDragons.connect(user1).mintToken();

      // Verify staked tokens are still staked
      for (const tokenId of tokenIds) {
        const stakedProps = await derpyDragons.stakedTokenProps(tokenId);
        expect(stakedProps.owner).to.equal(await user1.getAddress());
        expect(stakedProps.checkInTimestamp).to.be.greaterThan(0);
      }
    });

    it("should correctly update owedRewards after unstaking", async function () {
      const { user1, derpyDragons, dragons } = await loadFixture(
        mintingFixture
      );

      // Open staking mode and stake some tokens
      await derpyDragons.setStakingMode(true);
      const tokenIds = [1, 2, 3, 4, 5];
      await dragons
        .connect(user1)
        .setApprovalForAll(await derpyDragons.getAddress(), true);
      await derpyDragons.connect(user1).stake(tokenIds);

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10]); // 10 days
      await ethers.provider.send("evm_mine", []);

      // Mint a token
      await derpyDragons.connect(user1).mintToken();

      // Check owedRewards after minting
      const owedAfterMint = await derpyDragons.owedRewards(
        await user1.getAddress()
      );
      const expectedRewardsAfterMint = 10 * 960 * 5 - 10000; // 10 days * 960 points/day * 5 tokens - 10000 pointsRequired
      expect(owedAfterMint).to.equal(expectedRewardsAfterMint);

      // Advance time to accumulate additional rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 5]); // 5 days
      await ethers.provider.send("evm_mine", []);

      // Unstake tokens
      await derpyDragons.connect(user1).unstake(tokenIds);

      // Calculate new expected owed rewards
      const additionalRewards = 5n * 960n * 5n; // 5 days * 960 points/day * 5 tokens
      const expectedRewardsAfterUnstake = owedAfterMint + additionalRewards;

      // Verify owedRewards after unstaking
      const owedAfterUnstake = await derpyDragons.owedRewards(
        await user1.getAddress()
      );
      expect(owedAfterUnstake).to.equal(expectedRewardsAfterUnstake);
    });

    it("should increment mintedDragonCount after each mint", async function () {
      const { user1, derpyDragons, dragons } = await loadFixture(
        mintingFixture
      );

      // Open staking mode and stake some tokens
      await derpyDragons.setStakingMode(true);
      const tokenIds = [1, 2, 3, 4, 5];
      await dragons
        .connect(user1)
        .setApprovalForAll(await derpyDragons.getAddress(), true);
      await derpyDragons.connect(user1).stake(tokenIds);

      // Advance time to accumulate rewards for 5 days
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 5]); // 5 days
      await ethers.provider.send("evm_mine", []);

      // Calculate expected rewards
      const hoursStaked = 120n; // 5 days * 24 hours
      const rewardPerHour = 40n;
      const tokensStaked = 5n;
      const totalRewards = hoursStaked * rewardPerHour * tokensStaked;

      console.log("Total Rewards after 5 days:", totalRewards);

      // Mint first token
      await derpyDragons.connect(user1).mintToken();
      expect(await derpyDragons.mintedDragonCount()).to.equal(1);

      // Remaining rewards after first mint
      const pointsRequired = 10000n;
      const remainingRewardsAfterFirstMint = totalRewards - pointsRequired;
      expect(
        await derpyDragons.pendingRewards(await user1.getAddress())
      ).to.equal(remainingRewardsAfterFirstMint);

      // Mint second token
      await derpyDragons.connect(user1).mintToken();
      expect(await derpyDragons.mintedDragonCount()).to.equal(2);

      // Remaining rewards after second mint
      const remainingRewardsAfterSecondMint =
        remainingRewardsAfterFirstMint - pointsRequired;
      expect(
        await derpyDragons.pendingRewards(await user1.getAddress())
      ).to.equal(remainingRewardsAfterSecondMint);

      // Advance time to accumulate enough for a third mint
      const additionalHours = 30 * 60 * 60; // 30 hours
      await ethers.provider.send("evm_increaseTime", [additionalHours]);
      await ethers.provider.send("evm_mine", []);

      // Mint third token
      await derpyDragons.connect(user1).mintToken();
      expect(await derpyDragons.mintedDragonCount()).to.equal(3);

      // Verify remaining rewards after third mint are zero
      expect(
        await derpyDragons.pendingRewards(await user1.getAddress())
      ).to.equal(0n);
    });
  });
});
