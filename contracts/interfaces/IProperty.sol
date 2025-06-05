// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.29;

import {PropertyInfo} from "../PropertyInfo.sol";

interface IProperty {
    function getPropertyInfo() external view returns (PropertyInfo memory);
}
