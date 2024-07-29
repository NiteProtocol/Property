import { task } from 'hardhat/config';

import getAccounts from './tasks/getAccounts';
import setGasFeeRatio from './tasks/setGasFeeRatio';

task('accounts', 'Prints the list of accounts').setAction(getAccounts);

task('set-gas-fee', 'Set TRVL gas fee for Nite token transfers')
  .addParam('factory', 'The address of factory contract')
  .addParam('fee', 'The fee numerator')
  .setAction(setGasFeeRatio);
