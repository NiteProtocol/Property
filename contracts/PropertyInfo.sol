// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.29;

struct PropertyInfo {
    address property; // address of the property contract
    address host; // address of the host
    string name; // name of the property
    string symbol; // symbol of the property
    string region; // region where the property is located
    string url; // URL to the property's website
    uint256 baseRate; // base rate of the property
    uint256 maxGuests; // maximum number of guests allowed in a booking
    uint256 stakedTRVL; // amount of TRVL staked in the property
    uint256 tokenPrice; // price of the property token in TRVL
    uint256 nightsBooked; // total number of nights booked in the property
}