# 📱 Guide de Publication de l'Application Mobile ProFireManager

Ce guide vous explique comment compiler, tester et publier ProFireManager en tant qu'application mobile native sur iOS et Android.

## 🎯 Prérequis

### Pour iOS (App Store)
- **Mac** avec macOS 12+ (obligatoire pour compiler les apps iOS)
- **Xcode** 14+ installé depuis l'App Store
- **Compte Apple Developer** ($99 USD/an)
  - Inscription sur https://developer.apple.com/programs/
- **Certificat de distribution iOS**
- **Provisioning Profile**

### Pour Android (Google Play)
- **Ordinateur** Windows, Mac ou Linux
- **Android Studio** installé
- **Java JDK** 11 ou supérieur
- **Compte Google Play Console** ($25 USD, paiement unique)
  - Inscription sur https://play.google.com/console/signup

## 📦 Installation de Capacitor (Déjà fait)

Capacitor est déjà configuré dans le projet. Voici ce qui a été fait :

```json
// package.json contient déjà:
"@capacitor/core": "^5.0.0",
"@capacitor/ios": "^5.0.0",
"@capacitor/android": "^5.0.0",
"@capacitor/push-notifications": "^5.0.0"
```

Configuration Firebase déjà en place:
- ✅ `android/app/google-services.json` (Android)
- ✅ `ios/App/GoogleService-Info.plist` (iOS)
- ✅ `capacitor.config.json` configuré

## 🚀 Étape 1: Build du Frontend

Avant de compiler l'app mobile, vous devez builder le frontend React:

```bash
cd /app/frontend
yarn build
```

Cela génère les fichiers optimisés dans le dossier `build/`.

## 📱 Étape 2: Synchroniser avec Capacitor

Après chaque modification du code web, synchronisez avec Capacitor:

```bash
npx cap sync
```

Cette commande:
- Copie le build web vers iOS et Android
- Met à jour les plugins natifs
- Synchronise les configurations

## 🍎 Étape 3A: Publication iOS (App Store)

### 3A.1: Ouvrir le Projet Xcode

```bash
npx cap open ios
```

Cela ouvre Xcode avec le projet iOS.

### 3A.2: Configuration dans Xcode

1. **Bundle Identifier**: Sélectionner le projet → Signing & Capabilities
   - Changer le Bundle ID: `com.profiremanager.app` (ou votre propre domaine)
   
2. **Team & Signing**:
   - Sélectionner votre équipe Apple Developer
   - Activer "Automatically manage signing"
   
3. **Version & Build Number**:
   - Version: `2.0.0` (ou votre version)
   - Build: `1` (incrémenter à chaque soumission)

4. **Permissions (Info.plist)**:
   Vérifier que ces permissions sont présentes (déjà configurées):
   ```xml
   <key>NSCameraUsageDescription</key>
   <string>Permet de prendre des photos pour les inspections EPI</string>
   
   <key>NSPhotoLibraryUsageDescription</key>
   <string>Permet d'accéder aux photos</string>
   
   <key>NSUserNotificationsUsageDescription</key>
   <string>Permet de recevoir des notifications de remplacements</string>
   ```

### 3A.3: Build & Archive

1. Dans Xcode: **Product → Archive**
2. Une fois l'archive créée, cliquer sur **Distribute App**
3. Choisir **App Store Connect**
4. Suivre les étapes de validation et soumission

### 3A.4: App Store Connect

1. Aller sur https://appstoreconnect.apple.com/
2. Créer une nouvelle app:
   - Nom: **ProFireManager**
   - Bundle ID: celui configuré dans Xcode
   - SKU: `profiremanager-2025`
3. Remplir les métadonnées:
   - Description
   - Screenshots (obligatoire: 6.5" iPhone, 12.9" iPad)
   - Icône de l'app (1024x1024px)
   - Catégorie: Productivité
4. Après l'upload depuis Xcode, sélectionner le build
5. Soumettre pour révision

**⏱️ Temps de révision Apple**: 24-48 heures en moyenne

## 🤖 Étape 3B: Publication Android (Google Play)

### 3B.1: Ouvrir le Projet Android Studio

```bash
npx cap open android
```

### 3B.2: Configuration Gradle

Éditer `android/app/build.gradle`:

```gradle
android {
    namespace "com.profiremanager.app"
    compileSdk 33
    
    defaultConfig {
        applicationId "com.profiremanager.app"
        minSdk 22
        targetSdk 33
        versionCode 1
        versionName "2.0.0"
    }
    
    signingConfigs {
        release {
            // Configuration de signature (voir étape suivante)
        }
    }
}
```

### 3B.3: Générer une Clé de Signature

```bash
keytool -genkey -v -keystore profiremanager-release.keystore \
  -alias profiremanager -keyalg RSA -keysize 2048 -validity 10000
```

**⚠️ IMPORTANT**: Sauvegarder cette clé et le mot de passe de manière sécurisée!

Créer `android/key.properties`:

```properties
storePassword=VOTRE_MOT_DE_PASSE
keyPassword=VOTRE_MOT_DE_PASSE
keyAlias=profiremanager
storeFile=../profiremanager-release.keystore
```

Ajouter à `android/app/build.gradle`:

```gradle
def keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file('key.properties')
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    ...
    signingConfigs {
        release {
            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
            storeFile file(keystoreProperties['storeFile'])
            storePassword keystoreProperties['storePassword']
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
```

### 3B.4: Build de Production (AAB)

```bash
cd android
./gradlew bundleRelease
```

Le fichier AAB sera généré dans:
`android/app/build/outputs/bundle/release/app-release.aab`

### 3B.5: Google Play Console

1. Aller sur https://play.google.com/console/
2. Créer une nouvelle application
3. Remplir les informations:
   - Nom: **ProFireManager**
   - Description courte et complète
   - Screenshots (obligatoire: téléphone, tablette 7" et 10")
   - Icône (512x512px)
   - Feature Graphic (1024x500px)
   - Catégorie: Productivité
   - Classification du contenu

4. **Production → Créer une nouvelle version**:
   - Uploader l'AAB
   - Notes de version
   - Soumettre pour révision

**⏱️ Temps de révision Google**: Quelques heures à quelques jours

## 🔔 Configuration Firebase Cloud Messaging

Les fichiers sont déjà en place, mais voici comment les obtenir si besoin:

### Pour Android (`google-services.json`)

1. Aller sur https://console.firebase.google.com/
2. Sélectionner votre projet
3. Ajouter une app Android
   - Package name: `com.profiremanager.app`
4. Télécharger `google-services.json`
5. Placer dans `android/app/`

### Pour iOS (`GoogleService-Info.plist`)

1. Dans la Firebase Console
2. Ajouter une app iOS
   - Bundle ID: `com.profiremanager.app`
3. Télécharger `GoogleService-Info.plist`
4. Placer dans `ios/App/App/`

### Clé Serveur FCM (Backend)

1. Firebase Console → Paramètres du projet → Cloud Messaging
2. Onglet "Cloud Messaging API (Legacy)" → Server Key
3. Copier la clé et l'ajouter dans `/app/backend/.env`:
   ```
   FCM_SERVER_KEY=VOTRE_CLE_SERVEUR_FCM
   ```

## 🧪 Test Local (Avant Publication)

### Test iOS (Simulateur)

```bash
npx cap run ios
```

### Test Android (Émulateur ou Appareil)

```bash
npx cap run android
```

### Test des Notifications Push

1. Connectez-vous sur un appareil physique
2. Créez une demande de remplacement
3. Vérifiez que la notification arrive sur les appareils des superviseurs

**⚠️ Note**: Les notifications push ne fonctionnent PAS sur les simulateurs/émulateurs, uniquement sur appareils physiques.

## 📝 Checklist Avant Publication

### ✅ iOS
- [ ] Bundle ID configuré
- [ ] Certificats et profiles de distribution configurés
- [ ] Version et build number à jour
- [ ] Screenshots pris (iPhone 6.5", iPad 12.9")
- [ ] Icône 1024x1024px créée
- [ ] GoogleService-Info.plist présent
- [ ] App testée sur appareil physique
- [ ] Permissions déclarées dans Info.plist
- [ ] App Store Connect: métadonnées remplies

### ✅ Android
- [ ] applicationId configuré
- [ ] Clé de signature générée et sauvegardée
- [ ] versionCode et versionName à jour
- [ ] Screenshots pris (téléphone, tablette 7", 10")
- [ ] Icône 512x512px créée
- [ ] Feature Graphic 1024x500px créée
- [ ] google-services.json présent
- [ ] App testée sur appareil physique
- [ ] Permissions déclarées dans AndroidManifest.xml
- [ ] Google Play Console: métadonnées remplies

## 🔄 Mises à Jour Futures

Pour publier une mise à jour:

1. **Modifier le code web** (React)
2. **Build**: `yarn build`
3. **Sync**: `npx cap sync`
4. **Incrémenter la version**:
   - iOS: Build number dans Xcode
   - Android: `versionCode` dans `build.gradle`
5. **Rebuild et soumettre** selon les étapes ci-dessus

## 🆘 Résolution de Problèmes

### "Build failed" sur iOS
- Vérifier que Xcode est à jour
- Nettoyer le build: Product → Clean Build Folder
- Vérifier les certificats dans Signing & Capabilities

### "Build failed" sur Android
- Vérifier Java JDK version: `java -version`
- Nettoyer: `cd android && ./gradlew clean`
- Vérifier que `google-services.json` est présent

### Notifications ne fonctionnent pas
- Vérifier Firebase credentials backend
- Vérifier device tokens dans la DB: `db.device_tokens.find()`
- Tester uniquement sur appareil physique
- Vérifier les permissions dans l'app

## 📚 Ressources Utiles

- **Capacitor Docs**: https://capacitorjs.com/docs
- **Firebase Push Notifications**: https://firebase.google.com/docs/cloud-messaging
- **Apple Developer**: https://developer.apple.com/
- **Google Play Console**: https://play.google.com/console/
- **App Store Connect**: https://appstoreconnect.apple.com/

## ✅ Status Actuel de l'Implémentation

**✅ Complété:**
- Configuration Capacitor
- Fichiers Firebase (google-services.json, GoogleService-Info.plist)
- Service de notifications push frontend (`pushNotifications.js`)
- Endpoints backend pour device tokens
- Initialisation auto des notifications au login
- Notifications push pour "Demande de remplacement"

**📱 Prêt pour:**
- Compilation iOS
- Compilation Android
- Tests sur appareils physiques
- Publication sur les stores

---

**🎉 L'application est maintenant prête pour la publication mobile!**

Pour toute question ou assistance, consultez la documentation Capacitor ou contactez le support technique.
