const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
    console.log("🔄 Interaction avec CampLend...");
    
    // Déterminer le réseau actuel
    const network = await ethers.provider.getNetwork();
    const deploymentFile = `deployments/${network.name}-${network.chainId}.json`;
    
    if (!fs.existsSync(deploymentFile)) {
        console.error(`❌ Fichier de déploiement non trouvé: ${deploymentFile}`);
        console.log("Veuillez d'abord déployer les contrats avec 'npm run deploy:camp-testnet'");
        process.exit(1);
    }
    
    // Charger les adresses des contrats déployés
    const deploymentInfo = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
    
    const [user] = await ethers.getSigners();
    console.log("👤 Utilisateur:", user.address);
    console.log("💰 Solde ETH:", ethers.utils.formatEther(await user.getBalance()));
    
    // Connecter aux contrats
    const campLend = await ethers.getContractAt("CampLend", deploymentInfo.contracts.CampLend);
    const comptroller = await ethers.getContractAt("Comptroller", deploymentInfo.contracts.Comptroller);
    
    // Vérifier si nous avons des tokens de test
    if (!deploymentInfo.testTokens || !deploymentInfo.testTokens.USDC) {
        console.log("❌ Pas de tokens de test trouvés. Ce script fonctionne uniquement sur le testnet.");
        process.exit(1);
    }
    
    const usdc = await ethers.getContractAt("MockERC20", deploymentInfo.testTokens.USDC);
    
    try {
        // Obtenir des tokens depuis le faucet
        console.log("\n🚰 Obtention de tokens de test...");
        const faucetAmount = ethers.utils.parseUnits("1000", 6);
        await usdc.faucet(faucetAmount);
        
        const balance = await usdc.balanceOf(user.address);
        console.log("💰 Solde USDC:", ethers.utils.formatUnits(balance, 6));
        
        // Approuver et déposer
        const depositAmount = ethers.utils.parseUnits("500", 6);
        console.log(`\n📝 Approbation de ${ethers.utils.formatUnits(depositAmount, 6)} USDC...`);
        const approveTx = await usdc.approve(campLend.address, depositAmount);
        await approveTx.wait();
        
        console.log(`🏦 Dépôt de ${ethers.utils.formatUnits(depositAmount, 6)} USDC...`);
        const supplyTx = await campLend.supply(usdc.address, depositAmount);
        await supplyTx.wait();
        console.log("✅ Dépôt effectué!");
        
        // Vérifier les informations du compte
        const snapshot = await campLend.getAccountSnapshot(user.address, usdc.address);
        console.log("\n📊 Snapshot du compte:");
        console.log("  - cToken Balance:", ethers.utils.formatEther(snapshot.cTokenBalance));
        console.log("  - Borrow Balance:", ethers.utils.formatUnits(snapshot.borrowBalance, 6));
        console.log("  - Exchange Rate:", ethers.utils.formatEther(snapshot.exchangeRate));
        
        // Entrer sur le marché pour pouvoir emprunter
        const cTokenAddress = await campLend.cTokens(usdc.address);
        console.log("\n🏪 Entrée sur le marché USDC...");
        const enterTx = await comptroller.enterMarkets([cTokenAddress]);
        await enterTx.wait();
        
        // Vérifier la liquidité du compte
        const [liquidity, shortfall] = await comptroller.getAccountLiquidity(user.address);
        console.log("💧 Liquidité:", ethers.utils.formatEther(liquidity));
        console.log("⚠️ Déficit:", ethers.utils.formatEther(shortfall));
        
        // Emprunter une petite somme (20% du collatéral)
        const borrowAmount = ethers.utils.parseUnits("100", 6);
        console.log(`\n💸 Emprunt de ${ethers.utils.formatUnits(borrowAmount, 6)} USDC...`);
        const borrowTx = await campLend.borrow(usdc.address, borrowAmount);
        await borrowTx.wait();
        console.log("✅ Emprunt effectué!");
        
        // Vérifier le nouveau snapshot
        const newSnapshot = await campLend.getAccountSnapshot(user.address, usdc.address);
        console.log("\n📊 Nouveau snapshot du compte:");
        console.log("  - cToken Balance:", ethers.utils.formatEther(newSnapshot.cTokenBalance));
        console.log("  - Borrow Balance:", ethers.utils.formatUnits(newSnapshot.borrowBalance, 6));
        console.log("  - Exchange Rate:", ethers.utils.formatEther(newSnapshot.exchangeRate));
        
        // Vérifier le solde USDC après emprunt
        const newBalance = await usdc.balanceOf(user.address);
        console.log("💰 Nouveau solde USDC:", ethers.utils.formatUnits(newBalance, 6));
        
        console.log("\n🎉 Interaction terminée avec succès!");
        console.log("\n📝 Résumé:");
        console.log(`- Déposé: ${ethers.utils.formatUnits(depositAmount, 6)} USDC`);
        console.log(`- Emprunté: ${ethers.utils.formatUnits(borrowAmount, 6)} USDC`);
        console.log(`- cTokens reçus: ${ethers.utils.formatEther(snapshot.cTokenBalance)}`);
        console.log(`- Dette actuelle: ${ethers.utils.formatUnits(newSnapshot.borrowBalance, 6)} USDC`);
        
    } catch (error) {
        console.error("❌ Erreur lors de l'interaction:", error.message);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
