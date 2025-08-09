// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./PriceOracle.sol";
import "./CToken.sol";

/**
 * @title Comptroller - Contrôleur principal de la plateforme
 */
contract Comptroller is Ownable {
    using SafeMath for uint256;
    
    struct Market {
        bool isListed;
        uint256 collateralFactorMantissa;
        uint256 liquidationThresholdMantissa;
        bool borrowEnabled; // Nouveau: contrôle si on peut emprunter ce token
        mapping(address => bool) accountMembership;
    }
    
    mapping(address => Market) public markets;
    mapping(address => address[]) public accountAssets;
    
    PriceOracle public oracle;
    uint256 public liquidationIncentiveMantissa = 1.1e18; // 10% bonus
    uint256 public closeFactor = 0.5e18; // 50% max liquidation
    
    event MarketListed(address indexed cToken, bool borrowEnabled);
    event MarketEntered(address indexed cToken, address indexed account);
    event MarketExited(address indexed cToken, address indexed account);
    event BorrowEnabledUpdated(address indexed cToken, bool enabled);
    
    constructor(address _oracle) {
        oracle = PriceOracle(_oracle);
    }
    
    function listMarket(
        address cToken, 
        uint256 collateralFactor, 
        uint256 liquidationThreshold,
        bool borrowEnabled
    ) external onlyOwner {
        require(!markets[cToken].isListed, "Market already listed");
        require(collateralFactor <= 0.9e18, "Collateral factor too high");
        require(liquidationThreshold <= 0.95e18, "Liquidation threshold too high");
        
        markets[cToken].isListed = true;
        markets[cToken].collateralFactorMantissa = collateralFactor;
        markets[cToken].liquidationThresholdMantissa = liquidationThreshold;
        markets[cToken].borrowEnabled = borrowEnabled;
        
        emit MarketListed(cToken, borrowEnabled);
    }
    
    function setBorrowEnabled(address cToken, bool enabled) external onlyOwner {
        require(markets[cToken].isListed, "Market not listed");
        markets[cToken].borrowEnabled = enabled;
        emit BorrowEnabledUpdated(cToken, enabled);
    }
    
    function isBorrowEnabled(address cToken) external view returns (bool) {
        return markets[cToken].borrowEnabled;
    }
    
    function enterMarkets(address[] calldata cTokens) external {
        for (uint i = 0; i < cTokens.length; i++) {
            enterMarket(cTokens[i], msg.sender);
        }
    }
    
    function enterMarket(address cToken, address account) internal {
        require(markets[cToken].isListed, "Market not listed");
        
        if (markets[cToken].accountMembership[account]) {
            return;
        }
        
        markets[cToken].accountMembership[account] = true;
        accountAssets[account].push(cToken);
        
        emit MarketEntered(cToken, account);
    }
    
    function exitMarket(address cToken) external {
        require(markets[cToken].accountMembership[msg.sender], "Not in market");
        
        // Vérifier que l'utilisateur peut sortir du marché
        (uint256 liquidity, uint256 shortfall) = getAccountLiquidity(msg.sender);
        require(shortfall == 0, "Insufficient liquidity");
        
        markets[cToken].accountMembership[msg.sender] = false;
        
        // Retirer de la liste des actifs
        address[] storage userAssets = accountAssets[msg.sender];
        for (uint i = 0; i < userAssets.length; i++) {
            if (userAssets[i] == cToken) {
                userAssets[i] = userAssets[userAssets.length - 1];
                userAssets.pop();
                break;
            }
        }
        
        emit MarketExited(cToken, msg.sender);
    }
    
    function getAccountLiquidity(address account) public view returns (uint256, uint256) {
        (uint256 liquidity, uint256 shortfall) = getHypotheticalAccountLiquidity(account, address(0), 0, 0);
        return (liquidity, shortfall);
    }
    
    function getHypotheticalAccountLiquidity(
        address account,
        address cTokenModify,
        uint256 redeemTokens,
        uint256 borrowAmount
    ) public view returns (uint256, uint256) {
        uint256 sumCollateral;
        uint256 sumBorrowPlusEffects;
        
        address[] memory assets = accountAssets[account];
        for (uint i = 0; i < assets.length; i++) {
            address asset = assets[i];
            CToken cToken = CToken(asset);
            
            uint256 tokenBalance = cToken.balanceOf(account);
            uint256 borrowBalance = cToken.borrowBalanceStored(account);
            uint256 exchangeRate = cToken.exchangeRate();
            uint256 oraclePrice = oracle.getPrice(address(cToken.underlying()));
            
            uint256 collateralFactor = markets[asset].collateralFactorMantissa;
            
            // Calculer la valeur du collatéral
            uint256 collateralValue = tokenBalance.mul(exchangeRate).mul(oraclePrice).mul(collateralFactor).div(1e54);
            sumCollateral = sumCollateral.add(collateralValue);
            
            // Calculer la valeur des emprunts
            uint256 borrowValue = borrowBalance.mul(oraclePrice).div(1e18);
            sumBorrowPlusEffects = sumBorrowPlusEffects.add(borrowValue);
            
            // Appliquer les effets hypothétiques
            if (asset == cTokenModify) {
                if (redeemTokens > 0) {
                    uint256 redeemValue = redeemTokens.mul(exchangeRate).mul(oraclePrice).mul(collateralFactor).div(1e54);
                    sumCollateral = sumCollateral.sub(redeemValue);
                }
                if (borrowAmount > 0) {
                    uint256 borrowValue = borrowAmount.mul(oraclePrice).div(1e18);
                    sumBorrowPlusEffects = sumBorrowPlusEffects.add(borrowValue);
                }
            }
        }
        
        if (sumCollateral > sumBorrowPlusEffects) {
            return (sumCollateral - sumBorrowPlusEffects, 0);
        } else {
            return (0, sumBorrowPlusEffects - sumCollateral);
        }
    }
    
    function borrowAllowed(address cToken, address borrower, uint256 borrowAmount) external view returns (bool) {
        require(markets[cToken].isListed, "Market not listed");
        
        // Vérifier si l'emprunt est activé pour ce token
        if (!markets[cToken].borrowEnabled) {
            return false;
        }
        
        if (!markets[cToken].accountMembership[borrower]) {
            return false;
        }
        
        (uint256 liquidity, uint256 shortfall) = getHypotheticalAccountLiquidity(borrower, cToken, 0, borrowAmount);
        return shortfall == 0;
    }
    
    function liquidateCalculateSeizeTokens(
        address cTokenBorrowed,
        address cTokenCollateral,
        uint256 repayAmount
    ) external view returns (uint256) {
        uint256 priceBorrowed = oracle.getPrice(address(CToken(cTokenBorrowed).underlying()));
        uint256 priceCollateral = oracle.getPrice(address(CToken(cTokenCollateral).underlying()));
        uint256 exchangeRate = CToken(cTokenCollateral).exchangeRate();
        
        uint256 seizeAmount = repayAmount.mul(liquidationIncentiveMantissa).mul(priceBorrowed).div(priceCollateral).div(1e18);
        return seizeAmount.mul(1e18).div(exchangeRate);
    }
}
