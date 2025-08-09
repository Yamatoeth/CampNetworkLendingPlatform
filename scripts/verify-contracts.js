const hre = require("hardhat");
const fs = require("fs");

async function main() {
    console.log("🔍 Vérification des contrats sur Camp Network...");
    
    // Déterminer le réseau actuel
    const network = await hre.ethers.provider.getNetwork();
    const deploymentFile = `deployments/${network.name}-${network.chainId}.json`;
    
    if (!fs.existsSync(deploymentFile)) {
        console.error(`❌ Fichier de déploiement non trouvé: ${deploymentFile}`);
        process.exit(1);
    }
    
    const deploymentInfo = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
    
    try {
        console.log("🔍 Vérification de PriceOracle...");
        await hre.run("verify:verify", {
            address: deploymentInfo.contracts.Oracle,
            constructorArguments: []
        });
        console.log("✅ PriceOracle vérifié");
        
        console.log("🔍 Vérification de Comptroller...");
        await hre.run("verify:verify", {
            address: deploymentInfo.contracts.Comptroller,
            constructorArguments: [deploymentInfo.contracts.Oracle]
        });
        console.log("✅ Comptroller vérifié");
        
        console.log("🔍 Vérification de CampLend...");
        await hre.run("verify:verify", {
            address: deploymentInfo.contracts.CampLend,
            constructorArguments: [deploymentInfo.contracts.Comptroller]
        });
        console.log("✅ CampLend vérifié");
        
        // Vérifier les tokens de test si ils existent
        if (deploymentInfo.testTokens && Object.keys(deploymentInfo.testTokens).length > 0) {
            console.log("🔍 Vérification des tokens de test...");
            
            for (const [symbol, address] of Object.entries(deploymentInfo.testTokens)) {
                try {
                    await hre.run("verify:verify", {
                        address: address,
                        constructorArguments: getTokenConstructorArgs(symbol)
                    });
                    console.log(`✅ Token ${symbol} vérifié`);
                } catch (error) {
                    console.log(`⚠️ Erreur lors de la vérification du token ${symbol}:`, error.message);
                }
            }
        }
        
        console.log("\n🎉 Vérification terminée avec succès!");
        
    } catch (error) {
        console.error("❌ Erreur lors de la vérification:", error.message);
        process.exit(1);
    }
}

function getTokenConstructorArgs(symbol) {
    const { ethers } = require("hardhat");
    
    switch (symbol) {
        case 'USDC':
            return ["Test USDC", "USDC", 6, ethers.utils.parseUnits("1000000", 6)];
        case 'USDT':
            return ["Test USDT", "USDT", 6, ethers.utils.parseUnits("1000000", 6)];
        case 'WBTC':
            return ["Test WBTC", "WBTC", 8, ethers.utils.parseUnits("1000", 8)];
        default:
            return [];
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
