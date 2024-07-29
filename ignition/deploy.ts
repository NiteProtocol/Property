import { ethers } from 'hardhat';

import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const signers = await ethers.getSigners();
  console.log(signers);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
