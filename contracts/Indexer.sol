// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.29;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IProperty} from "./interfaces/IProperty.sol";
import {IIndexer} from "./interfaces/IIndexer.sol";
import {PropertyInfo} from "./PropertyInfo.sol";

contract Indexer is IIndexer, Ownable {
    IERC20 public immutable TRVL;
    address[] public properties;
    string[] public regions;
    mapping(string => address[]) public m_regionToProperties; // maps each region and each city to an array of property contract addresses in that city in that region
    mapping(string => bool) public m_regionExists; // maps each region to a boolean indicating whether it exists

    constructor(address _trvlAddress) Ownable(msg.sender) {
        TRVL = IERC20(_trvlAddress);
    }

    function add(string calldata _region, address _property) external onlyOwner {
        if (!m_regionExists[_region]) { // Add region, if necessary
            m_regionExists[_region] = true;
            regions.push(_region);
        }
        m_regionToProperties[_region].push(_property);
    }

    function propertyInfos(uint256 start, uint256 end) external view returns (PropertyInfo[] memory) {
        return propertyInfos(properties, start, end);
    }

    function propertyInfosFromRegion(string calldata _region, uint256 start, uint256 end) external view returns (PropertyInfo[] memory) {
        return propertyInfos(m_regionToProperties[_region], start, end);
    }

    function propertyInfos(address[] memory props, uint256 start, uint256 end) internal view returns (PropertyInfo[] memory) {
        if (start >= end) revert EndLessThanStart();
        uint256 e = (props.length >= end ? end : props.length);
        PropertyInfo[] memory r = new PropertyInfo[](e - start);
        for (uint256 i = start; i < e; i++) { r[i-start] = IProperty(props[i]).getPropertyInfo(); }
        return r;
    }
    
    // If property i has more TRVL staked than property j, moves property i to the left until it reaches j.
    function swap(uint256 i, uint256 j) public {
        if (i <= j) revert JGreaterThanI(); // i must be greater than j
        if (i >= properties.length) revert OutOfBounds(); // i must be less than the length of properties
        if ( TRVL.balanceOf(properties[j]) > TRVL.balanceOf(properties[j])) {
            for (uint256 k = i - 1; k >= j; k--) {
                address temp = properties[k];
                properties[k] = properties[k+1];
                properties[k+1] = temp;
            }       
        }
    }
}
