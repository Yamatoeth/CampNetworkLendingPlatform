// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./Comptroller.sol";
import "./CToken.sol";

/**
 * @title CampLend - Contrat principal
 * @author Simon
 * @notice Contrat principal gérant les dépôts, emprunts et liquidations
 */
contract CampLend is ReentrancyGuard, Pausable, Ownable {
    using SafeMath for uint256;
    
    Comptroller public comptroller;
    mapping(address => address) public cTokens; // underlying => cToken
    address[] public allMarkets;
    
    event MarketCreated(address indexed underlying, address indexed cToken);
    event Liquidation(address indexed liquidator, address indexed borrower, uint256 repayAmount, address indexed cTokenCollateral, uint256 seizeTokens);
    
    constructor(address _comptroller) {
        comptroller = Comptroller(_comptroller);
    }
    
    function createMarket(
        address underlying,
        string memory name,
        string memory symbol,
        uint256 collateralFactor,
        uint256 liquidationThreshold
    ) external onlyOwner {
        require(cTokens[underlying] == address(0), "Market already exists");
        
        CToken cToken = new CToken(IERC20(underlying), name, symbol);
        cTokens[underlying] = address(cToken);
        allMarkets.push(address(cToken));
        
        // Utiliser le nouveau comptroller avec support borrow conditionnel
        // Par défaut, borrowEnabled = false (sera configuré séparément)
        comptroller.listMarket(address(cToken), collateralFactor, liquidationThreshold, false);
        
        emit MarketCreated(underlying, address(cToken));
    }
    
    function supply(address underlying, uint256 amount) external nonReentrant whenNotPaused {
        address cToken = cTokens[underlying];
        require(cToken != address(0), "Market not supported");
        
        CToken(cToken).mint(amount);
    }
    
    function withdraw(address underlying, uint256 amount) external nonReentrant whenNotPaused {
        address cToken = cTokens[underlying];
        require(cToken != address(0), "Market not supported");
        
        CToken(cToken).redeem(amount);
    }
    
    function borrow(address underlying, uint256 amount) external nonReentrant whenNotPaused {
        address cToken = cTokens[underlying];
        require(cToken != address(0), "Market not supported");
        require(comptroller.borrowAllowed(cToken, msg.sender, amount), "Borrow not allowed");
        
        CToken(cToken).borrow(amount);
    }
    
    function repay(address underlying, uint256 amount) external nonReentrant whenNotPaused {
        address cToken = cTokens[underlying];
        require(cToken != address(0), "Market not supported");
        
        CToken(cToken).repayBorrow(amount);
    }
    
    function liquidate(
        address borrower,
        address underlyingBorrowed,
        uint256 repayAmount,
        address underlyingCollateral
    ) external nonReentrant whenNotPaused {
        address cTokenBorrowed = cTokens[underlyingBorrowed];
        address cTokenCollateral = cTokens[underlyingCollateral];
        
        require(cTokenBorrowed != address(0) && cTokenCollateral != address(0), "Market not supported");
        
        // Vérifier que le compte peut être liquidé
        (uint256 liquidity, uint256 shortfall) = comptroller.getAccountLiquidity(borrower);
        require(shortfall > 0, "Account not liquidatable");
        
        // Calculer les tokens à saisir
        uint256 seizeTokens = comptroller.liquidateCalculateSeizeTokens(
            cTokenBorrowed,
            cTokenCollateral,
            repayAmount
        );
        
        // Rembourser la dette
        CToken(cTokenBorrowed).repayBorrowBehalf(borrower, repayAmount);
        
        // Saisir le collatéral
        CToken(cTokenCollateral).transfer(msg.sender, seizeTokens);
        
        emit Liquidation(msg.sender, borrower, repayAmount, cTokenCollateral, seizeTokens);
    }
    
    function getAllMarkets() external view returns (address[] memory) {
        return allMarkets;
    }
    
    function getAccountSnapshot(address account, address underlying) external view returns (
        uint256 cTokenBalance,
        uint256 borrowBalance,
        uint256 exchangeRate
    ) {
        address cToken = cTokens[underlying];
        if (cToken == address(0)) {
            return (0, 0, 0);
        }
        
        CToken market = CToken(cToken);
        return (
            market.balanceOf(account),
            market.borrowBalanceStored(account),
            market.exchangeRate()
        );
    }
    
    // Fonctions d'urgence
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
}
