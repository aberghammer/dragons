const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
  // Erstelle eine neue Wallet
  const wallet = ethers.Wallet.createRandom();

  console.log("🚀 Wallet erstellt:");
  console.log(`- Adresse: ${wallet.address}`);
  console.log(`- Privater Schlüssel: ${wallet.privateKey}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
