import { ethers, upgrades } from "hardhat";
import "@nomicfoundation/hardhat-toolbox";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { MockEntropy, DerpyDragons } from "../typechain-types";

describe("DerpyDragons Minting with Entropy", async function () {
  async function mintingFixture() {
    const [owner, user1, user2] = await ethers.getSigners();

    const Dragons = await ethers.getContractFactory("Dragons");
    const dragons = await Dragons.deploy();
    await dragons.waitForDeployment();

    await dragons.mint(await user1.getAddress(), 10);
    await dragons.mint(await user2.getAddress(), 10);

    const MockEntropy = await ethers.getContractFactory("MockEntropy");
    const entropy = await MockEntropy.deploy(await owner.getAddress());
    await entropy.waitForDeployment();

    const DerpyDragons = await ethers.getContractFactory("DerpyDragons");
    const derpyDragonsUntyped = await upgrades.deployProxy(
      DerpyDragons,
      [
        "Derpy Dragons",
        "DD",
        await entropy.getAddress(),
        40,
        await dragons.getAddress(),
      ],
      { initializer: "initialize" }
    );
    await derpyDragonsUntyped.waitForDeployment();

    const derpyDragons = derpyDragonsUntyped as unknown as DerpyDragons;

    // Set the DerpyDragons contract as the caller for the entropy contract
    await entropy.setCallerContract(await derpyDragons.getAddress());

    return {
      owner,
      user1,
      user2,
      derpyDragons,
      dragons,
      entropy,
    };
  }

  describe("Minting with Randomness", async function () {
    it("should correctly handle a successful mint with randomness callback", async function () {
      const { user1, derpyDragons, dragons, entropy } = await loadFixture(
        mintingFixture
      );

      // Enable staking mode and stake tokens
      await derpyDragons.setStakingMode(true);
      const tokenIds = [1, 2, 3, 4, 5];
      await dragons
        .connect(user1)
        .setApprovalForAll(await derpyDragons.getAddress(), true);
      await derpyDragons.connect(user1).stake(tokenIds);

      // Advance time to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 10]); // 10 days
      await ethers.provider.send("evm_mine", []);

      // Mint token request
      const tx = await derpyDragons.connect(user1).mintToken(1, {
        value: ethers.parseEther("0.01"), // Mock fee
      });
      const receipt = await tx.wait();

      // console.log("Minted token receipt:", receipt);

      // Set up a filter for the MintRequested event and query it
      const filter = derpyDragons.filters.MintRequested();

      // console.log("Filter:", filter);

      // console.log("Block hash:", receipt.hash);

      const events = await derpyDragons.queryFilter(filter);

      // Verify the MintRequested event was emitted with the correct values
      const event = events[0];

      const sequenceNumber = event.args![1];

      expect(event.args!.user).to.equal(await user1.getAddress());
      expect(sequenceNumber).to.be.a("bigInt");

      // Manually trigger the entropy callback
      await entropy.fireCallbackManually(sequenceNumber);

      // Verify that the token was minted and assigned to the user
      expect(await derpyDragons.ownerOf(1)).to.equal(await user1.getAddress());
      expect(await derpyDragons.mintedDragonCount()).to.equal(1);

      // Set up a filter for the TokenMinted event and query it
      const mintedFilter = derpyDragons.filters.TokenMinted();
      const mintedEvents = await derpyDragons.queryFilter(mintedFilter);

      // Verify the TokenMinted event
      const mintedEvent = mintedEvents[0];
      expect(mintedEvent.args!.user).to.equal(await user1.getAddress());
      expect(mintedEvent.args!.tokenId).to.equal(1);

      console.log("Minted token event:", await derpyDragons.mintRequests(1));

      expect(await derpyDragons.balanceOf(await user1.getAddress())).to.equal(
        1
      );
    });
  });
});
