import { ethers, network } from 'hardhat';
import { expect } from 'chai';
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { ZeroAddress, toUtf8Bytes } from 'ethers';
import { getRandomInt } from './utils/helpers';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { ERC1271WalletMock, Property } from '../typechain-types';

describe('Property', () => {
  // typed data hash for eip-712
  const domain = {
    name: 'DtravelNT',
    version: '1',
    chainId: network.config.chainId,
    verifyingContract: '',
  };

  const permitTypes = {
    Permit: [
      { name: 'spender', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  };

  const permitForAllTypes = {
    PermitForAll: [
      { name: 'owner', type: 'address' },
      { name: 'operator', type: 'address' },
      { name: 'approved', type: 'bool' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  };

  const min = 3600;
  const firstTokenId = 5042n;
  const secondTokenId = 79217n;
  const fourthTokenId = 4n;

  const generatePermitSignature = async function (
    tokenContract: Property,
    owner: SignerWithAddress,
    spender: string,
    tokenId: bigint,
    deadline: number,
    nonce?: bigint,
  ): Promise<string> {
    nonce ??= await tokenContract.sigNonces(owner.address);
    const data = {
      spender,
      tokenId,
      nonce,
      deadline,
    };

    // update domain part
    domain.verifyingContract = await tokenContract.getAddress();

    // return signature
    return owner.signTypedData(domain, permitTypes, data);
  };

  const generatePermitForAllSignature = async function (
    tokenContract: Property,
    owner: SignerWithAddress,
    operator: string,
    approved: boolean,
    deadline: number,
    nonce?: bigint,
    smartWallet?: ERC1271WalletMock,
  ): Promise<string> {
    nonce ??= await tokenContract.sigNonces(owner.address);
    const walletAddress = await smartWallet?.getAddress();
    const data = {
      owner: walletAddress ?? owner.address,
      operator,
      approved,
      nonce,
      deadline,
    };

    // update domain part
    domain.verifyingContract = await tokenContract.getAddress();

    // return signature
    return owner.signTypedData(domain, permitForAllTypes, data);
  };

  async function deployPropertyFixture() {
    const [deployer, factoryOperator, treasury, host, ...otherAccounts] = await ethers.getSigners();

    const gasToken = await ethers.deployContract('ERC20Test', ['token1', 'TK1']);
    const fee = 0;

    const factory = await ethers.deployContract('Factory', [
      factoryOperator.address,
      gasToken.getAddress(),
      fee,
    ]);
    const factoryAddress = await factory.getAddress();

    const name = 'Nites in Mansion in Mars';
    const symbol = 'NT';
    const uri = 'http://ipfs.io/ipfs/NT/';

    const token = await ethers.deployContract('Property', [
      host.address,
      factoryOperator.address,
      factoryAddress,
      name,
      symbol,
      uri,
    ]);

    return {
      deployer,
      factoryOperator,
      treasury,
      host,
      otherAccounts,
      factory,
      token,
      gasToken,
      fee,
      name,
      symbol,
      uri,
    };
  }

  describe('Deployment', () => {
    it('revert if factory address is zero address', async () => {
      const { host, name, symbol, uri } = await loadFixture(deployPropertyFixture);

      const niteFactory = await ethers.getContractFactory('Property');
      await expect(
        ethers.deployContract('Property', [host.address, ZeroAddress, ZeroAddress, name, symbol, uri]),
      ).revertedWithCustomError(niteFactory, 'ZeroAddress');
    });

    it('token transfer approval must not be granted to the zero address operator.', async () => {
      const { host, factory, name, symbol, uri, factoryOperator } = await loadFixture(deployPropertyFixture);

      const nite = await ethers.deployContract('Property', [
        host.address,
        ZeroAddress,
        factory.getAddress(),
        name,
        symbol,
        uri,
      ]);
      expect(await nite.isApprovedForAll(host.address, factoryOperator.address)).deep.equal(false);
    });

    it('pause token transfer by default', async () => {
      const { token } = await loadFixture(deployPropertyFixture);
      expect(await token.paused()).deep.equal(true);
    });

    it('host can transfer by default', async () => {
      const { token, host, otherAccounts } = await loadFixture(deployPropertyFixture);
      const to = otherAccounts[2].address;
      const tokenId = getRandomInt(1, 100);
      await expect(token.connect(host).transferFrom(host.address, to, tokenId))
        .emit(token, 'Transfer')
        .withArgs(host.address, to, tokenId);
    });

    it('factory operator can transfer by default', async () => {
      const { token, host, factoryOperator, otherAccounts } = await loadFixture(deployPropertyFixture);
      const to = otherAccounts[2].address;
      const tokenId = getRandomInt(1, 100);
      await expect(token.connect(factoryOperator).transferFrom(host.address, to, tokenId))
        .emit(token, 'Transfer')
        .withArgs(host.address, to, tokenId);
    });

    it('user can not transfer by default', async () => {
      const { token, host, otherAccounts } = await loadFixture(deployPropertyFixture);
      const to = otherAccounts[2];
      const tokenId = getRandomInt(1, 100);
      await expect(token.connect(host).transferFrom(host.address, to.address, tokenId))
        .emit(token, 'Transfer')
        .withArgs(host.address, to.address, tokenId);

      await expect(token.connect(to).transferFrom(to.address, host.address, tokenId)).revertedWithCustomError(
        token,
        'TransferWhilePaused',
      );
    });
  });

  describe('Host setting', () => {
    describe('setName', () => {
      it('host can set token name', async () => {
        const { host, token } = await loadFixture(deployPropertyFixture);
        const newName = 'New Nite in Venus';
        await token.connect(host).setName(newName);
        expect(await token.name()).deep.equal(newName);
      });

      it('revert if caller is not host', async () => {
        const { factoryOperator, token } = await loadFixture(deployPropertyFixture);
        const newName = 'New Nite in Venus';
        await expect(token.connect(factoryOperator).setName(newName)).revertedWithCustomError(token, 'OwnableUnauthorizedAccount');
      });
    });

    describe('setBaseURI', () => {
      it('host can set token base URI', async () => {
        const { host, token } = await loadFixture(deployPropertyFixture);
        const baseURI = 'https://api.example.com/v1/';
        await token.connect(host).setBaseURI(baseURI);
        expect(await token.baseTokenURI()).deep.equal(baseURI);
      });

      it('revert if caller is not host', async () => {
        const { factoryOperator, token } = await loadFixture(deployPropertyFixture);
        const baseURI = 'https://api.example.com/v1/';
        await expect(token.connect(factoryOperator).setBaseURI(baseURI)).revertedWithCustomError(token, 'OwnableUnauthorizedAccount');
      });
    });

    describe('Pause', () => {
      beforeEach(async function () {
        Object.assign(this, await loadFixture(deployPropertyFixture));
        await this.token.connect(this.host).unpause();
      });

      it('host can pause token transfers', async function () {
        await expect(this.token.connect(this.host).pause()).emit(this.token, 'Paused').withArgs(this.host.address);
      });

      it('revert if caller is not host', async function () {
        await expect(this.token.connect(this.otherAccounts[0]).pause()).revertedWithCustomError(this.token, 'OwnableUnauthorizedAccount');
      });
    });

    describe('Unpause', () => {
      it('host can unpause token transfers', async function () {
        const { host, token } = await loadFixture(deployPropertyFixture);
        await expect(token.connect(host).unpause()).emit(token, 'Unpaused').withArgs(host.address);
      });

      it('revert if caller is not host', async function () {
        const { otherAccounts, token } = await loadFixture(deployPropertyFixture);
        await expect(token.connect(otherAccounts[0]).unpause()).revertedWithCustomError(token, 'OwnableUnauthorizedAccount');
      });
    });
  });

  describe('Permit', () => {
    describe('by host', () => {
      it('should permit', async () => {
        const { token, host, otherAccounts } = await loadFixture(deployPropertyFixture);
        const deadline = (await time.latest()) + 1 * min;
        const spender = otherAccounts[0];

        // generate signature
        const sigs = await generatePermitSignature(token, host, spender.address, firstTokenId, deadline);

        await expect(token.connect(host).permit(spender, firstTokenId, deadline, sigs))
          .emit(token, 'Approval')
          .withArgs(host.address, spender.address, firstTokenId);

        // spender can transfer now
        await token.connect(host).unpause();

        const to = otherAccounts[2];
        await expect(
          token.connect(spender)['safeTransferFrom(address,address,uint256)'](host.address, to.address, firstTokenId),
        )
          .emit(token, 'Transfer')
          .withArgs(host.address, to.address, firstTokenId);
      });

      it('transfer with permit', async () => {
        const { token, host, otherAccounts } = await loadFixture(deployPropertyFixture);
        const deadline = (await time.latest()) + 1 * min;
        const spender = otherAccounts[0];

        // spender can transfer with permit now
        await token.connect(host).unpause();

        // generate signature
        const sigs = await generatePermitSignature(token, host, spender.address, firstTokenId, deadline);

        const to = otherAccounts[2];
        const tx = await token.connect(spender).transferWithPermit(to.address, firstTokenId, deadline, sigs);

        await expect(tx).emit(token, 'Approval').withArgs(host.address, spender.address, firstTokenId);
        await expect(tx).emit(token, 'Transfer').withArgs(host.address, to.address, firstTokenId);
      });

      it('revert if spender is the owner', async () => {
        const { token, host } = await loadFixture(deployPropertyFixture);
        const deadline = (await time.latest()) + 1 * min;
        const spender = host;

        // generate signature
        const sigs = await generatePermitSignature(token, host, spender.address, firstTokenId, deadline);

        await expect(token.connect(host).permit(host, firstTokenId, deadline, sigs)).revertedWithCustomError(
          token,
          'ApprovalToCurrentOwner',
        );
      });

      describe('validate sigature', () => {
        it('revert if the permit has expired', async () => {
          const { token, host, otherAccounts } = await loadFixture(deployPropertyFixture);
          const deadline = (await time.latest()) - 1 * min;
          const spender = otherAccounts[0];

          // generate signature
          const sigs = await generatePermitSignature(token, host, spender.address, firstTokenId, deadline);

          await expect(token.connect(host).permit(spender, firstTokenId, deadline, sigs)).revertedWithCustomError(
            token,
            'PermitExpired',
          );
        });

        it('revert if caller does match with sig', async () => {
          const { token, host, otherAccounts } = await loadFixture(deployPropertyFixture);
          const deadline = (await time.latest()) + 1 * min;
          const spender = otherAccounts[0];

          // generate signature
          const sigs = await generatePermitSignature(token, spender, spender.address, firstTokenId, deadline);

          await expect(token.connect(host).permit(spender, firstTokenId, deadline, sigs)).revertedWithCustomError(
            token,
            'InvalidPermitSignature',
          );
        });

        it('revert if spender param does match with sig', async () => {
          const { token, host, otherAccounts } = await loadFixture(deployPropertyFixture);
          const deadline = (await time.latest()) + 1 * min;
          const spender = otherAccounts[0];

          // generate signature
          const sigs = await generatePermitSignature(token, host, otherAccounts[1].address, firstTokenId, deadline);

          await expect(token.connect(host).permit(spender, firstTokenId, deadline, sigs)).revertedWithCustomError(
            token,
            'InvalidPermitSignature',
          );
        });

        it('revert if tokenId param does match with sig', async () => {
          const { token, host, otherAccounts } = await loadFixture(deployPropertyFixture);
          const deadline = (await time.latest()) + 1 * min;
          const spender = otherAccounts[0];

          // generate signature
          const sigs = await generatePermitSignature(token, host, spender.address, firstTokenId, deadline);

          await expect(token.connect(host).permit(spender, secondTokenId, deadline, sigs)).revertedWithCustomError(
            token,
            'InvalidPermitSignature',
          );
        });

        it('revert if deadline param does match with sig', async () => {
          const { token, host, otherAccounts } = await loadFixture(deployPropertyFixture);
          const deadline = (await time.latest()) + 1 * min;
          const spender = otherAccounts[0];

          // generate signature
          const sigs = await generatePermitSignature(token, host, spender.address, firstTokenId, deadline);

          await expect(
            token.connect(host).permit(spender, firstTokenId, deadline + 2 * min, sigs),
          ).revertedWithCustomError(token, 'InvalidPermitSignature');
        });

        it('revert if nonce param does match with sig', async () => {
          const { token, host, otherAccounts } = await loadFixture(deployPropertyFixture);
          const deadline = (await time.latest()) + 1 * min;
          const spender = otherAccounts[0];

          // generate signature
          const sigs = await generatePermitSignature(token, host, spender.address, firstTokenId, deadline, 2n);

          await expect(token.connect(host).permit(spender, firstTokenId, deadline, sigs)).revertedWithCustomError(
            token,
            'InvalidPermitSignature',
          );
        });

        it('revert when replaying sig', async () => {
          const { token, host, otherAccounts } = await loadFixture(deployPropertyFixture);
          const deadline = (await time.latest()) + 1 * min;
          const spender = otherAccounts[0];

          // generate signature
          const sigs = await generatePermitSignature(token, host, spender.address, firstTokenId, deadline);

          await token.connect(host).permit(spender, firstTokenId, deadline, sigs);
          await expect(token.connect(host).permit(spender, firstTokenId, deadline, sigs)).revertedWithCustomError(
            token,
            'InvalidPermitSignature',
          );
        });
      });
    });

    describe('by holder', () => {
      beforeEach(async function () {
        Object.assign(this, await loadFixture(deployPropertyFixture));
        const [from, spender, to] = this.otherAccounts;
        Object.assign(this, { from, spender, to });

        await this.token.connect(this.host).unpause();
        await this.token.connect(this.host).safeTransferFrom(this.host.address, this.from.address, firstTokenId);
      });

      it('should permit', async function () {
        const deadline = (await time.latest()) + 1 * min;

        // generate signature
        const sigs = await generatePermitSignature(this.token, this.from, this.spender.address, firstTokenId, deadline);

        await expect(this.token.connect(this.host).permit(this.spender.address, firstTokenId, deadline, sigs))
          .emit(this.token, 'Approval')
          .withArgs(this.from.address, this.spender.address, firstTokenId);

        await expect(
          this.token
            .connect(this.spender)
            ['safeTransferFrom(address,address,uint256)'](this.from.address, this.to.address, firstTokenId),
        )
          .emit(this.token, 'Transfer')
          .withArgs(this.from.address, this.to.address, firstTokenId);
      });

      it('transfer with permit', async function () {
        const deadline = (await time.latest()) + 1 * min;

        // generate signature
        const sigs = await generatePermitSignature(this.token, this.from, this.spender.address, firstTokenId, deadline);

        const tx = await this.token
          .connect(this.spender)
          .transferWithPermit(this.to.address, firstTokenId, deadline, sigs);

        await expect(tx).emit(this.token, 'Approval').withArgs(this.from.address, this.spender.address, firstTokenId);
        await expect(tx).emit(this.token, 'Transfer').withArgs(this.from.address, this.to.address, firstTokenId);
      });

      it('revert if spender is the owner', async function () {
        const deadline = (await time.latest()) + 1 * min;
        this.spender = this.from;

        // generate signature
        const sigs = await generatePermitSignature(this.token, this.from, this.spender.address, firstTokenId, deadline);

        await expect(
          this.token.connect(this.spender).permit(this.spender, firstTokenId, deadline, sigs),
        ).revertedWithCustomError(this.token, 'ApprovalToCurrentOwner');
      });

      describe('validate sigature', () => {
        it('revert if the permit has expired', async function () {
          const deadline = (await time.latest()) - 1 * min;

          // generate signature
          const sigs = await generatePermitSignature(
            this.token,
            this.from,
            this.spender.address,
            firstTokenId,
            deadline,
          );

          await expect(
            this.token.connect(this.host).permit(this.spender, firstTokenId, deadline, sigs),
          ).revertedWithCustomError(this.token, 'PermitExpired');
        });

        it('revert if caller does match with sig', async function () {
          const deadline = (await time.latest()) + 1 * min;

          // generate signature
          const sigs = await generatePermitSignature(
            this.token,
            this.spender,
            this.spender.address,
            firstTokenId,
            deadline,
          );

          await expect(
            this.token.connect(this.host).permit(this.spender, firstTokenId, deadline, sigs),
          ).revertedWithCustomError(this.token, 'InvalidPermitSignature');
        });

        it('revert if spender param does match with sig', async function () {
          const deadline = (await time.latest()) + 1 * min;

          // generate signature
          const sigs = await generatePermitSignature(this.token, this.from, this.to.address, firstTokenId, deadline);

          await expect(
            this.token.connect(this.host).permit(this.spender.address, firstTokenId, deadline, sigs),
          ).revertedWithCustomError(this.token, 'InvalidPermitSignature');
        });

        it('revert if tokenId param does match with sig', async function () {
          const deadline = (await time.latest()) + 1 * min;

          // generate signature
          const sigs = await generatePermitSignature(
            this.token,
            this.from,
            this.spender.address,
            fourthTokenId,
            deadline,
          );

          await expect(
            this.token.connect(this.spender).permit(this.spender, firstTokenId, deadline, sigs),
          ).revertedWithCustomError(this.token, 'InvalidPermitSignature');
        });

        it('revert if deadline param does match with sig', async function () {
          const deadline = (await time.latest()) + 1 * min;

          // generate signature
          const sigs = await generatePermitSignature(
            this.token,
            this.from,
            this.spender.address,
            firstTokenId,
            deadline,
          );

          await expect(
            this.token.connect(this.spender).permit(this.spender.address, firstTokenId, deadline + 2 * min, sigs),
          ).revertedWithCustomError(this.token, 'InvalidPermitSignature');
        });

        it('revert if nonce param does match with sig', async function () {
          const deadline = (await time.latest()) + 1 * min;

          // generate signature
          const sigs = await generatePermitSignature(
            this.token,
            this.from,
            this.spender.address,
            firstTokenId,
            deadline,
            2n,
          );

          await expect(
            this.token.connect(this.host).permit(this.spender.address, firstTokenId, deadline, sigs),
          ).revertedWithCustomError(this.token, 'InvalidPermitSignature');
        });

        it('revert when replaying sig', async function () {
          const deadline = (await time.latest()) + 1 * min;

          // generate signature
          const sigs = await generatePermitSignature(
            this.token,
            this.from,
            this.spender.address,
            firstTokenId,
            deadline,
          );

          await this.token.connect(this.spender).permit(this.spender.address, firstTokenId, deadline, sigs);
          await expect(
            this.token.connect(this.spender).permit(this.spender, firstTokenId, deadline, sigs),
          ).revertedWithCustomError(this.token, 'InvalidPermitSignature');
        });
      });
    });

    describe('Support ERC1271 wallet', () => {
      it('with matching signer and signature', async () => {
        const { token, host, otherAccounts } = await loadFixture(deployPropertyFixture);

        const wallet = await ethers.deployContract('ERC1271WalletMock', [host]);
        const deadline = (await time.latest()) + 1 * min;
        const operator = otherAccounts[0];

        // transfer to smart wallet
        await token
          .connect(host)
          ['safeTransferFrom(address,address,uint256)'](host.address, await wallet.getAddress(), firstTokenId);

        // generate signature
        const sigs = await generatePermitSignature(token, host, operator.address, firstTokenId, deadline);

        await expect(token.connect(operator).permit(operator.address, firstTokenId, deadline, sigs))
          .emit(token, 'Approval')
          .withArgs(await wallet.getAddress(), operator.address, firstTokenId);

        // host enable token transfers
        await token.connect(host).unpause();

        // operator transfers tokens
        await expect(
          token
            .connect(operator)
            ['safeTransferFrom(address,address,uint256)'](await wallet.getAddress(), operator.address, firstTokenId),
        ).changeTokenBalances(token, [await wallet.getAddress(), operator], [-1, 1]);
      });
    });
  });

  describe('PermitForAll', () => {
    it('should permit for all by host', async () => {
      const { token, host, otherAccounts } = await loadFixture(deployPropertyFixture);
      const deadline = (await time.latest()) + 1 * min;
      const operator = otherAccounts[0];
      const to = otherAccounts[1];

      // generate signature
      const sigs = await generatePermitForAllSignature(token, host, operator.address, true, deadline);

      await expect(token.connect(operator).permitForAll(host.address, operator.address, true, deadline, sigs))
        .emit(token, 'ApprovalForAll')
        .withArgs(host.address, operator.address, true);

      // host enable transfers
      await token.connect(host).unpause();

      // operator can transfer tokens
      const tx = await token
        .connect(operator)
        [
          'safeBulkTransferFrom(address,address,uint256,uint256)'
        ](host.address, to.address, firstTokenId, firstTokenId + 2n);

      await expect(tx).changeTokenBalances(token, [host, to], [0, 3]);
    });

    it('should permit for all by holder', async () => {
      const { token, host, otherAccounts } = await loadFixture(deployPropertyFixture);

      const deadline = (await time.latest()) + 1 * min;
      const operator = otherAccounts[0];
      const from = otherAccounts[1];
      const to = otherAccounts[2];

      await token
        .connect(host)
        [
          'safeBulkTransferFrom(address,address,uint256,uint256,bytes)'
        ](host.address, from, firstTokenId, firstTokenId + 5n, '0x42');

      // generate signature
      const sigs = await generatePermitForAllSignature(token, from, operator.address, true, deadline);

      await expect(token.connect(operator).permitForAll(from.address, operator.address, true, deadline, sigs))
        .emit(token, 'ApprovalForAll')
        .withArgs(from.address, operator.address, true);

      // host enable transfers
      await token.connect(host).unpause();

      // operator can transfer tokens
      const tx = await token
        .connect(operator)
        [
          'safeBulkTransferFrom(address,address,uint256,uint256,bytes)'
        ](from.address, to.address, firstTokenId, firstTokenId + 2n, '0x42');

      await expect(tx).changeTokenBalances(token, [from, to], [-3, 3]);
    });

    it('revert if operator is zero address', async () => {
      const { token, host, otherAccounts } = await loadFixture(deployPropertyFixture);
      const deadline = (await time.latest()) + 1 * min;
      const operator = ZeroAddress;

      // generate signature
      const sigs = await generatePermitForAllSignature(token, host, operator, true, deadline);

      await expect(
        token.connect(otherAccounts[0]).permitForAll(host.address, operator, true, deadline, sigs),
      ).revertedWithCustomError(token, 'ZeroAddress');
    });

    it('revert if owner param does not match with sig', async () => {
      const { token, host, otherAccounts, factoryOperator } = await loadFixture(deployPropertyFixture);
      const deadline = (await time.latest()) + 1 * min;
      const operator = otherAccounts[0];

      // generate signature
      const sigs = await generatePermitForAllSignature(token, host, operator.address, true, deadline);

      await expect(
        token.connect(operator).permitForAll(factoryOperator.address, operator.address, true, deadline, sigs),
      ).revertedWithCustomError(token, 'InvalidPermitSignature');
    });

    it('revert if operator param does not match with sig', async () => {
      const { token, host, otherAccounts, factoryOperator } = await loadFixture(deployPropertyFixture);
      const deadline = (await time.latest()) + 1 * min;
      const operator = otherAccounts[0];

      // generate signature
      const sigs = await generatePermitForAllSignature(token, host, operator.address, true, deadline);

      await expect(
        token.connect(operator).permitForAll(host.address, factoryOperator.address, true, deadline, sigs),
      ).revertedWithCustomError(token, 'InvalidPermitSignature');
    });

    it('revert if approved param does not match with sig', async () => {
      const { token, host, otherAccounts } = await loadFixture(deployPropertyFixture);
      const deadline = (await time.latest()) + 1 * min;
      const operator = otherAccounts[0];

      // generate signature
      const sigs = await generatePermitForAllSignature(token, host, operator.address, false, deadline);

      await expect(
        token.connect(operator).permitForAll(host.address, operator.address, true, deadline, sigs),
      ).revertedWithCustomError(token, 'InvalidPermitSignature');
    });

    it('revert if deadline param does not match with sig', async () => {
      const { token, host, otherAccounts } = await loadFixture(deployPropertyFixture);
      const deadline = (await time.latest()) + 1 * min;
      const operator = otherAccounts[0];

      // generate signature
      const sigs = await generatePermitForAllSignature(token, host, operator.address, true, deadline);

      await expect(
        token.connect(operator).permitForAll(host.address, operator.address, true, deadline + 2 * min, sigs),
      ).revertedWithCustomError(token, 'InvalidPermitSignature');
    });

    it('revert if nonce does not match with sig', async () => {
      const { token, host, otherAccounts } = await loadFixture(deployPropertyFixture);
      const deadline = (await time.latest()) + 1 * min;
      const operator = otherAccounts[0];

      // generate signature
      const sigs = await generatePermitForAllSignature(token, host, operator.address, true, deadline, 3n);

      await expect(
        token.connect(operator).permitForAll(host.address, operator.address, true, deadline, sigs),
      ).revertedWithCustomError(token, 'InvalidPermitSignature');
    });

    it('revert when replaying sig', async () => {
      const { token, host, otherAccounts } = await loadFixture(deployPropertyFixture);
      const deadline = (await time.latest()) + 1 * min;
      const operator = otherAccounts[0];

      // generate signature
      const sigs = await generatePermitForAllSignature(token, host, operator.address, true, deadline);

      await token.connect(operator).permitForAll(host.address, operator.address, true, deadline, sigs);
      await expect(
        token.connect(operator).permitForAll(host.address, operator.address, true, deadline, sigs),
      ).revertedWithCustomError(token, 'InvalidPermitSignature');
    });

    describe('Support ERC1271 wallet', () => {
      it('with matching signer and signature', async () => {
        const { token, host, otherAccounts } = await loadFixture(deployPropertyFixture);

        const wallet = await ethers.deployContract('ERC1271WalletMock', [host]);
        const deadline = (await time.latest()) + 1 * min;
        const operator = otherAccounts[0];

        // transfer to smart wallet
        await token
          .connect(host)
          [
            'safeBulkTransferFrom(address,address,uint256,uint256)'
          ](host.address, await wallet.getAddress(), firstTokenId, firstTokenId + 2n);

        // generate signature
        const sigs = await generatePermitForAllSignature(
          token,
          host,
          operator.address,
          true,
          deadline,
          undefined,
          wallet,
        );

        await expect(
          token.connect(operator).permitForAll(await wallet.getAddress(), operator.address, true, deadline, sigs),
        )
          .emit(token, 'ApprovalForAll')
          .withArgs(await wallet.getAddress(), operator.address, true);

        // host enable token transfers
        await token.connect(host).unpause();

        // operator transfers tokens
        await expect(
          token
            .connect(operator)
            [
              'safeBulkTransferFrom(address,address,uint256,uint256)'
            ](await wallet.getAddress(), operator.address, firstTokenId, firstTokenId + 2n),
        ).changeTokenBalances(token, [await wallet.getAddress(), operator], [-3, 3]);
      });
    });
  });

  // describe('Charge gas token for nite transfers', () => {
  //   describe('hosts', () => {
  //     it('charge gas fee from nite contract', async () => {
  //       const { token, host, treasury, otherAccounts, gasToken, factory } = await loadFixture(deployPropertyFixture);

  //       const to = otherAccounts[0];

  //       // deposit gas tokens to nite contract
  //       await expect(gasToken.mint(await token.getAddress(), 1000)).changeTokenBalance(gasToken, token, 1000);

  //       // admin update gas fee amount per transfer
  //       await factory.setFeeAmountPerTransfer(200);

  //       // host transfer 4 nites then the fee is 3 * 200 = 600
  //       let tx = await token
  //         .connect(host)
  //         [
  //           'safeBulkTransferFrom(address,address,uint256,uint256)'
  //         ](host.address, to.address, firstTokenId, firstTokenId + 2n);

  //       await expect(tx).changeTokenBalances(token, [host, to], [0, 3]);
  //       await expect(tx).changeTokenBalances(gasToken, [token, treasury], [-600, 600]);

  //       // host transfer a nite token then the fee is 200
  //       tx = await token
  //         .connect(host)
  //         ['safeTransferFrom(address,address,uint256)'](host.address, to.address, secondTokenId);

  //       await expect(tx).changeTokenBalances(token, [host, to], [0, 1]);
  //       await expect(tx).changeTokenBalances(gasToken, [token, treasury], [-200, 200]);
  //     });

  //     it('revert when nite contract balance is insufficient', async () => {
  //       const { token, host, otherAccounts, gasToken, factory } = await loadFixture(deployPropertyFixture);

  //       const to = otherAccounts[0];

  //       // deposit gas tokens to nite contract
  //       await expect(gasToken.mint(await token.getAddress(), 300)).changeTokenBalance(gasToken, token, 300);

  //       // admin update gas fee amount per transfer
  //       await factory.setFeeAmountPerTransfer(200);

  //       // host transfer 4 nites then the fee is 4 * 200 = 800
  //       await expect(
  //         token
  //           .connect(host)
  //           [
  //             'safeBulkTransferFrom(address,address,uint256,uint256)'
  //           ](host.address, to.address, firstTokenId, firstTokenId + 3n),
  //       ).revertedWithCustomError(gasToken, 'ERC20InsufficientBalance');
  //     });
  //   });

  //   describe('operators', () => {
  //     it('charge gas fee from nite contract', async () => {
  //       const { token, host, treasury, factoryOperator, otherAccounts, gasToken, factory } =
  //         await loadFixture(deployPropertyFixture);

  //       const to = otherAccounts[0];

  //       // deposit gas tokens to nite contract
  //       await expect(gasToken.mint(await token.getAddress(), 1000)).changeTokenBalance(gasToken, token, 1000);

  //       // admin update gas fee amount per transfer
  //       await factory.setFeeAmountPerTransfer(200);

  //       // host transfer 4 nites then the fee is 3 * 200 = 600
  //       let tx = await token
  //         .connect(factoryOperator)
  //         [
  //           'safeBulkTransferFrom(address,address,uint256,uint256)'
  //         ](host.address, to.address, firstTokenId, firstTokenId + 2n);

  //       await expect(tx).changeTokenBalances(token, [host, to], [0, 3]);
  //       await expect(tx).changeTokenBalances(gasToken, [token, treasury], [-600, 600]);

  //       // host transfer a nite token then the fee is 200
  //       tx = await token
  //         .connect(host)
  //         ['safeTransferFrom(address,address,uint256)'](host.address, to.address, secondTokenId);

  //       await expect(tx).changeTokenBalances(token, [host, to], [0, 1]);
  //       await expect(tx).changeTokenBalances(gasToken, [token, treasury], [-200, 200]);
  //     });

  //     it('revert when nite contract balance is insufficient', async () => {
  //       const { token, host, factoryOperator, otherAccounts, gasToken, factory } =
  //         await loadFixture(deployPropertyFixture);

  //       const to = otherAccounts[0];

  //       // deposit gas tokens to nite contract
  //       await expect(gasToken.mint(await token.getAddress(), 300)).changeTokenBalance(gasToken, token, 300);

  //       // admin update gas fee amount per transfer
  //       await factory.setFeeAmountPerTransfer(200);

  //       // host transfer 4 nites then the fee is 4 * 200 = 800
  //       await expect(
  //         token
  //           .connect(factoryOperator)
  //           [
  //             'safeBulkTransferFrom(address,address,uint256,uint256)'
  //           ](host.address, to.address, firstTokenId, firstTokenId + 3n),
  //       ).revertedWithCustomError(gasToken, 'ERC20InsufficientBalance');
  //     });
  //   });

  //   describe('holders', () => {
  //     it('charge gas fee from token owner', async () => {
  //       const { token, host, treasury, factoryOperator, otherAccounts, gasToken, factory } =
  //         await loadFixture(deployPropertyFixture);

  //       const to = otherAccounts[0];

  //       // deposit gas tokens to nite contract
  //       await expect(gasToken.mint(await token.getAddress(), 1000)).changeTokenBalance(gasToken, token, 1000);

  //       // admin update gas fee amount per transfer
  //       await factory.setFeeAmountPerTransfer(200);

  //       // host transfer 4 nites then the fee is 3 * 200 = 600
  //       let tx = await token
  //         .connect(factoryOperator)
  //         [
  //           'safeBulkTransferFrom(address,address,uint256,uint256)'
  //         ](host.address, to.address, firstTokenId, firstTokenId + 2n);

  //       await expect(tx).changeTokenBalances(token, [host, to], [0, 3]);
  //       await expect(tx).changeTokenBalances(gasToken, [token, treasury], [-600, 600]);

  //       // host transfer a nite token then the fee is 200
  //       tx = await token
  //         .connect(host)
  //         ['safeTransferFrom(address,address,uint256)'](host.address, to.address, secondTokenId);

  //       await expect(tx).changeTokenBalances(token, [host, to], [0, 1]);
  //       await expect(tx).changeTokenBalances(gasToken, [token, treasury], [-200, 200]);

  //       // host unpauses transfers
  //       await token.connect(host).unpause();

  //       // holder transfer 2 nite tokens then the fee is 2 * 200 = 400
  //       await gasToken.mint(to.address, 400);
  //       await gasToken.connect(to).approve(await token.getAddress(), 400);

  //       tx = await token
  //         .connect(to)
  //         [
  //           'safeBulkTransferFrom(address,address,uint256,uint256)'
  //         ](to.address, factoryOperator.address, firstTokenId, firstTokenId + 1n);

  //       await expect(tx).changeTokenBalances(gasToken, [token, to], [0, -400]);
  //     });

  //     it('revert when token owner balance is insufficient', async () => {
  //       const { token, host, treasury, factoryOperator, otherAccounts, gasToken, factory } =
  //         await loadFixture(deployPropertyFixture);

  //       const to = otherAccounts[0];

  //       // deposit gas tokens to nite contract
  //       await expect(gasToken.mint(await token.getAddress(), 1000)).changeTokenBalance(gasToken, token, 1000);

  //       // admin update gas fee amount per transfer
  //       await factory.setFeeAmountPerTransfer(200);

  //       // host transfer 4 nites then the fee is 3 * 200 = 600
  //       let tx = await token
  //         .connect(factoryOperator)
  //         [
  //           'safeBulkTransferFrom(address,address,uint256,uint256)'
  //         ](host.address, to.address, firstTokenId, firstTokenId + 2n);

  //       await expect(tx).changeTokenBalances(token, [host, to], [0, 3]);
  //       await expect(tx).changeTokenBalances(gasToken, [token, treasury], [-600, 600]);

  //       // host transfer a nite token then the fee is 200
  //       tx = await token
  //         .connect(host)
  //         ['safeTransferFrom(address,address,uint256)'](host.address, to.address, secondTokenId);

  //       await expect(tx).changeTokenBalances(token, [host, to], [0, 1]);
  //       await expect(tx).changeTokenBalances(gasToken, [token, treasury], [-200, 200]);

  //       // host unpauses transfers
  //       await token.connect(host).unpause();

  //       // holder transfer 2 nite tokens then the fee is 2 * 200 = 400
  //       await gasToken.mint(to.address, 300);
  //       await gasToken.connect(to).approve(await token.getAddress(), 400);

  //       await expect(
  //         token
  //           .connect(to)
  //           [
  //             'safeBulkTransferFrom(address,address,uint256,uint256)'
  //           ](to.address, factoryOperator.address, firstTokenId, firstTokenId + 1n),
  //       ).revertedWithCustomError(gasToken, 'ERC20InsufficientBalance');
  //     });
  //   });
  // });

  // describe('Integrate booking data', () => {
  //   describe('create booking data', () => {
  //     describe('single transfer', () => {
  //       it('create a new booking with no data', async () => {
  //         const { token, host, treasury, otherAccounts, gasToken, factory } = await loadFixture(deployPropertyFixture);

  //         const to = otherAccounts[0];

  //         // deposit gas tokens to nite contract
  //         await expect(gasToken.mint(await token.getAddress(), 1000)).changeTokenBalance(gasToken, token, 1000);

  //         // admin update gas fee amount per transfer
  //         await factory.setFeeAmountPerTransfer(200);

  //         // host transfer a nite then the fee is 200
  //         const tx = await token
  //           .connect(host)
  //           ['safeTransferFrom(address,address,uint256)'](host.address, to.address, firstTokenId);

  //         await expect(tx).changeTokenBalances(token, [host, to], [0, 1]);
  //         await expect(tx).changeTokenBalances(gasToken, [token, treasury], [-200, 200]);

  //         // check new booking data
  //         const bookingId = 1;
  //         expect(await token.bookingIds(firstTokenId)).deep.equal(bookingId);

  //         expect((await token.bookings(bookingId)).checkIn).deep.equal(firstTokenId);
  //         expect((await token.bookings(bookingId)).checkOut).deep.equal(firstTokenId);
  //         expect((await token.bookings(bookingId)).data).deep.equal('0x');
  //       });

  //       it('create a new booking with data', async () => {
  //         const { token, host, treasury, otherAccounts, gasToken, factory } = await loadFixture(deployPropertyFixture);

  //         const to = otherAccounts[0];
  //         const data = '0x42';

  //         // deposit gas tokens to nite contract
  //         await expect(gasToken.mint(await token.getAddress(), 1000)).changeTokenBalance(gasToken, token, 1000);

  //         // admin update gas fee amount per transfer
  //         await factory.setFeeAmountPerTransfer(200);

  //         // host transfer a nite then the fee is 200
  //         const tx = await token
  //           .connect(host)
  //           ['safeTransferFrom(address,address,uint256,bytes)'](host.address, to.address, firstTokenId, data);

  //         await expect(tx).changeTokenBalances(token, [host, to], [0, 1]);
  //         await expect(tx).changeTokenBalances(gasToken, [token, treasury], [-200, 200]);

  //         // check new booking data
  //         const bookingId = 1;
  //         expect(await token.bookingIds(firstTokenId)).deep.equal(bookingId);

  //         expect((await token.bookings(bookingId)).checkIn).deep.equal(firstTokenId);
  //         expect((await token.bookings(bookingId)).checkOut).deep.equal(firstTokenId);
  //         expect((await token.bookings(bookingId)).data).deep.equal('0x42');
  //       });
  //     });

  //     describe('bulk transfer', () => {
  //       it('create a new booking with no data', async () => {
  //         const { token, host, treasury, otherAccounts, gasToken, factory } = await loadFixture(deployPropertyFixture);

  //         const to = otherAccounts[0];
  //         const fromId = firstTokenId;
  //         const toId = fromId + 2n;

  //         // deposit gas tokens to nite contract
  //         await expect(gasToken.mint(await token.getAddress(), 1000)).changeTokenBalance(gasToken, token, 1000);

  //         // admin update gas fee amount per transfer
  //         await factory.setFeeAmountPerTransfer(200);

  //         // host transfer 4 nites then the fee is 3 * 200 = 600
  //         const tx = await token
  //           .connect(host)
  //           ['safeBulkTransferFrom(address,address,uint256,uint256)'](host.address, to.address, fromId, toId);

  //         await expect(tx).changeTokenBalances(token, [host, to], [0, 3]);
  //         await expect(tx).changeTokenBalances(gasToken, [token, treasury], [-600, 600]);

  //         // check new booking data
  //         const bookingId = 1;
  //         for (let i = fromId; i <= toId; i++) {
  //           expect(await token.bookingIds(i)).deep.equal(bookingId);
  //         }
  //         expect((await token.bookings(bookingId)).checkIn).deep.equal(fromId);
  //         expect((await token.bookings(bookingId)).checkOut).deep.equal(toId);
  //         expect((await token.bookings(bookingId)).data).deep.equal('0x');
  //       });

  //       it('create a new booking with data', async () => {
  //         const { token, host, treasury, otherAccounts, gasToken, factory } = await loadFixture(deployPropertyFixture);

  //         const to = otherAccounts[0];
  //         const fromId = firstTokenId;
  //         const toId = fromId + 2n;
  //         const data = '0x42';

  //         // deposit gas tokens to nite contract
  //         await expect(gasToken.mint(await token.getAddress(), 1000)).changeTokenBalance(gasToken, token, 1000);

  //         // admin update gas fee amount per transfer
  //         await factory.setFeeAmountPerTransfer(200);

  //         // host transfer 4 nites then the fee is 3 * 200 = 600
  //         const tx = await token
  //           .connect(host)
  //           [
  //             'safeBulkTransferFrom(address,address,uint256,uint256,bytes)'
  //           ](host.address, to.address, fromId, toId, data);

  //         await expect(tx).changeTokenBalances(token, [host, to], [0, 3]);
  //         await expect(tx).changeTokenBalances(gasToken, [token, treasury], [-600, 600]);

  //         // check new booking data
  //         const bookingId = 1;
  //         for (let i = fromId; i <= toId; i++) {
  //           expect(await token.bookingIds(i)).deep.equal(bookingId);
  //         }
  //         expect((await token.bookings(bookingId)).checkIn).deep.equal(fromId);
  //         expect((await token.bookings(bookingId)).checkOut).deep.equal(toId);
  //       });
  //     });
  //   });

  //   describe('delete booking data', () => {
  //     describe('single transfer', () => {
  //       it('delete booking data if transfer token to zero address', async () => {
  //         const { token, host, otherAccounts, gasToken } = await loadFixture(deployPropertyFixture);

  //         const to = otherAccounts[0];
  //         const data = '0x42';

  //         // deposit gas tokens to nite contract
  //         await expect(gasToken.mint(await token.getAddress(), 1000)).changeTokenBalance(gasToken, token, 1000);

  //         // host transfer a nite
  //         const tx = await token
  //           .connect(host)
  //           ['safeTransferFrom(address,address,uint256,bytes)'](host.address, to.address, firstTokenId, data);

  //         await expect(tx).changeTokenBalances(token, [host, to], [0, 1]);

  //         // check new booking data
  //         const bookingId = 1;
  //         expect(await token.bookingIds(firstTokenId)).deep.equal(bookingId);

  //         expect((await token.bookings(bookingId)).checkIn).deep.equal(firstTokenId);
  //         expect((await token.bookings(bookingId)).checkOut).deep.equal(firstTokenId);
  //         expect((await token.bookings(bookingId)).data).deep.equal('0x42');

  //         // host unpause transferring
  //         await token.connect(host).unpause();

  //         // owner transfers token to zero address to delete booking
  //         await expect(
  //           token.connect(to)['safeTransferFrom(address,address,uint256)'](to.address, ZeroAddress, firstTokenId),
  //         ).changeTokenBalance(token, to, -1);

  //         // check booking data
  //         expect(await token.bookingIds(firstTokenId)).deep.equal(0);

  //         expect((await token.bookings(bookingId)).checkIn).deep.equal(0);
  //         expect((await token.bookings(bookingId)).checkOut).deep.equal(0);
  //         expect((await token.bookings(bookingId)).data).deep.equal('0x');
  //       });
  //     });

  //     describe('bulk transfer', () => {
  //       it('delete booking data if transfer tokens to zero address', async () => {
  //         const { token, host, otherAccounts, gasToken } = await loadFixture(deployPropertyFixture);

  //         const to = otherAccounts[0];
  //         const fromId = firstTokenId;
  //         const toId = fromId + 2n;
  //         const data = '0x42';

  //         // deposit gas tokens to nite contract
  //         await expect(gasToken.mint(await token.getAddress(), 1000)).changeTokenBalance(gasToken, token, 1000);

  //         // host unpause transferring
  //         await token.connect(host).unpause();

  //         // host transfer 4 nites
  //         const tx = await token
  //           .connect(host)
  //           [
  //             'safeBulkTransferFrom(address,address,uint256,uint256,bytes)'
  //           ](host.address, to.address, fromId, toId, data);

  //         await expect(tx).changeTokenBalances(token, [host, to], [0, 3]);

  //         // check new booking data
  //         const bookingId = 1;
  //         for (let i = fromId; i <= toId; i++) {
  //           expect(await token.bookingIds(i)).deep.equal(bookingId);
  //         }
  //         expect((await token.bookings(bookingId)).checkIn).deep.equal(fromId);
  //         expect((await token.bookings(bookingId)).checkOut).deep.equal(toId);

  //         // owner transfers token to zero address to delete booking
  //         await expect(
  //           token
  //             .connect(to)
  //             [
  //               'safeBulkTransferFrom(address,address,uint256,uint256,bytes)'
  //             ](to.address, ZeroAddress, fromId, toId, toUtf8Bytes('CancelBooking')),
  //         ).changeTokenBalance(token, to, -3);

  //         // check booking data
  //         for (let i = fromId; i <= toId; i++) {
  //           expect(await token.bookingIds(i)).deep.equal(0);
  //         }

  //         expect((await token.bookings(bookingId)).checkIn).deep.equal(0);
  //         expect((await token.bookings(bookingId)).checkOut).deep.equal(0);
  //         expect((await token.bookings(bookingId)).data).deep.equal('0x');
  //       });
  //     });

  //     describe('revert cases', () => {
  //       it('revert if bookingIds from check-in and check-out dont match', async () => {
  //         const { token, host, otherAccounts } = await loadFixture(deployPropertyFixture);

  //         const to = otherAccounts[0];
  //         const fromId = firstTokenId;
  //         const toId = fromId + 2n;
  //         const data = '0x42';

  //         // host transfer 4 nites
  //         let tx = await token
  //           .connect(host)
  //           [
  //             'safeBulkTransferFrom(address,address,uint256,uint256,bytes)'
  //           ](host.address, to.address, fromId, toId, data);

  //         await expect(tx).changeTokenBalances(token, [host, to], [0, 3]);

  //         // host unpauses transferring
  //         await token.connect(host).unpause();

  //         // check new booking data
  //         let bookingId = 1;
  //         for (let i = fromId; i <= toId; i++) {
  //           expect(await token.bookingIds(i)).deep.equal(bookingId);
  //         }
  //         expect((await token.bookings(bookingId)).checkIn).deep.equal(fromId);
  //         expect((await token.bookings(bookingId)).checkOut).deep.equal(toId);

  //         // host transfer a nite
  //         tx = await token
  //           .connect(host)
  //           ['safeTransferFrom(address,address,uint256,bytes)'](host.address, to.address, toId + 5n, data);

  //         await expect(tx).changeTokenBalances(token, [host, to], [0, 1]);

  //         // check new booking data
  //         bookingId = 2;
  //         expect(await token.bookingIds(toId + 5n)).deep.equal(bookingId);

  //         expect((await token.bookings(bookingId)).checkIn).deep.equal(toId + 5n);
  //         expect((await token.bookings(bookingId)).checkOut).deep.equal(toId + 5n);
  //         expect((await token.bookings(bookingId)).data).deep.equal('0x42');

  //         await expect(
  //           token
  //             .connect(to)
  //             ['safeBulkTransferFrom(address,address,uint256,uint256)'](to, ZeroAddress, fromId, toId + 5n),
  //         ).revertedWithCustomError(token, 'MismatchedBookingIds');
  //       });

  //       it('revert if toId is not checkoutTokenId', async () => {
  //         const { token, host, otherAccounts } = await loadFixture(deployPropertyFixture);

  //         const to = otherAccounts[0];
  //         const fromId = firstTokenId;
  //         const toId = fromId + 2n;
  //         const data = '0x42';

  //         // host transfer 4 nites
  //         const tx = await token
  //           .connect(host)
  //           [
  //             'safeBulkTransferFrom(address,address,uint256,uint256,bytes)'
  //           ](host.address, to.address, fromId, toId, data);

  //         await expect(tx).changeTokenBalances(token, [host, to], [0, 3]);

  //         // host unpauses transferring
  //         await token.connect(host).unpause();

  //         // check new booking data
  //         const bookingId = 1;
  //         for (let i = fromId; i <= toId; i++) {
  //           expect(await token.bookingIds(i)).deep.equal(bookingId);
  //         }
  //         expect((await token.bookings(bookingId)).checkIn).deep.equal(fromId);
  //         expect((await token.bookings(bookingId)).checkOut).deep.equal(toId);

  //         await expect(
  //           token
  //             .connect(to)
  //             ['safeBulkTransferFrom(address,address,uint256,uint256)'](to, ZeroAddress, fromId, fromId + 1n),
  //         ).revertedWithCustomError(token, 'InvalidCheckoutTokenId');
  //       });
  //     });
  //   });
  // });
});
