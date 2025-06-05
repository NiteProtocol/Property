import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';

import { shouldBehaveLikeERC721Booking, shouldBehaveLikeERC721Metadata } from './ERC721Booking.behavior';

async function fixture() {
  const [deployer, treasury, host, ...otherAccounts] = await ethers.getSigners();

  const gasToken = await ethers.deployContract('ERC20Test', ['token1', 'TK1']);
  const fee = 0;

  const factory = await ethers.deployContract('Factory', [
    gasToken.getAddress(),
    fee,
  ]);
  const factoryAddress = await factory.getAddress();

  const name = 'Nites in Mansion in Mars';
  const symbol = 'NT';
  const region = 'Mars';


  const token = await ethers.deployContract('Property', [
    host.address,
    factoryAddress,
    name,
    symbol,
    region
  ]);

  return {
    deployer,
    treasury,
    host,
    otherAccounts,
    factory,
    token,
    gasToken,
    fee,
    name,
    symbol,
    region
  };
}

describe('ERC721Booking', function () {
  beforeEach(async function () {
    Object.assign(this, await loadFixture(fixture));
  });

  shouldBehaveLikeERC721Booking();
  shouldBehaveLikeERC721Metadata();
});
