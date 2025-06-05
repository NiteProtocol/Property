// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.29;

interface IIndexer {
  function add(string calldata _region, address _property) external;

  error EndLessThanStart();
  error JGreaterThanI();
  error OutOfBounds();
}
