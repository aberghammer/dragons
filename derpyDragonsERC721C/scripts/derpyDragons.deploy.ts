import { ethers } from "hardhat";
import { config as dotEnvConfig } from "dotenv";
import { blue, green, red, bold } from "colorette";

dotEnvConfig();

async function main() {
  console.log(blue("🚀 Deploying DerpyDragons Contract..."));

  // Get the deployer's address
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  console.log(`🧑‍💻 Deployer Address: ${deployerAddress}`);

  // Deploy the DerpyDragons contract
  const DerpyDragons = await ethers.getContractFactory("DerpyDragons");
  const derpyDragons = await DerpyDragons.deploy(
    deployerAddress, // Royalty Receiver
    500, // Royalty fee numerator (5%)
    "Testi Testo", // Token name
    "TT" // Token symbol
  );

  // Wait for deployment
  await derpyDragons.waitForDeployment();

  console.log(
    green(
      `DerpyDragons Contract deployed at Address: ${bold(
        await derpyDragons.getAddress()
      )}`
    )
  );
}

main().catch((error) => {
  console.error(red("❌ Error deploying DerpyDragons:"), error);
  process.exitCode = 1;
});

// npx hardhat verify 0x25402FfD2e63844Bc649e2d551723657cC389FDA 0xE09eA9cBc76b0105dd32312D4a2E37B4d4c7a43c, 500,"Testi Testo","TT" --network ApeChain
