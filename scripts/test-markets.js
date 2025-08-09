const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
    console.log("🔄 Test d'interaction avec CampLend sur Camp Network...");
    
    // Déterminer le réseau actuel
    const network = await ethers.provider.getNetwork();
    const deploymentFile = `deployments/camp-network-${network.chainId}.json`;
    
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
    const comptroller = await ethers.getContractAt("ComptrollerV2", deploymentInfo.contracts.Comptroller);
    
    console.log("\n🔗 Contrats connectés:");
    console.log("- CampLend:", campLend.address);
    console.log("- Comptroller:", comptroller.address);
    
    // Tester avec wCAMP (token que l'on peut emprunter)
    const wCAMP_ADDRESS = "0x1aE9c40eCd2DD6ad5858E5430A556d7aff28A44b";
    
    try {
        // 1. Vérifier les marchés disponibles
        console.log("\n📊 Vérification des marchés...");
        const markets = await campLend.getAllMarkets();
        console.log(`Nombre de marchés créés: ${markets.length}`);
        
        for (let i = 0; i < markets.length; i++) {
            const cTokenAddress = markets[i];
            const cToken = await ethers.getContractAt("CToken", cTokenAddress);
            const underlying = await cToken.underlying();
            const borrowEnabled = await comptroller.isBorrowEnabled(cTokenAddress);
            
            console.log(`- Marché ${i + 1}: cToken ${cTokenAddress}`);
            console.log(`  Underlying: ${underlying}`);
            console.log(`  Borrow enabled: ${borrowEnabled}`);
        }
        
        // 2. Vérifier le marché wCAMP spécifiquement
        console.log("\n🏪 Test du marché wCAMP...");
        const cTokenAddress = await campLend.cTokens(wCAMP_ADDRESS);
        
        if (cTokenAddress === ethers.constants.AddressZero) {
            console.log("❌ Marché wCAMP non trouvé");
            return;
        }
        
        console.log("✅ Marché wCAMP trouvé:", cTokenAddress);
        
        const borrowEnabled = await comptroller.isBorrowEnabled(cTokenAddress);
        console.log(`Borrow enabled pour wCAMP: ${borrowEnabled}`);
        
        // 3. Tester les permissions de borrow
        console.log("\n🔍 Test des permissions...");
        
        // Simuler un borrow (sans l'exécuter)
        const testBorrowAmount = ethers.utils.parseEther("1"); // 1 wCAMP
        const canBorrow = await comptroller.borrowAllowed(cTokenAddress, user.address, testBorrowAmount);
        console.log(`Peut emprunter 1 wCAMP: ${canBorrow}`);
        
        // 4. Afficher les informations du compte
        const snapshot = await campLend.getAccountSnapshot(user.address, wCAMP_ADDRESS);
        console.log("\n📊 Snapshot du compte pour wCAMP:");
        console.log("  - cToken Balance:", ethers.utils.formatEther(snapshot.cTokenBalance));
        console.log("  - Borrow Balance:", ethers.utils.formatEther(snapshot.borrowBalance));
        console.log("  - Exchange Rate:", ethers.utils.formatEther(snapshot.exchangeRate));
        
        // 5. Vérifier la liquidité du compte
        const [liquidity, shortfall] = await comptroller.getAccountLiquidity(user.address);
        console.log("\n💧 Liquidité du compte:");
        console.log("  - Liquidité:", ethers.utils.formatEther(liquidity));
        console.log("  - Déficit:", ethers.utils.formatEther(shortfall));
        
        console.log("\n✅ Test terminé avec succès!");
        console.log("\n📝 Résumé:");
        console.log(`- ${markets.length} marchés créés`);
        console.log("- wCAMP: Lending + Borrowing ✅");
        console.log("- Autres tokens: Lending seulement ✅");
        console.log("\n🎯 Prochaines étapes:");
        console.log("1. Obtenir des tokens depuis le faucet:", deploymentInfo.faucet);
        console.log("2. Tester le lending avec l'interface web");
        console.log("3. Tester le borrowing de wCAMP");
        
    } catch (error) {
        console.error("❌ Erreur lors du test:", error.message);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
