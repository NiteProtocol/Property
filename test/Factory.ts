import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { AbiCoder, ZeroAddress, getAddress, keccak256, solidityPacked, toUtf8Bytes } from 'ethers';

describe('Factory', function () {
  function computeCreate2Address(saltHex: string, bytecode: string, deployer: string) {
    return getAddress(
      '0x' +
        keccak256(
          solidityPacked(['bytes', 'address', 'bytes32', 'bytes32'], ['0xff', deployer, saltHex, keccak256(bytecode)]),
        ).slice(-40),
    );
  }

  async function deployFactoryFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, ...otherAccounts] = await ethers.getSigners();

    const gasToken = await ethers.deployContract('ERC20Test', ['token1', 'TK1']);

    const fee = 500;

    const factoryFactory = await ethers.getContractFactory('Factory');
    const factory = await factoryFactory.deploy(await gasToken.getAddress(), fee);

    return { factory, owner, otherAccounts, gasToken, fee };
  }

  describe('Deployment', () => {
    it('revert if gas token is zero address', async () => {
      await loadFixture(deployFactoryFixture);
      const fee = 500;

      const factoryFactory = await ethers.getContractFactory('Factory');
      await expect(factoryFactory.deploy(ZeroAddress, fee)).revertedWithCustomError(
        factoryFactory,
        'ZeroAddress',
      );
    });
  });

  describe('Set operator', () => {
    it('set the right owner', async () => {
      const { factory, owner } = await loadFixture(deployFactoryFixture);
      expect(await factory.owner()).deep.equal(owner.address);
    });
  });

  describe('Set fee amount per Nite transfer', () => {
    it('set the right gas token', async () => {
      const { factory, gasToken } = await loadFixture(deployFactoryFixture);
      const token = await factory.getTRVLAddress();

      expect(token).deep.equal(await gasToken.getAddress());
    });

    it('set the right fee amount', async () => {
      const { factory, fee } = await loadFixture(deployFactoryFixture);

      const res = await factory.feeAmountPerTransfer();

      expect(res).deep.equal(fee);
    });

    it('set the new fee amount', async () => {
      const { factory } = await loadFixture(deployFactoryFixture);
      const newFee = 200;

      await expect(factory.setFeeAmountPerTransfer(newFee))
        .to.emit(factory, 'NewFeeAmountPerTransfer')
        .withArgs(newFee);
    });

    it('revert if caller is not OPERATOR', async () => {
      const { factory, otherAccounts } = await loadFixture(deployFactoryFixture);

      await expect(factory.connect(otherAccounts[4]).setFeeAmountPerTransfer(100)).revertedWithCustomError(
        factory,
        'OwnableUnauthorizedAccount',
      );
    });
  });

  describe('Create Nite token contract', () => {
    it('host can create Nite token contract', async () => {
      const { factory, otherAccounts } = await loadFixture(deployFactoryFixture);
      const factoryAddress = await factory.getAddress();

      const slot = 1;
      const host = otherAccounts[2];
      const name = 'Nites in Mansion in Mars';
      const symbol = 'NT';
      const region = 'Mars';

      // compute offchain address before deploying a new RNT contact
      const salt = keccak256(
        solidityPacked(['address', 'uint256', 'bytes32'], [host.address, slot, keccak256(toUtf8Bytes('BOOKING_V5'))]),
      );

      const encodedParams = AbiCoder.defaultAbiCoder()
        .encode(
          ['address', 'address', 'string', 'string', 'string'],
          [host.address, factoryAddress, name, symbol, region],
        )
        .slice(2);

      const propertyFactory = await ethers.getContractFactory('Property');
      const constructorByteCode = `${propertyFactory.bytecode}${encodedParams}`;

      const offchainComputed = computeCreate2Address(salt, constructorByteCode, factoryAddress);

      await expect(factory.connect(host).createPropertyContract(slot, host.address, name, symbol, region))
        .emit(factory, 'NewPropertyContract')
        .withArgs(slot, offchainComputed, host.address);
    });

    it('anyone can create Nite token contract', async () => {
      const { factory, otherAccounts } = await loadFixture(deployFactoryFixture);
      const factoryAddress = await factory.getAddress();

      const slot = 1;
      const host = otherAccounts[2];
      const name = 'Nites in Mansion in Mars';
      const symbol = 'NT';
      const region = 'Mars';

      // compute offchain address before deploying a new RNT contact
      const salt = keccak256(
        solidityPacked(['address', 'uint256', 'bytes32'], [host.address, slot, keccak256(toUtf8Bytes('BOOKING_V5'))]),
      );

      const encodedParams = AbiCoder.defaultAbiCoder()
        .encode(
          ['address', 'address', 'string', 'string', 'string'],
          [host.address, factoryAddress, name, symbol, region],
        )
        .slice(2);

      const propertyFactory = await ethers.getContractFactory('Property');
      const constructorByteCode = `${propertyFactory.bytecode}${encodedParams}`;

      const offchainComputed = computeCreate2Address(salt, constructorByteCode, factoryAddress);

      await expect(factory.connect(otherAccounts[0]).createPropertyContract(slot, host.address, name, symbol, region))
        .emit(factory, 'NewPropertyContract')
        .withArgs(slot, offchainComputed, host.address);
    });

    it('revert if token contract is already deployed', async () => {
      const { factory, otherAccounts } = await loadFixture(deployFactoryFixture);

      const slot = 1;
      const host = otherAccounts[2];
      const name = 'Nites in Mansion in Mars';
      const symbol = 'NT';
      const region = 'Mars';

      await factory.createPropertyContract(slot, host.address, name, symbol, region);

      await expect(factory.createPropertyContract(slot, host.address, name, symbol, region)).revertedWithCustomError(
        factory,
        'TokenDeployedAlready',
      );
    });

    it('revert if slot id is already taken', async () => {
      const { factory, otherAccounts } = await loadFixture(deployFactoryFixture);

      const slot = 1;
      const host = otherAccounts[2];
      let name = 'Nites in Mansion in Mars';
      const symbol = 'NT';
      const region = 'Mars'; const city = "Mars Colony 1";

      await factory.createPropertyContract(slot, host.address, name, symbol, region);

      name = 'Nites in Motel in Venus';
      const region2 = 'Venus'; const city2 = "Venus Colony 2";

      await expect(factory.createPropertyContract(slot, host.address, name, symbol, region2)).revertedWithCustomError(
        factory,
        'TokenDeployedAlready',
      );
    });
  });
});
