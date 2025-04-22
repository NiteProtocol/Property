// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IOwnedToken} from "./interfaces/IOwnedToken.sol";

contract OwnedToken is IOwnedToken, ERC20, Ownable {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) Ownable(msg.sender) { }

    function mint(address to, uint256 value) external onlyOwner() { _mint(to, value); }
    function burn(address from, uint256 value) external onlyOwner() { _burn(from, value); }
}
