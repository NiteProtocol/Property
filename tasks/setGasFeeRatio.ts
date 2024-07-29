import { HardhatRuntimeEnvironment, TaskArguments } from 'hardhat/types';

const setGasFeeRatio = async (taskArgs: TaskArguments, hre: HardhatRuntimeEnvironment) => {
  const accounts = await hre.ethers.getSigners();
  for (const account of accounts) {
    console.log(account.address);
  }
};

export default setGasFeeRatio;
