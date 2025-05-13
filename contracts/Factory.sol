// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {IFactory} from "./interfaces/IFactory.sol";
import {Property} from "./Property.sol";

contract Factory is IFactory, Ownable {
    bytes32 public constant VERSION = keccak256("BOOKING_V5");
    address public operator; // address of operator who could be approved by host to transfer Nite tokens
    address public immutable TRVL;

    uint256 public feeAmountPerTransfer; // fee in TRVL per Nite token transfer
    mapping(address => mapping(uint256 => address)) public propertyContract; // (host => slot => nite contract)

    constructor(address _operator, address _tokenAddress, uint256 _feeAmount) Ownable(msg.sender) {
        if (_operator == address(0) || _tokenAddress == address(0)) { revert ZeroAddress(); }
        operator = _operator;
        TRVL = _tokenAddress;
        feeAmountPerTransfer = _feeAmount;
    }

    function setOperator(address _addr) external onlyOwner {
        operator = _addr;
        emit NewOperator(_addr);
    }

    function setFeeAmountPerTransfer(uint256 _feeAmount) external onlyOwner {
        feeAmountPerTransfer = _feeAmount;
        emit NewFeeAmountPerTransfer(_feeAmount);
    }

    function createPropertyContract(
        uint256 _slot, // for hosts with multiple property contracts.
        address _host, string calldata _name, string calldata _symbol, string calldata _uri
    ) external returns (address _propertyContract) {
        if (propertyContract[_host][_slot] != address(0)) { revert TokenDeployedAlready(); }
        bytes32 salt = keccak256(abi.encodePacked(_host, _slot, VERSION));
        bytes memory bytecode = abi.encodePacked(type(Property).creationCode, abi.encode(_host, operator, address(this), _name, _symbol, _uri));
        _propertyContract = Create2.deploy(0, salt, bytecode);
        propertyContract[_host][_slot] = _propertyContract;
        emit NewPropertyContract(_slot, _propertyContract, _host);
    }

    function getTRVLAddress() public view returns (address) {
        return TRVL;
    }
}
