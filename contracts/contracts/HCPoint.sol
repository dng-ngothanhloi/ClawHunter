// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
contract HCPoint is ERC20, Ownable {
    constructor(address owner_) ERC20("Hunter Coin Point", "HCP") Ownable(owner_) {}
    function mint(address to, uint256 amt) external onlyOwner { _mint(to, amt); }
    function burn(address from, uint256 amt) external onlyOwner { _burn(from, amt); }
}
