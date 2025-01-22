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
    "0xBacFd63b5B6a879aca84dAb951b42B405a457127", // Royalty Receiver
    690, // Royalty fee numerator (5%)
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

// npx hardhat verify 0x20c6d96CeA6e34F7eb8e441AEf1871551CB1b897 0xA09751B61db352d892c4dD204053E9D6e5924E1b 500 "DWAGINZ" "D" --network ApeChain

// npx hardhat verify 0xd0dd08482e2Dc03670968F0e2e49581235F0CEda 0xBacFd63b5B6a879aca84dAb951b42B405a457127 690 "DWAGINZ" "D" --network ApeChain
