// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.29;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IFactory} from "./interfaces/IFactory.sol";
import {Property} from "./Property.sol";

contract Factory is IFactory, Ownable {
    bytes32 public constant VERSION = keccak256("BOOKING_V5");
    IERC20 public immutable TRVL;

    uint256 public feeAmountPerTransfer; // fee in TRVL per Nite token transfer

    mapping(address => mapping(uint256 => address)) public propertyContract; // (host => slot => property)

    constructor(address _trvl, uint256 _feeAmount) Ownable(msg.sender) {
        if (_trvl == address(0)) { revert ZeroAddress(); }
        TRVL = IERC20(_trvl);
        feeAmountPerTransfer = _feeAmount;
        indexer = IIndexer(new Indexer(_trvl));
    }

    function setFeeAmountPerTransfer(uint256 _feeAmount) external onlyOwner {
        feeAmountPerTransfer = _feeAmount;
        emit NewFeeAmountPerTransfer(_feeAmount);
    }

    function createPropertyContract(
        uint256 _slot, // for hosts with multiple property contracts.
        address _host, string calldata _name, string calldata _symbol,
        string calldata _region
    ) external returns (address _property) {
        if (propertyContract[_host][_slot] != address(0)) { revert TokenDeployedAlready(); }
        bytes32 salt = keccak256(abi.encodePacked(_host, _slot, VERSION));
        bytes memory bytecode = abi.encodePacked(type(Property).creationCode, abi.encode(_host, address(this), _name, _symbol, _region));
        _property = Create2.deploy(0, salt, bytecode);
        propertyContract[_host][_slot] = _property;
        emit NewPropertyContract(_slot, _property, _host);
        indexer.add(_region, _property);
    }

    function getTRVLAddress() public view returns (address) {
        return address(TRVL);
    }
}
