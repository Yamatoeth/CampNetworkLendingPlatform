const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CampLend Protocol", function () {
    let campLend, comptroller, oracle;
    let usdc, usdt;
    let owner, user1, user2;
    
    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();
        
        // Déployer l'oracle
        const PriceOracle = await ethers.getContractFactory("PriceOracle");
        oracle = await PriceOracle.deploy();
        
        // Déployer le comptroller
        const Comptroller = await ethers.getContractFactory("Comptroller");
        comptroller = await Comptroller.deploy(oracle.address);
        
        // Déployer CampLend
        const CampLend = await ethers.getContractFactory("CampLend");
        campLend = await CampLend.deploy(comptroller.address);
        
        // Déployer des tokens de test
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        usdc = await MockERC20.deploy("Test USDC", "USDC", 6, ethers.utils.parseUnits("1000000", 6));
        usdt = await MockERC20.deploy("Test USDT", "USDT", 6, ethers.utils.parseUnits("1000000", 6));
        
        // Configurer les prix
        await oracle.setPrice(usdc.address, ethers.utils.parseEther("1"));
        await oracle.setPrice(usdt.address, ethers.utils.parseEther("1"));
        
        // Créer les marchés
        await campLend.createMarket(
            usdc.address,
            "CampLend USDC",
            "cUSDC",
            ethers.utils.parseEther("0.8"),
            ethers.utils.parseEther("0.85")
        );
        
        await campLend.createMarket(
            usdt.address,
            "CampLend USDT",
            "cUSDT",
            ethers.utils.parseEther("0.8"),
            ethers.utils.parseEther("0.85")
        );
        
        // Distribuer des tokens aux utilisateurs
        await usdc.transfer(user1.address, ethers.utils.parseUnits("10000", 6));
        await usdc.transfer(user2.address, ethers.utils.parseUnits("10000", 6));
        await usdt.transfer(user1.address, ethers.utils.parseUnits("10000", 6));
        await usdt.transfer(user2.address, ethers.utils.parseUnits("10000", 6));
    });
    
    describe("Deployment", function () {
        it("Should deploy all contracts correctly", async function () {
            expect(campLend.address).to.not.equal(ethers.constants.AddressZero);
            expect(comptroller.address).to.not.equal(ethers.constants.AddressZero);
            expect(oracle.address).to.not.equal(ethers.constants.AddressZero);
        });
        
        it("Should have correct initial configuration", async function () {
            const markets = await campLend.getAllMarkets();
            expect(markets.length).to.equal(2);
            
            const usdcCToken = await campLend.cTokens(usdc.address);
            const usdtCToken = await campLend.cTokens(usdt.address);
            
            expect(usdcCToken).to.not.equal(ethers.constants.AddressZero);
            expect(usdtCToken).to.not.equal(ethers.constants.AddressZero);
        });
    });
    
    describe("Supply", function () {
        it("Should allow users to supply tokens", async function () {
            const supplyAmount = ethers.utils.parseUnits("1000", 6);
            
            // Approuver et déposer
            await usdc.connect(user1).approve(campLend.address, supplyAmount);
            await campLend.connect(user1).supply(usdc.address, supplyAmount);
            
            // Vérifier le solde cToken
            const cTokenAddress = await campLend.cTokens(usdc.address);
            const cToken = await ethers.getContractAt("CToken", cTokenAddress);
            const balance = await cToken.balanceOf(user1.address);
            
            expect(balance).to.be.gt(0);
        });
        
        it("Should reject supply of unsupported tokens", async function () {
            const supplyAmount = ethers.utils.parseUnits("1000", 18);
            
            await expect(
                campLend.connect(user1).supply(user1.address, supplyAmount)
            ).to.be.revertedWith("Market not supported");
        });
        
        it("Should update exchange rate after supply", async function () {
            const supplyAmount = ethers.utils.parseUnits("1000", 6);
            const cTokenAddress = await campLend.cTokens(usdc.address);
            const cToken = await ethers.getContractAt("CToken", cTokenAddress);
            
            const exchangeRateBefore = await cToken.exchangeRate();
            
            await usdc.connect(user1).approve(campLend.address, supplyAmount);
            await campLend.connect(user1).supply(usdc.address, supplyAmount);
            
            const exchangeRateAfter = await cToken.exchangeRate();
            
            // L'exchange rate peut changer légèrement à cause de la précision
            expect(exchangeRateAfter).to.be.gte(exchangeRateBefore);
        });
    });
    
    describe("Borrow", function () {
        beforeEach(async function () {
            // Fournir du collatéral d'abord
            const supplyAmount = ethers.utils.parseUnits("1000", 6);
            await usdc.connect(user1).approve(campLend.address, supplyAmount);
            await campLend.connect(user1).supply(usdc.address, supplyAmount);
            
            // Entrer sur le marché
            const cTokenAddress = await campLend.cTokens(usdc.address);
            await comptroller.connect(user1).enterMarkets([cTokenAddress]);
        });
        
        it("Should allow users to borrow against collateral", async function () {
            // Emprunter (40% du collatéral, sous la limite de 80%)
            const borrowAmount = ethers.utils.parseUnits("400", 6);
            
            const balanceBefore = await usdc.balanceOf(user1.address);
            await campLend.connect(user1).borrow(usdc.address, borrowAmount);
            const balanceAfter = await usdc.balanceOf(user1.address);
            
            expect(balanceAfter.sub(balanceBefore)).to.equal(borrowAmount);
            
            // Vérifier le borrow balance
            const cTokenAddress = await campLend.cTokens(usdc.address);
            const cToken = await ethers.getContractAt("CToken", cTokenAddress);
            const borrowBalance = await cToken.borrowBalanceStored(user1.address);
            
            expect(borrowBalance).to.equal(borrowAmount);
        });
        
        it("Should reject borrow exceeding collateral limit", async function () {
            // Essayer d'emprunter plus que la limite (90% du collatéral)
            const borrowAmount = ethers.utils.parseUnits("900", 6);
            
            await expect(
                campLend.connect(user1).borrow(usdc.address, borrowAmount)
            ).to.be.revertedWith("Borrow not allowed");
        });
        
        it("Should reject borrow without entering market", async function () {
            // User2 n'a pas rejoint le marché
            const borrowAmount = ethers.utils.parseUnits("100", 6);
            
            await expect(
                campLend.connect(user2).borrow(usdc.address, borrowAmount)
            ).to.be.revertedWith("Borrow not allowed");
        });
    });
    
    describe("Repay", function () {
        let borrowAmount;
        
        beforeEach(async function () {
            // Setup: supply, enter market, and borrow
            const supplyAmount = ethers.utils.parseUnits("1000", 6);
            await usdc.connect(user1).approve(campLend.address, supplyAmount);
            await campLend.connect(user1).supply(usdc.address, supplyAmount);
            
            const cTokenAddress = await campLend.cTokens(usdc.address);
            await comptroller.connect(user1).enterMarkets([cTokenAddress]);
            
            borrowAmount = ethers.utils.parseUnits("400", 6);
            await campLend.connect(user1).borrow(usdc.address, borrowAmount);
        });
        
        it("Should allow users to repay borrowed tokens", async function () {
            const repayAmount = ethers.utils.parseUnits("200", 6);
            
            await usdc.connect(user1).approve(campLend.address, repayAmount);
            await campLend.connect(user1).repay(usdc.address, repayAmount);
            
            // Vérifier que la dette a diminué
            const cTokenAddress = await campLend.cTokens(usdc.address);
            const cToken = await ethers.getContractAt("CToken", cTokenAddress);
            const borrowBalance = await cToken.borrowBalanceStored(user1.address);
            
            expect(borrowBalance).to.equal(borrowAmount.sub(repayAmount));
        });
        
        it("Should allow full repayment", async function () {
            await usdc.connect(user1).approve(campLend.address, borrowAmount);
            await campLend.connect(user1).repay(usdc.address, borrowAmount);
            
            const cTokenAddress = await campLend.cTokens(usdc.address);
            const cToken = await ethers.getContractAt("CToken", cTokenAddress);
            const borrowBalance = await cToken.borrowBalanceStored(user1.address);
            
            expect(borrowBalance).to.equal(0);
        });
    });
    
    describe("Withdraw", function () {
        let cTokenAddress, cToken;
        
        beforeEach(async function () {
            const supplyAmount = ethers.utils.parseUnits("1000", 6);
            await usdc.connect(user1).approve(campLend.address, supplyAmount);
            await campLend.connect(user1).supply(usdc.address, supplyAmount);
            
            cTokenAddress = await campLend.cTokens(usdc.address);
            cToken = await ethers.getContractAt("CToken", cTokenAddress);
        });
        
        it("Should allow users to withdraw supplied tokens", async function () {
            const cTokenBalance = await cToken.balanceOf(user1.address);
            const withdrawAmount = cTokenBalance.div(2); // Retirer la moitié
            
            const balanceBefore = await usdc.balanceOf(user1.address);
            await campLend.connect(user1).withdraw(usdc.address, withdrawAmount);
            const balanceAfter = await usdc.balanceOf(user1.address);
            
            expect(balanceAfter).to.be.gt(balanceBefore);
            
            // Vérifier que les cTokens ont été brûlés
            const newCTokenBalance = await cToken.balanceOf(user1.address);
            expect(newCTokenBalance).to.equal(cTokenBalance.sub(withdrawAmount));
        });
    });
    
    describe("Account Snapshot", function () {
        it("Should return correct account information", async function () {
            const supplyAmount = ethers.utils.parseUnits("1000", 6);
            await usdc.connect(user1).approve(campLend.address, supplyAmount);
            await campLend.connect(user1).supply(usdc.address, supplyAmount);
            
            const snapshot = await campLend.getAccountSnapshot(user1.address, usdc.address);
            
            expect(snapshot.cTokenBalance).to.be.gt(0);
            expect(snapshot.borrowBalance).to.equal(0);
            expect(snapshot.exchangeRate).to.be.gt(0);
        });
        
        it("Should return zero for non-existent market", async function () {
            const snapshot = await campLend.getAccountSnapshot(user1.address, user1.address);
            
            expect(snapshot.cTokenBalance).to.equal(0);
            expect(snapshot.borrowBalance).to.equal(0);
            expect(snapshot.exchangeRate).to.equal(0);
        });
    });
    
    describe("Market Management", function () {
        it("Should list all markets correctly", async function () {
            const markets = await campLend.getAllMarkets();
            expect(markets.length).to.equal(2);
        });
        
        it("Should prevent duplicate market creation", async function () {
            await expect(
                campLend.createMarket(
                    usdc.address,
                    "Duplicate USDC",
                    "dUSDC",
                    ethers.utils.parseEther("0.8"),
                    ethers.utils.parseEther("0.85")
                )
            ).to.be.revertedWith("Market already exists");
        });
    });
    
    describe("Access Control", function () {
        it("Should only allow owner to create markets", async function () {
            const MockERC20 = await ethers.getContractFactory("MockERC20");
            const newToken = await MockERC20.deploy("New Token", "NEW", 18, ethers.utils.parseEther("1000000"));
            
            await expect(
                campLend.connect(user1).createMarket(
                    newToken.address,
                    "CampLend NEW",
                    "cNEW",
                    ethers.utils.parseEther("0.7"),
                    ethers.utils.parseEther("0.75")
                )
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });
        
        it("Should allow owner to pause and unpause", async function () {
            await campLend.pause();
            
            const supplyAmount = ethers.utils.parseUnits("1000", 6);
            await usdc.connect(user1).approve(campLend.address, supplyAmount);
            
            await expect(
                campLend.connect(user1).supply(usdc.address, supplyAmount)
            ).to.be.revertedWith("Pausable: paused");
            
            await campLend.unpause();
            
            // Maintenant ça devrait fonctionner
            await expect(
                campLend.connect(user1).supply(usdc.address, supplyAmount)
            ).to.not.be.reverted;
        });
    });
});
