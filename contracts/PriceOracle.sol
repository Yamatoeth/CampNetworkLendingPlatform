// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PriceOracle - Oracle de prix simple
 */
contract PriceOracle is Ownable {
    mapping(address => uint256) public prices;
    
    event PriceUpdated(address indexed asset, uint256 price);
    
    function setPrice(address asset, uint256 price) external onlyOwner {
        prices[asset] = price;
        emit PriceUpdated(asset, price);
    }
    
    function getPrice(address asset) external view returns (uint256) {
        return prices[asset];
    }
}
