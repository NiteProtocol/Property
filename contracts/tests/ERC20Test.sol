// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ERC20Test is ERC20 {
    constructor(
        string memory _name,
        string memory _symbol
    )
        ERC20(_name, _symbol) // solhint-disable-next-line
    {}

    function mint(address _to, uint256 _amount) external {
        _mint(_to, _amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function approve(address spender, uint256 value) public override returns (bool) {
        address owner = _msgSender();
        _approve(owner, spender, value);
        return true;
    }
}
