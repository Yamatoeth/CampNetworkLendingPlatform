// deployment.js - Script de déploiement pour Camp Network
const { ethers } = require("hardhat");
const fs = require("fs");

// Adresses des tokens existants sur Camp Network
const TOKEN_ADDRESSES = {
    CP: "0x52DE57cc9f27b8c2f7F949Ccc784aD5c071eB537",        // CampPoint
    MUSDC: "0x71002dbf6cC7A885cE6563682932370c056aAca9",     // Mock USD Coin
    wCAMP: "0x1aE9c40eCd2DD6ad5858E5430A556d7aff28A44b",     // wrapped CAMP
    WBTC: "0x587aF234D373C752a6F6E9eD6c4Ce871e7528BCF",      // wrapped BTC
    WETH: "0xC42BAA20e3a159cF7A8aDFA924648C2a2d59E062",      // WETH
    MUSDT: "0xA745f7A59E70205e6040BdD3b33eD21DBD23FEB3"      // Mock USD Tether
};

// Configuration des prix (en USD avec 18 décimales)
const TOKEN_PRICES = {
    CP: ethers.utils.parseEther("0.1"),      // 0.1 USD
    MUSDC: ethers.utils.parseEther("1"),     // 1 USD
    wCAMP: ethers.utils.parseEther("0.05"),  // 0.05 USD (token principal pour borrow)
    WBTC: ethers.utils.parseEther("45000"),  // 45,000 USD
    WETH: ethers.utils.parseEther("2500"),   // 2,500 USD  
    MUSDT: ethers.utils.parseEther("1")      // 1 USD
};

// Configuration des marchés
const MARKET_CONFIG = {
    CP: {
        name: "CampLend CampPoint",
        symbol: "cCP",
        collateralFactor: ethers.utils.parseEther("0.7"),   // 70%
        liquidationThreshold: ethers.utils.parseEther("0.75"), // 75%
        borrowEnabled: false // Lending seulement
    },
    MUSDC: {
        name: "CampLend Mock USDC",
        symbol: "cMUSDC", 
        collateralFactor: ethers.utils.parseEther("0.8"),   // 80%
        liquidationThreshold: ethers.utils.parseEther("0.85"), // 85%
        borrowEnabled: false // Lending seulement
    },
    wCAMP: {
        name: "CampLend wrapped CAMP",
        symbol: "cwCAMP",
        collateralFactor: ethers.utils.parseEther("0.75"),  // 75%
        liquidationThreshold: ethers.utils.parseEther("0.8"), // 80%
        borrowEnabled: true // Lending ET borrowing
    },
    WBTC: {
        name: "CampLend WBTC",
        symbol: "cWBTC",
        collateralFactor: ethers.utils.parseEther("0.75"),  // 75%
        liquidationThreshold: ethers.utils.parseEther("0.8"), // 80%
        borrowEnabled: false // Lending seulement
    },
    WETH: {
        name: "CampLend WETH", 
        symbol: "cWETH",
        collateralFactor: ethers.utils.parseEther("0.75"),  // 75%
        liquidationThreshold: ethers.utils.parseEther("0.8"), // 80%
        borrowEnabled: false // Lending seulement
    },
    MUSDT: {
        name: "CampLend Mock USDT",
        symbol: "cMUSDT",
        collateralFactor: ethers.utils.parseEther("0.8"),   // 80%
        liquidationThreshold: ethers.utils.parseEther("0.85"), // 85%
        borrowEnabled: false // Lending seulement
    }
};

async function main() {
    console.log("🚀 Déploiement de CampLend sur Camp Network...");
    
    // Obtenir le déployeur
    const [deployer] = await ethers.getSigners();
    console.log("Déploiement avec le compte:", deployer.address);
    console.log("Solde du compte:", ethers.utils.formatEther(await deployer.getBalance()));

    // Vérifier le réseau
    const network = await ethers.provider.getNetwork();
    console.log("Réseau:", network.name, "Chain ID:", network.chainId);
    
    if (network.chainId !== 325000) {
        console.warn("⚠️  Attention: Vous n'êtes pas sur Camp Network (325000)");
    }

    // 1. Déployer l'Oracle de prix
    console.log("\n📊 Déploiement de PriceOracle...");
    const PriceOracle = await ethers.getContractFactory("PriceOracle");
    const oracle = await PriceOracle.deploy();
    await oracle.deployed();
    console.log("PriceOracle déployé à:", oracle.address);

    // 2. Déployer le Comptroller V2 (avec support borrow conditionnel)
    console.log("\n🎛️ Déploiement du Comptroller...");
    const Comptroller = await ethers.getContractFactory("ComptrollerV2");
    const comptroller = await Comptroller.deploy(oracle.address);
    await comptroller.deployed();
    console.log("Comptroller déployé à:", comptroller.address);

    // 3. Déployer le contrat principal CampLend
    console.log("\n🏦 Déploiement de CampLend...");
    const CampLend = await ethers.getContractFactory("CampLend");
    const campLend = await CampLend.deploy(comptroller.address);
    await campLend.deployed();
    console.log("CampLend déployé à:", campLend.address);

    // 4. Configurer les prix dans l'oracle
    console.log("\n💰 Configuration des prix...");
    for (const [symbol, price] of Object.entries(TOKEN_PRICES)) {
        const tokenAddress = TOKEN_ADDRESSES[symbol];
        await oracle.setPrice(tokenAddress, price);
        console.log(`Prix ${symbol}: ${ethers.utils.formatEther(price)} USD`);
    }

    // 5. Créer les marchés
    console.log("\n🏪 Création des marchés...");
    const markets = {};
    
    for (const [symbol, config] of Object.entries(MARKET_CONFIG)) {
        const tokenAddress = TOKEN_ADDRESSES[symbol];
        
        console.log(`Création du marché ${symbol}...`);
        const tx = await campLend.createMarket(
            tokenAddress,
            config.name,
            config.symbol,
            config.collateralFactor,
            config.liquidationThreshold
        );
        await tx.wait();
        
        // Configurer les permissions de borrow
        const cTokenAddress = await campLend.cTokens(tokenAddress);
        await comptroller.setBorrowEnabled(cTokenAddress, config.borrowEnabled);
        
        markets[symbol] = {
            underlying: tokenAddress,
            cToken: cTokenAddress,
            borrowEnabled: config.borrowEnabled
        };
        
        console.log(`✅ Marché ${symbol} créé: ${cTokenAddress} (Borrow: ${config.borrowEnabled})`);
    }

    console.log("\n✅ Déploiement terminé avec succès!");
    
    // Sauvegarder les adresses
    const deploymentInfo = {
        network: network.name,
        chainId: network.chainId,
        timestamp: new Date().toISOString(),
        contracts: {
            Oracle: oracle.address,
            Comptroller: comptroller.address,
            CampLend: campLend.address
        },
        tokens: TOKEN_ADDRESSES,
        markets: markets,
        deployer: deployer.address,
        faucet: "https://faucet.campnetwork.xyz/"
    };

    console.log("\n📋 Informations de déploiement:");
    console.log(JSON.stringify(deploymentInfo, null, 2));

    // Créer le dossier deployments s'il n'existe pas
    if (!fs.existsSync("deployments")) {
        fs.mkdirSync("deployments");
    }

    // Sauvegarder dans un fichier
    const filename = `deployments/camp-network-${network.chainId}.json`;
    fs.writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));
    console.log(`\n💾 Informations sauvegardées dans ${filename}`);

    // Instructions post-déploiement
    console.log("\n📝 Résumé des marchés:");
    console.log("🟢 LENDING + BORROWING:");
    console.log("  - wCAMP (wrapped CAMP)");
    console.log("\n🔵 LENDING SEULEMENT:");
    console.log("  - CP (CampPoint)");
    console.log("  - MUSDC (Mock USD Coin)");
    console.log("  - WBTC (wrapped BTC)");
    console.log("  - WETH");
    console.log("  - MUSDT (Mock USD Tether)");
    
    console.log("\n📝 Prochaines étapes:");
    console.log("1. Mettre à jour les adresses dans index.html");
    console.log("2. Tester avec le script d'interaction");
    console.log("3. Vérifier les contrats sur l'explorateur");
    console.log("4. Obtenir des tokens depuis le faucet:", "https://faucet.campnetwork.xyz/");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Erreur:", error);
        process.exit(1);
    });
