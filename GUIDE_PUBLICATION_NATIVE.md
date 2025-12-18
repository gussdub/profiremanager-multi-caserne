# 📱 Guide de Publication - ProFireManager Native

Ce guide vous accompagne étape par étape pour publier ProFireManager sur l'App Store (iOS) et Google Play (Android).

---

## 📋 Prérequis

- [x] Compte Apple Developer ($99/an) - https://developer.apple.com
- [x] Compte Google Play Developer ($25 one-time) - https://play.google.com/console
- [x] MacBook Pro avec Xcode installé
- [x] Node.js installé
- [ ] Android Studio installé (pour Android)

---

## 🔧 Étape 1: Préparation du Projet

### 1.1 Cloner le projet sur votre Mac

```bash
# Sur votre MacBook, clonez le repo
git clone https://github.com/VOTRE_REPO/profiremanager.git
cd profiremanager/frontend
```

### 1.2 Installer les dépendances

```bash
npm install
# ou
yarn install
```

### 1.3 Compiler le build web

```bash
npm run build
# ou
yarn build
```

### 1.4 Synchroniser avec Capacitor

```bash
npx cap sync
```

---

## 🍎 Étape 2: Publication iOS (App Store)

### 2.1 Ouvrir le projet iOS dans Xcode

```bash
npx cap open ios
```

### 2.2 Configurer les certificats Apple

1. **Dans Xcode**, allez dans le projet (icône bleue en haut à gauche)
2. Sélectionnez la target **App**
3. Dans l'onglet **Signing & Capabilities**:
   - Cochez **Automatically manage signing**
   - Sélectionnez votre **Team** (votre compte Apple Developer)
   - Le **Bundle Identifier** doit être: `com.profiremanager.app`

### 2.3 Configurer les Push Notifications

1. Dans **Signing & Capabilities**, cliquez **+ Capability**
2. Ajoutez **Push Notifications**
3. Ajoutez **Background Modes** et cochez:
   - Remote notifications
   - Background fetch

### 2.4 Configurer l'icône de l'app

1. Dans Xcode, ouvrez **Assets.xcassets**
2. Cliquez sur **AppIcon**
3. Glissez vos icônes aux formats requis:
   - 1024x1024 (App Store)
   - 180x180 (iPhone @3x)
   - 120x120 (iPhone @2x)
   - 167x167 (iPad Pro)
   - 152x152 (iPad @2x)

### 2.5 Configurer Firebase pour iOS

1. Allez sur https://console.firebase.google.com
2. Créez un projet (ou utilisez un existant)
3. Ajoutez une app iOS avec Bundle ID: `com.profiremanager.app`
4. Téléchargez `GoogleService-Info.plist`
5. Glissez ce fichier dans Xcode sous **App/App/**

### 2.6 Créer une archive pour l'App Store

1. Dans Xcode: **Product → Archive**
2. Une fois l'archive créée, cliquez **Distribute App**
3. Sélectionnez **App Store Connect**
4. Suivez les étapes jusqu'à l'upload

### 2.7 Soumettre sur App Store Connect

1. Allez sur https://appstoreconnect.apple.com
2. Créez une nouvelle app avec Bundle ID `com.profiremanager.app`
3. Remplissez les informations:
   - Nom: ProFireManager
   - Sous-titre: Gestion des horaires pompiers
   - Description: [Voir ci-dessous]
   - Captures d'écran (obligatoires)
   - Catégorie: Productivité
   - Classification: 4+

---

## 🤖 Étape 3: Publication Android (Google Play)

### 3.1 Ouvrir le projet Android

```bash
npx cap open android
```

### 3.2 Configurer Firebase pour Android

1. Dans Firebase Console, ajoutez une app Android
2. Package name: `com.profiremanager.app`
3. Téléchargez `google-services.json`
4. Placez-le dans `android/app/`

### 3.3 Générer une clé de signature

```bash
cd android
keytool -genkey -v -keystore profiremanager-release.keystore -alias profiremanager -keyalg RSA -keysize 2048 -validity 10000
```

**IMPORTANT**: Sauvegardez ce fichier et le mot de passe! Vous en aurez besoin pour chaque mise à jour.

### 3.4 Configurer la signature dans Gradle

Éditez `android/app/build.gradle`:

```gradle
android {
    ...
    signingConfigs {
        release {
            storeFile file('profiremanager-release.keystore')
            storePassword 'VOTRE_MOT_DE_PASSE'
            keyAlias 'profiremanager'
            keyPassword 'VOTRE_MOT_DE_PASSE'
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
```

### 3.5 Générer l'APK/AAB de release

```bash
cd android
./gradlew bundleRelease
```

Le fichier sera dans: `android/app/build/outputs/bundle/release/app-release.aab`

### 3.6 Publier sur Google Play Console

1. Allez sur https://play.google.com/console
2. Créez une nouvelle application
3. Remplissez les informations:
   - Nom: ProFireManager
   - Description courte: Gestion des horaires pour services incendie
   - Description complète
   - Captures d'écran
   - Icône haute résolution (512x512)
4. Dans **Production**, uploadez le fichier `.aab`
5. Soumettez pour révision

---

## 📝 Description pour les stores

### Description courte (80 caractères)
```
Gestion des horaires et remplacements pour services d'incendie
```

### Description complète
```
ProFireManager est l'application de référence pour la gestion des services d'incendie au Québec.

FONCTIONNALITÉS PRINCIPALES:
• Gestion des horaires et plannings
• Demandes de remplacement automatisées
• Échanges de gardes entre pompiers
• Gestion des disponibilités
• Notifications push en temps réel
• Gestion des équipements et véhicules
• Carte des bornes d'incendie
• Mode hors-ligne

POUR QUI?
• Services d'incendie municipaux
• Pompiers volontaires et temps partiel
• Administrateurs et superviseurs

NOTIFICATIONS:
Recevez instantanément les alertes pour:
• Demandes de remplacement
• Échanges acceptés/refusés
• Congés approuvés
• Rappels de gardes

Développé spécifiquement pour les besoins des services incendie québécois.
```

---

## 🔔 Configuration des Notifications Push

### Pour que les notifications fonctionnent:

1. **Créer un projet Firebase** (si pas déjà fait)
   - https://console.firebase.google.com

2. **Configurer les clés serveur**
   - Dans Firebase: Project Settings → Cloud Messaging
   - Copiez la **Server Key**
   - Ajoutez-la dans le `.env` du backend:
     ```
     FIREBASE_SERVER_KEY=votre_cle_serveur
     ```

3. **Pour iOS - Configurer APNs**
   - Dans Apple Developer: Certificates → Keys
   - Créez une clé APNs
   - Uploadez-la dans Firebase → Project Settings → Cloud Messaging → Apple app configuration

---

## ✅ Checklist avant soumission

### iOS
- [ ] Icônes de l'app configurées
- [ ] GoogleService-Info.plist ajouté
- [ ] Push Notifications capability ajoutée
- [ ] Captures d'écran (6.5" et 5.5")
- [ ] Description et métadonnées remplies
- [ ] Privacy Policy URL

### Android
- [ ] google-services.json ajouté
- [ ] Clé de signature générée et sauvegardée
- [ ] APK/AAB signé
- [ ] Captures d'écran
- [ ] Description et métadonnées remplies
- [ ] Privacy Policy URL

---

## 🆘 Support

Si vous rencontrez des problèmes, les erreurs courantes sont:

1. **"No signing certificate"** → Configurez votre Team dans Xcode
2. **"Push notifications entitlement"** → Ajoutez la capability dans Xcode
3. **"Bundle ID mismatch"** → Vérifiez que c'est `com.profiremanager.app` partout
4. **Build Android échoue** → Vérifiez que le JDK 17 est installé

---

## 📱 Multi-tenant

Pour gérer plusieurs casernes (tenants), l'app détecte automatiquement le tenant depuis:
1. Le dernier tenant visité (stocké localement)
2. Ou demande à l'utilisateur de choisir à la connexion

Chaque utilisateur est associé à un tenant spécifique via son compte.
