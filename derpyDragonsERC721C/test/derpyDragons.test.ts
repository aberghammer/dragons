import { ethers } from "hardhat";
import { expect } from "chai";
import { Contract, Signer } from "ethers";
import { DerpyDragons } from "../typechain-types";

describe("ERC721CWithBasicRoyalties", function () {
  let contract: DerpyDragons;
  let owner: Signer;
  let otherAccount: Signer;
  let dragonLair: Signer;

  async function deployFixture() {
    [owner, otherAccount, dragonLair] = await ethers.getSigners();

    const DerpyDragons = await ethers.getContractFactory("DerpyDragons");
    contract = (await DerpyDragons.deploy(
      await owner.getAddress(), // Royalty Receiver
      500, // 5% Royalty Fee Numerator (500 / 10000)
      "DerpyDragons",
      "DD"
    )) as DerpyDragons;

    await contract.waitForDeployment();
  }

  beforeEach(async () => {
    await deployFixture();
  });

  describe("Deployment", function () {
    it("should deploy with correct parameters", async function () {
      expect(await contract.owner()).to.equal(await owner.getAddress());
      expect(await contract.name()).to.equal("DerpyDragons");
      expect(await contract.symbol()).to.equal("DD");
    });
  });

  describe("Royalties", function () {
    it("should set default royalty correctly", async function () {
      await contract.setDefaultRoyalty(await otherAccount.getAddress(), 1000);
      const royaltyInfo = await contract.royaltyInfo(1, ethers.parseEther("1"));

      expect(royaltyInfo[0]).to.equal(await otherAccount.getAddress());
      expect(royaltyInfo[1]).to.equal(ethers.parseEther("0.1")); // 10% of 1 ETH
    });

    it("should not allow non-owner to set royalties", async function () {
      await expect(
        contract
          .connect(otherAccount)
          .setDefaultRoyalty(await otherAccount.getAddress(), 1000)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Minting", function () {
    it("should allow dragon lair to mint tokens", async function () {
      await contract.setDragonLairAddress(await dragonLair.getAddress());
      await contract
        .connect(dragonLair)
        .mint(await owner.getAddress(), "ipfs://token-uri-1");

      expect(await contract.tokenURI(1)).to.equal("ipfs://token-uri-1");
      expect(await contract.ownerOf(1)).to.equal(await owner.getAddress());
    });

    it("should not allow non-dragon lair to mint tokens", async function () {
      await expect(
        contract
          .connect(otherAccount)
          .mint(await otherAccount.getAddress(), "ipfs://token-uri-2")
      ).to.be.revertedWithCustomError(contract, "InvalidCaller");
    });
  });

  describe("Access Control", function () {
    it("should only allow owner to set dragon lair address", async function () {
      await contract.setDragonLairAddress(await dragonLair.getAddress());
      expect(await contract.dragonLairAddress()).to.equal(
        await dragonLair.getAddress()
      );

      await expect(
        contract
          .connect(otherAccount)
          .setDragonLairAddress(await otherAccount.getAddress())
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("setTokenRoyalty", function () {
    it("should allow the owner to set a royalty for a specific token", async function () {
      // Owner sets royalty for token ID 1
      await contract.setTokenRoyalty(1, await otherAccount.getAddress(), 1000);

      const royaltyInfo = await contract.royaltyInfo(1, ethers.parseEther("1"));
      expect(royaltyInfo[0]).to.equal(await otherAccount.getAddress());
      expect(royaltyInfo[1]).to.equal(ethers.parseEther("0.1")); // 10% of 1 ETH
    });

    it("should revert if a non-owner tries to set token royalty", async function () {
      await expect(
        contract
          .connect(otherAccount)
          .setTokenRoyalty(1, await otherAccount.getAddress(), 1000)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should allow setting different royalties for different tokens", async function () {
      await contract.setTokenRoyalty(1, await owner.getAddress(), 500);
      await contract.setTokenRoyalty(2, await otherAccount.getAddress(), 1000);

      const royaltyInfo1 = await contract.royaltyInfo(
        1,
        ethers.parseEther("1")
      );
      const royaltyInfo2 = await contract.royaltyInfo(
        2,
        ethers.parseEther("1")
      );

      expect(royaltyInfo1[0]).to.equal(await owner.getAddress());
      expect(royaltyInfo1[1]).to.equal(ethers.parseEther("0.05")); // 5% of 1 ETH

      expect(royaltyInfo2[0]).to.equal(await otherAccount.getAddress());
      expect(royaltyInfo2[1]).to.equal(ethers.parseEther("0.1")); // 10% of 1 ETH
    });
  });

  describe("setDragonLairAddress", function () {
    it("should allow the owner to set a valid dragon lair address", async function () {
      await contract.setDragonLairAddress(await dragonLair.getAddress());
      expect(await contract.dragonLairAddress()).to.equal(
        await dragonLair.getAddress()
      );
    });

    it("should revert if the address is zero", async function () {
      await expect(
        contract.setDragonLairAddress(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid address");
    });

    it("should revert if a non-owner tries to set the dragon lair address", async function () {
      await expect(
        contract
          .connect(otherAccount)
          .setDragonLairAddress(await otherAccount.getAddress())
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should support ERC165 interface", async function () {
      const ERC165_INTERFACE_ID = "0x01ffc9a7";
      const supportsERC165 = await contract.supportsInterface(
        ERC165_INTERFACE_ID
      );
      expect(supportsERC165).to.be.true;
    });

    it("should support ERC721 interface", async function () {
      const ERC721_INTERFACE_ID = "0x80ac58cd";
      const supportsERC721 = await contract.supportsInterface(
        ERC721_INTERFACE_ID
      );
      expect(supportsERC721).to.be.true;
    });

    it("should support ERC2981 interface (royalties)", async function () {
      const ERC2981_INTERFACE_ID = "0x2a55205a";
      const supportsERC2981 = await contract.supportsInterface(
        ERC2981_INTERFACE_ID
      );
      expect(supportsERC2981).to.be.true;
    });

    it("should not support an unsupported interface", async function () {
      const UNSUPPORTED_INTERFACE_ID = "0xffffffff";
      const supportsUnsupported = await contract.supportsInterface(
        UNSUPPORTED_INTERFACE_ID
      );
      expect(supportsUnsupported).to.be.false;
    });
  });

  describe("setTokenURI", function () {
    it("should allow the owner to update a token's URI", async function () {
      // Set dragon lair and mint a token
      await contract.setDragonLairAddress(await dragonLair.getAddress());
      await contract
        .connect(dragonLair)
        .mint(await owner.getAddress(), "ipfs://initial-uri");

      // Verify initial URI
      expect(await contract.tokenURI(1)).to.equal("ipfs://initial-uri");

      // Owner updates the URI
      await contract.setTokenURI(1, "ipfs://new-uri");
      expect(await contract.tokenURI(1)).to.equal("ipfs://new-uri");
    });

    it("should revert if a non-owner tries to update a token's URI", async function () {
      // Set dragon lair and mint a token
      await contract.setDragonLairAddress(await dragonLair.getAddress());
      await contract
        .connect(dragonLair)
        .mint(await owner.getAddress(), "ipfs://initial-uri");

      // Attempt to update the URI from a non-owner account
      await expect(
        contract
          .connect(otherAccount)
          .setTokenURI(1, "ipfs://attempted-unauthorized-uri")
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
});
