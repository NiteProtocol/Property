// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.29;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IOwnedToken is IERC20 {
    function mint(address to, uint256 value) external;
    function burn(address from, uint256 value) external;
}
