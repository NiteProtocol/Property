// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.29;

interface IFactory {
    function feeAmountPerTransfer() external returns (uint256);
    function propertyContract(address, uint256) external returns (address);
    function setOperator(address _addr) external;
    function setFeeAmountPerTransfer(uint256 _feeAmount) external;
    function getTRVLAddress() external view returns (address);
    function createPropertyContract(uint256 _slot, address _host, 
      string calldata _name, string calldata _symbol, string calldata _uri
    ) external returns (address _nft);

    event NewOperator(address indexed newOperator);
    event NewFeeAmountPerTransfer(uint256 feeNumerator);
    event NewPropertyContract(uint256 indexed slot, address indexed niteContract, address indexed host);

    error ZeroAddress();
    error TokenDeployedAlready();
}
