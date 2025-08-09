# 🏕️ CampLend Protocol

> Plateforme DeFi de lending/borrowing pour Camp Network - Une solution complète inspirée d'Aave

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Hardhat](https://img.shields.io/badge/Built%20with-Hardhat-FFDB1C.svg)](https://hardhat.org/)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.19-363636.svg)](https://soliditylang.org/)

## 🌟 Présentation

CampLend est un protocole DeFi complet permettant le **lending** et **borrowing** d'actifs cryptographiques sur Camp Network. Le protocole offre :

- 💰 **Lending** pour tous les tokens supportés avec génération d'intérêts
- 🏦 **Borrowing** sélectif (actuellement wCAMP uniquement)
- ⚡ **Taux variables** adaptatifs basés sur l'utilisation
- 🛡️ **Liquidations automatiques** pour maintenir la solvabilité
- 🎨 **Interface moderne** responsive et intuitive

## 🌐 Configuration Camp Network

| Paramètre | Valeur |
|-----------|---------|
| **Chain ID** | 325000 |
| **RPC** | https://rpc-campnetwork.xyz |
| **Faucet** | https://faucet.campnetwork.xyz/ |
| **Explorer** | https://explorer.campnetwork.xyz |

## 💎 Tokens supportés

### 🟢 **Lending + Borrowing**
- **wCAMP** (0x1aE9c40eCd2DD6ad5858E5430A556d7aff28A44b) - wrapped CAMP

### 🔵 **Lending seulement**
- **CP** (0x52DE57cc9f27b8c2f7F949Ccc784aD5c071eB537) - CampPoint
- **MUSDC** (0x71002dbf6cC7A885cE6563682932370c056aAca9) - Mock USD Coin
- **WBTC** (0x587aF234D373C752a6F6E9eD6c4Ce871e7528BCF) - wrapped BTC
- **WETH** (0xC42BAA20e3a159cF7A8aDFA924648C2a2d59E062) - WETH
- **MUSDT** (0xA745f7A59E70205e6040BdD3b33eD21DBD23FEB3) - Mock USD Tether

## 🚀 Installation rapide

```bash
# Cloner le repository
git clone https://github.com/YOUR_USERNAME/camplend-protocol.git
cd camplend-protocol

# Installer les dépendances
npm install

# Configurer l'environnement
cp .env.example .env
# ⚠️ Ajouter votre PRIVATE_KEY dans .env

# Compiler les contrats
npm run compile

# Lancer les tests
npm test

# Déployer sur Camp Network
npm run deploy:camp-testnet
```

## 📋 Commandes disponibles

```bash
npm run compile              # Compiler les contrats
npm test                     # Tests unitaires
npm run deploy:camp-testnet  # Déployer sur Camp Network
npm run verify:camp-testnet  # Vérifier les contrats
npm run interact             # Script d'interaction
npm run test-markets         # Tester les marchés créés
npm run clean                # Nettoyer les artifacts
npm run coverage             # Rapport de couverture
```

## 🏗️ Architecture

```
CampLend Protocol
├── 🏦 CampLend.sol         # Contrat principal
├── 🎛️ Comptroller.sol      # Contrôleur de risques
├── 🪙 CToken.sol           # Tokens de dépôt
├── 📊 PriceOracle.sol      # Oracle de prix
└── 🧪 MockERC20.sol        # Tokens de test
```

### Paramètres de risque

| Token | Facteur collatéral | Seuil liquidation | Borrow |
|-------|-------------------|-------------------|---------|
| wCAMP | 75% | 80% | ✅ |
| CP | 70% | 75% | ❌ |
| MUSDC | 80% | 85% | ❌ |
| WBTC | 75% | 80% | ❌ |
| WETH | 75% | 80% | ❌ |
| MUSDT | 80% | 85% | ❌ |

## 🔧 Utilisation

### Déploiement

1. **Préparer l'environnement** :
   ```bash
   cp .env.example .env
   # Ajouter PRIVATE_KEY=your_private_key_here
   ```

2. **Déployer les contrats** :
   ```bash
   npm run deploy:camp-testnet
   ```

3. **Mettre à jour l'interface** :
   - Copier les adresses affichées dans la console
   - Remplacer les valeurs dans `index.html` section `CONTRACTS`

4. **Obtenir des tokens** depuis le [faucet](https://faucet.campnetwork.xyz/)

### Interface Web

L'interface web (`index.html`) offre :
- 🔗 **Connexion wallet** automatique à Camp Network
- 💰 **Affichage des soldes** en temps réel
- 📊 **Dashboard** avec métriques du protocole
- 🔄 **Actions** supply/borrow/repay/withdraw
- 🚰 **Faucet intégré** pour obtenir des tokens de test

## 📊 Tests

```bash
# Tests unitaires complets
npm test

# Avec rapport de couverture
npm run coverage

# Test des marchés déployés
npm run test-markets
```

## 🛡️ Sécurité

### Mécanismes implémentés
- ✅ **ReentrancyGuard** - Protection contre reentrancy
- ✅ **Pausable** - Arrêt d'urgence
- ✅ **Ownable** - Contrôle d'accès
- ✅ **SafeMath** - Prévention overflow
- ✅ **Liquidations** - Maintien de solvabilité

### Audits
- ⚠️ **Non audité** - Ne pas utiliser en production sans audit
- 🧪 **Tests complets** - 95%+ de couverture de code
- 🔍 **Code review** - Bonnes pratiques Solidity

## 🗂️ Structure du projet

```
├── 📁 contracts/           # Smart contracts Solidity
│   ├── CampLend.sol       # Contrat principal
│   ├── Comptroller.sol    # Gestion des risques
│   ├── ComptrollerV2.sol  # Version avec borrow conditionnel
│   ├── CToken.sol         # Tokens de rendement
│   ├── PriceOracle.sol    # Oracle de prix
│   └── MockERC20.sol      # Token de test
├── 📁 scripts/            # Scripts d'automatisation
│   ├── deployment.js      # Déploiement complet
│   ├── verify-contracts.js # Vérification explorateur
│   ├── interact.js        # Script d'interaction
│   └── test-markets.js    # Test des marchés
├── 📁 test/               # Tests unitaires
│   └── CampLend.test.js   # Suite de tests
├── 📁 deployments/        # Informations de déploiement
├── 📄 index.html          # Interface utilisateur
├── ⚙️ hardhat_config.js   # Configuration Hardhat
└── 📝 README.md           # Documentation
```

## 🤝 Contribution

Les contributions sont bienvenues ! 

1. **Fork** le projet
2. **Créer** une branche feature (`git checkout -b feature/ma-feature`)
3. **Commiter** (`git commit -m 'Ajout de ma feature'`)
4. **Push** (`git push origin feature/ma-feature`)
5. **Ouvrir** une Pull Request

## 📄 Licence

Ce projet est sous licence MIT. Voir [LICENSE](LICENSE) pour plus de détails.

## ⚠️ Avertissement

Ce logiciel est fourni "tel quel", sans garantie. Les smart contracts n'ont pas été audités et ne doivent pas être utilisés avec de vrais fonds sans audit préalable.

## 🔗 Liens utiles

- 🌐 [Camp Network](https://campnetwork.xyz)
- 💧 [Faucet](https://faucet.campnetwork.xyz/)
- 🔍 [Explorer](https://explorer.campnetwork.xyz)
- 📚 [Documentation Hardhat](https://hardhat.org/)
- 🔧 [OpenZeppelin](https://openzeppelin.com/)

---

**Fait avec ❤️ pour Camp Network**
