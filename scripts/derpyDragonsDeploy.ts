import { ethers, upgrades, run, network } from "hardhat";
import { config as dotEnvConfig } from "dotenv";
import { blue, green, yellow, red, bold } from "colorette";

dotEnvConfig();

async function main() {
  console.log(blue("🚀 Deploying DerpyDragons Contract..."));

  const DerpyDragons = await ethers.getContractFactory("DerpyDragons");
  const derpyDragons = await upgrades.deployProxy(
    DerpyDragons,
    [
      "Derpy Dragons",
      "DD",
      "0x23f0e8FAeE7bbb405E7A7C3d60138FCfd43d7509",
      1000n,
      "0x095a8aa22cf86e222fbc0f829ae9d0831d8c52bc", //R`s on ape
    ],
    {
      initializer: "initialize",
      kind: "uups", // Specifies UUPS upgradeable pattern
      txOverrides: {
        gasLimit: 5000000,
      },
    }
  );
  await derpyDragons.waitForDeployment();

  console.log(
    green(
      `DerpyDragons Contract deployed at Proxy Address: ${bold(
        await derpyDragons.getAddress()
      )}`
    )
  );
}

main().catch((error) => {
  console.error(red("❌ Error deploying DerpyDragons:"), error);
  process.exitCode = 1;
});
