// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

// Token de récompense cToken (représente les parts de dépôt)
contract CToken is ERC20, Ownable {
    using SafeMath for uint256;
    
    IERC20 public immutable underlying;
    uint256 public exchangeRate = 1e18; // Taux de change initial 1:1
    uint256 public totalBorrows;
    uint256 public borrowIndex = 1e18;
    uint256 public accrualBlockNumber;
    uint256 public reserveFactor = 0.1e18; // 10% de réserve
    
    struct BorrowSnapshot {
        uint256 principal;
        uint256 interestIndex;
    }
    
    mapping(address => BorrowSnapshot) public accountBorrows;
    
    event Mint(address indexed minter, uint256 mintAmount, uint256 mintTokens);
    event Redeem(address indexed redeemer, uint256 redeemAmount, uint256 redeemTokens);
    event Borrow(address indexed borrower, uint256 borrowAmount, uint256 accountBorrows, uint256 totalBorrows);
    event RepayBorrow(address indexed payer, address indexed borrower, uint256 repayAmount, uint256 accountBorrows, uint256 totalBorrows);
    
    constructor(
        IERC20 _underlying,
        string memory _name,
        string memory _symbol
    ) ERC20(_name, _symbol) {
        underlying = _underlying;
        accrualBlockNumber = block.number;
    }
    
    function mint(uint256 mintAmount) external returns (uint256) {
        require(mintAmount > 0, "Amount must be > 0");
        
        accrueInterest();
        
        uint256 mintTokens = mintAmount.mul(1e18).div(exchangeRate);
        
        require(underlying.transferFrom(msg.sender, address(this), mintAmount), "Transfer failed");
        
        _mint(msg.sender, mintTokens);
        
        updateExchangeRate();
        
        emit Mint(msg.sender, mintAmount, mintTokens);
        return mintTokens;
    }
    
    function redeem(uint256 redeemTokens) external returns (uint256) {
        require(redeemTokens > 0, "Amount must be > 0");
        require(balanceOf(msg.sender) >= redeemTokens, "Insufficient balance");
        
        accrueInterest();
        
        uint256 redeemAmount = redeemTokens.mul(exchangeRate).div(1e18);
        
        require(underlying.balanceOf(address(this)) >= redeemAmount, "Insufficient cash");
        
        _burn(msg.sender, redeemTokens);
        require(underlying.transfer(msg.sender, redeemAmount), "Transfer failed");
        
        updateExchangeRate();
        
        emit Redeem(msg.sender, redeemAmount, redeemTokens);
        return redeemAmount;
    }
    
    function borrow(uint256 borrowAmount) external returns (uint256) {
        require(borrowAmount > 0, "Amount must be > 0");
        
        accrueInterest();
        
        uint256 accountBorrowsPrev = borrowBalanceStored(msg.sender);
        uint256 accountBorrowsNew = accountBorrowsPrev.add(borrowAmount);
        uint256 totalBorrowsNew = totalBorrows.add(borrowAmount);
        
        require(underlying.balanceOf(address(this)) >= borrowAmount, "Insufficient cash");
        
        accountBorrows[msg.sender].principal = accountBorrowsNew;
        accountBorrows[msg.sender].interestIndex = borrowIndex;
        totalBorrows = totalBorrowsNew;
        
        require(underlying.transfer(msg.sender, borrowAmount), "Transfer failed");
        
        emit Borrow(msg.sender, borrowAmount, accountBorrowsNew, totalBorrowsNew);
        return borrowAmount;
    }
    
    function repayBorrow(uint256 repayAmount) external returns (uint256) {
        return repayBorrowInternal(msg.sender, msg.sender, repayAmount);
    }
    
    function repayBorrowBehalf(address borrower, uint256 repayAmount) external returns (uint256) {
        return repayBorrowInternal(msg.sender, borrower, repayAmount);
    }
    
    function repayBorrowInternal(address payer, address borrower, uint256 repayAmount) internal returns (uint256) {
        accrueInterest();
        
        uint256 accountBorrowsPrev = borrowBalanceStored(borrower);
        uint256 repayAmountFinal = repayAmount > accountBorrowsPrev ? accountBorrowsPrev : repayAmount;
        uint256 accountBorrowsNew = accountBorrowsPrev.sub(repayAmountFinal);
        uint256 totalBorrowsNew = totalBorrows.sub(repayAmountFinal);
        
        require(underlying.transferFrom(payer, address(this), repayAmountFinal), "Transfer failed");
        
        accountBorrows[borrower].principal = accountBorrowsNew;
        accountBorrows[borrower].interestIndex = borrowIndex;
        totalBorrows = totalBorrowsNew;
        
        emit RepayBorrow(payer, borrower, repayAmountFinal, accountBorrowsNew, totalBorrowsNew);
        return repayAmountFinal;
    }
    
    function borrowBalanceStored(address account) public view returns (uint256) {
        BorrowSnapshot storage borrowSnapshot = accountBorrows[account];
        if (borrowSnapshot.principal == 0) {
            return 0;
        }
        
        uint256 principalTimesIndex = borrowSnapshot.principal.mul(borrowIndex);
        return principalTimesIndex.div(borrowSnapshot.interestIndex);
    }
    
    function borrowBalanceCurrent(address account) external returns (uint256) {
        accrueInterest();
        return borrowBalanceStored(account);
    }
    
    function accrueInterest() public {
        uint256 currentBlockNumber = block.number;
        uint256 accrualBlockNumberPrior = accrualBlockNumber;
        
        if (accrualBlockNumberPrior == currentBlockNumber) {
            return;
        }
        
        uint256 cashPrior = underlying.balanceOf(address(this));
        uint256 borrowsPrior = totalBorrows;
        uint256 reservesPrior = 0; // Simplified
        uint256 borrowIndexPrior = borrowIndex;
        
        uint256 borrowRate = getBorrowRate(cashPrior, borrowsPrior, reservesPrior);
        uint256 blockDelta = currentBlockNumber.sub(accrualBlockNumberPrior);
        
        uint256 simpleInterestFactor = borrowRate.mul(blockDelta);
        uint256 interestAccumulated = simpleInterestFactor.mul(borrowsPrior).div(1e18);
        uint256 totalBorrowsNew = interestAccumulated.add(borrowsPrior);
        uint256 borrowIndexNew = simpleInterestFactor.mul(borrowIndexPrior).div(1e18).add(borrowIndexPrior);
        
        accrualBlockNumber = currentBlockNumber;
        borrowIndex = borrowIndexNew;
        totalBorrows = totalBorrowsNew;
        
        updateExchangeRate();
    }
    
    function getBorrowRate(uint256 cash, uint256 borrows, uint256 reserves) public pure returns (uint256) {
        uint256 util = getUtilizationRate(cash, borrows, reserves);
        // Modèle de taux simple: baseRate + utilization * multiplier
        uint256 baseRate = 0.02e18; // 2% par an
        uint256 multiplier = 0.2e18; // 20% par an
        return baseRate.add(util.mul(multiplier).div(1e18));
    }
    
    function getUtilizationRate(uint256 cash, uint256 borrows, uint256 reserves) public pure returns (uint256) {
        if (borrows == 0) {
            return 0;
        }
        return borrows.mul(1e18).div(cash.add(borrows).sub(reserves));
    }
    
    function updateExchangeRate() internal {
        uint256 totalCash = underlying.balanceOf(address(this));
        uint256 totalSupply = totalSupply();
        
        if (totalSupply == 0) {
            exchangeRate = 1e18;
        } else {
            exchangeRate = totalCash.add(totalBorrows).mul(1e18).div(totalSupply);
        }
    }
    
    function getSupplyRate() external view returns (uint256) {
        uint256 cash = underlying.balanceOf(address(this));
        uint256 borrowRate = getBorrowRate(cash, totalBorrows, 0);
        uint256 util = getUtilizationRate(cash, totalBorrows, 0);
        return util.mul(borrowRate).mul(uint256(1e18).sub(reserveFactor)).div(1e36);
    }
}
