# ProFireManager Mobile

Application mobile React Native + Expo pour ProFireManager.

## 🚀 Fonctionnalités

- **Authentification** : Connexion sécurisée avec JWT
- **Planning** : Consultation du planning hebdomadaire
- **Disponibilités** : Gestion des disponibilités/indisponibilités
- **Remplacements** : Réception et gestion des demandes de remplacement
- **Prévention** : Accès aux inspections et statistiques
- **Notifications Push** : Alertes avec sonnerie pour événements importants
- **Profil** : Consultation et modification du profil utilisateur

## 📱 Développement

### Prérequis

- Node.js (v14 ou supérieur)
- npm ou yarn
- Expo CLI : `npm install -g expo-cli`
- Expo Go app sur votre téléphone (iOS ou Android)

### Installation

```bash
cd /app/mobile
npm install
```

### Lancement avec Expo Go (Développement)

```bash
npm start
```

Puis scannez le QR code avec :
- **iOS** : Caméra native
- **Android** : App Expo Go

### Lancement sur émulateur

**iOS (Mac uniquement)**
```bash
npm run ios
```

**Android**
```bash
npm run android
```

## 🔔 Notifications Push

L'application utilise **Expo Notifications Service** pour les notifications push.

### Configuration actuelle (Développement)

- ✅ Fonctionne avec Expo Go
- ✅ Notifications avec sonnerie et vibration
- ✅ Canaux Android configurés (normal et urgent)
- ✅ Enregistrement automatique des tokens

### Pour la production (Apple Store / Google Play)

Vous aurez besoin de :

#### Android - Firebase Cloud Messaging (FCM)
1. Allez sur https://console.firebase.google.com
2. Créez/sélectionnez votre projet
3. Project Settings > Cloud Messaging
4. Copiez la **Server Key**
5. Ajoutez-la dans app.json sous `android.googleServicesFile`

#### iOS - Apple Push Notification (APNs)
1. Compte Apple Developer (99$/an)
2. Allez sur https://developer.apple.com
3. Certificates, Identifiers & Profiles > Keys
4. Créez une clé APNs
5. Téléchargez le fichier **.p8** + notez **Key ID** et **Team ID**
6. Ajoutez ces informations dans app.json sous `ios.config.usesApns`

## 🎨 Thème

- **Couleur primaire** : #D9072B (Rouge ProFireManager)
- **Police** : System default (San Francisco iOS, Roboto Android)

## 📂 Structure du projet

```
mobile/
├── assets/                 # Images, icônes, sons
├── src/
│   ├── components/         # Composants réutilisables
│   ├── context/           # Context API (AuthContext)
│   ├── navigation/        # Configuration navigation
│   ├── screens/           # Écrans de l'app
│   │   ├── LoginScreen.js
│   │   ├── PlanningScreen.js
│   │   ├── DisponibilitesScreen.js
│   │   ├── RemplacementsScreen.js
│   │   ├── PreventionScreen.js
│   │   └── ProfilScreen.js
│   ├── services/          # Services API et notifications
│   │   ├── api.js
│   │   └── notifications.js
│   └── utils/             # Utilitaires
├── App.js                 # Point d'entrée
├── app.json              # Configuration Expo
└── package.json          # Dépendances

```

## 🔗 Backend

L'application se connecte au backend ProFireManager :
- **URL** : https://fire-respond.preview.emergentagent.com
- **API** : FastAPI (Python)
- **Base de données** : MongoDB Atlas

Configuration dans `app.json` :
```json
"extra": {
  "apiUrl": "https://fire-respond.preview.emergentagent.com"
}
```

## 🧪 Tests

Pour tester l'application :

1. Lancez Expo Go avec `npm start`
2. Scannez le QR code sur votre téléphone
3. Connectez-vous avec :
   - **Caserne** : shefford
   - **Email** : admin@firemanager.ca
   - **Mot de passe** : Admin123!

## 📦 Build Production

### Android APK (pour tests)

```bash
expo build:android -t apk
```

### Android AAB (pour Google Play)

```bash
expo build:android -t app-bundle
```

### iOS IPA (pour App Store)

```bash
expo build:ios
```

**Note** : Les builds nécessitent un compte Expo (gratuit pour les builds de base).

## 🚀 Déploiement

### Google Play Store

1. Build Android AAB
2. Créez un compte Google Play Developer (25$ one-time)
3. Créez une nouvelle application
4. Uploadez le fichier AAB
5. Complétez les informations (description, captures d'écran, etc.)
6. Soumettez pour révision

### Apple App Store

1. Build iOS IPA
2. Compte Apple Developer requis (99$/an)
3. Créez une app dans App Store Connect
4. Uploadez via Transporter ou Xcode
5. Complétez les métadonnées
6. Soumettez pour révision

## 🆘 Dépannage

### L'app ne se connecte pas au backend

1. Vérifiez que le backend est accessible
2. Vérifiez l'URL dans `app.json` > `extra.apiUrl`
3. Vérifiez votre connexion internet

### Les notifications ne fonctionnent pas

1. Vérifiez les permissions dans les paramètres du téléphone
2. Utilisez un appareil physique (pas l'émulateur)
3. Vérifiez les logs : `expo start` puis appuyez sur `m` pour ouvrir le menu

### Erreur lors du build

1. Assurez-vous que toutes les dépendances sont installées : `npm install`
2. Nettoyez le cache : `expo start -c`
3. Vérifiez les versions dans `package.json`

## 📝 License

ProFireManager © 2025
