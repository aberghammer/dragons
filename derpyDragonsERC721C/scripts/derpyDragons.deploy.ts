import { ethers } from "hardhat";
import { config as dotEnvConfig } from "dotenv";
import { blue, green, red, bold } from "colorette";

dotEnvConfig();

async function main() {
  console.log(blue("🚀 Deploying Dwaginz Contract..."));

  // Get the deployer's address
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  console.log(`🧑‍💻 Deployer Address: ${deployerAddress}`);

  // Deploy the Dwaginz contract
  const Dwaginz = await ethers.getContractFactory("Dwaginz");
  const dwaginz = await Dwaginz.deploy(
    deployerAddress, // Royalty Receiver
    500, // Royalty fee numerator (5%)
    "DWAGINZ", // Token name
    "D" // Token symbol
  );

  // Wait for deployment
  await dwaginz.waitForDeployment();

  console.log(
    green(
      `Dwaginz Contract deployed at Address: ${bold(
        await dwaginz.getAddress()
      )}`
    )
  );
}

main().catch((error) => {
  console.error(red("❌ Error deploying Dwaginz:"), error);
  process.exitCode = 1;
});

// 1. Deploy
// 2. Verify
// 3. Set Dragons Lair Contract

// npx hardhat verify 0x5FbDB2315678afecb367f032d93F642f64180aa3 0xE09eA9cBc76b0105dd32312D4a2E37B4d4c7a43c 500 "DWAGINZ" "D" --network ApeChain
