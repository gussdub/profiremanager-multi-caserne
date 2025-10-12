# 📱 Guide de Configuration - App Stores & Firebase

Ce guide t'accompagne étape par étape pour publier ProFireManager sur App Store et Google Play.

---

## 🔥 ÉTAPE 1 : Créer un Projet Firebase

### 1.1 Créer un compte Firebase
1. Va sur https://console.firebase.google.com/
2. Connecte-toi avec un compte Google (gratuit)
3. Clique sur "Ajouter un projet"
4. Nom du projet : **ProFireManager**
5. Accepte les conditions → Créer le projet

### 1.2 Ajouter une application Android
1. Dans la console Firebase, clique sur l'icône **Android**
2. **Nom du package Android** : `com.profiremanager.app`
3. Télécharge le fichier **`google-services.json`**
4. **IMPORTANT** : Enregistre ce fichier, tu en auras besoin !

### 1.3 Ajouter une application iOS
1. Dans la console Firebase, clique sur l'icône **iOS**
2. **ID du bundle iOS** : `com.profiremanager.app`
3. Télécharge le fichier **`GoogleService-Info.plist`**
4. **IMPORTANT** : Enregistre ce fichier aussi !

### 1.4 Télécharger la Clé de Compte de Service (Backend)
1. Va dans **Paramètres du projet** (icône engrenage) → **Comptes de service**
2. Clique sur "**Générer une nouvelle clé privée**"
3. Télécharge le fichier JSON (ex: `profiremanager-firebase-adminsdk-xxxxx.json`)
4. **IMPORTANT** : Garde ce fichier en sécurité, il contient des informations sensibles !

---

## 🍎 ÉTAPE 2 : Apple Developer Account

### 2.1 Créer un compte Apple Developer
1. Va sur https://developer.apple.com/programs/enroll/
2. Connecte-toi avec ton Apple ID
3. Clique sur "**Enroll**"
4. Choisis "**Individual**" (compte personnel)
5. Remplis les informations demandées
6. **Paiement** : 99 USD/an (carte de crédit requise)
7. Attends la confirmation (peut prendre 24-48h)

### 2.2 Informations Requises
- Nom complet
- Adresse complète
- Numéro de téléphone
- Carte de crédit (Visa, Mastercard, Amex)
- Apple ID vérifié

### 2.3 Après Validation
Tu recevras un email de confirmation. Tu pourras alors accéder à :
- **App Store Connect** : https://appstoreconnect.apple.com/
- **Certificates, Identifiers & Profiles** : https://developer.apple.com/account/

---

## 🤖 ÉTAPE 3 : Google Play Developer Account

### 3.1 Créer un compte Google Play Console
1. Va sur https://play.google.com/console/signup
2. Connecte-toi avec un compte Google
3. Clique sur "**Create account**"
4. Choisis "**Individual**" (compte personnel)
5. **Paiement unique** : 25 USD (carte de crédit requise)
6. Accepte les accords de développeur

### 3.2 Informations Requises
- Nom du développeur (sera visible sur le store)
- Adresse email de contact
- Adresse complète
- Carte de crédit (paiement unique de 25$)

### 3.3 Vérification
- Le compte est généralement activé en quelques heures
- Tu recevras un email de confirmation
- Accès à Google Play Console : https://play.google.com/console/

---

## 📧 ÉTAPE 4 : Envoie-moi les Fichiers

Une fois que tu as tout, envoie-moi les fichiers suivants :

### Fichiers Firebase
- ✅ `google-services.json` (Android)
- ✅ `GoogleService-Info.plist` (iOS)
- ✅ `profiremanager-firebase-adminsdk-xxxxx.json` (Backend)

### Informations Comptes
- ✅ Confirmation que ton compte Apple Developer est actif
- ✅ Confirmation que ton compte Google Play est actif

**Comment m'envoyer les fichiers ?**
Tu peux :
1. Les copier directement dans le chat (pour les petits fichiers .json)
2. Me les décrire (je te dirai où les placer)

---

## ⏭️ ÉTAPE 5 : Ce que je vais faire ensuite

Une fois que j'ai tes fichiers, je vais :

### 5.1 Configuration Firebase (10 min)
- Placer `google-services.json` dans `/app/frontend/android/app/`
- Placer `GoogleService-Info.plist` dans `/app/frontend/ios/App/`
- Placer la clé admin Firebase dans `/app/backend/`
- Configurer les variables d'environnement

### 5.2 Backend - Routes Notifications (1-2h)
- Routes pour enregistrer les device tokens
- Routes pour envoyer des notifications push
- Logique automatique :
  - Notification nouveau remplacement disponible
  - Notification validation planning
  - (Autres selon tes besoins)

### 5.3 Frontend - Intégration (1h)
- Initialiser les notifications push au login
- Gérer les permissions
- Tester la réception

### 5.4 Build & Test (2-3h)
- Build production Android (.aab)
- Build production iOS (.ipa)
- Test sur simulateurs/émulateurs
- Test des notifications

### 5.5 Publication (2-3 jours)
- Créer les fiches App Store et Google Play
- Upload des builds
- Soumettre pour review
- Support pendant la validation

---

## 💰 Récapitulatif des Coûts

| Service | Coût | Fréquence |
|---------|------|-----------|
| Apple Developer | 99 USD | Par an |
| Google Play | 25 USD | Une fois |
| Firebase | **GRATUIT** | - |
| **TOTAL Année 1** | **124 USD** | - |
| **Années suivantes** | **99 USD/an** | Apple seulement |

---

## ❓ Questions Fréquentes

**Q : Combien de temps ça prend ?**
- Apple Developer : 24-48h de validation
- Google Play : Quelques heures
- Firebase : Immédiat

**Q : Puis-je utiliser un autre compte Google pour Firebase ?**
- Oui ! N'importe quel compte Google fonctionne.

**Q : Est-ce que je peux annuler mon compte Apple Developer ?**
- Oui, mais tu ne seras pas remboursé. L'app sera retirée de l'App Store.

**Q : Les utilisateurs devront-ils payer pour télécharger l'app ?**
- Non ! L'app sera **gratuite** sur les deux stores.

---

## 🚀 Prochaines Étapes

1. **Maintenant** : Crée ton compte Firebase (10 min)
2. **Aujourd'hui** : Inscris-toi à Apple Developer (attente 24-48h)
3. **Aujourd'hui** : Inscris-toi à Google Play (activé en quelques heures)
4. **Dès que validé** : Envoie-moi les fichiers
5. **Je prends le relais** : Configuration + Build + Publication

---

## 📞 Besoin d'Aide ?

Si tu as des questions à n'importe quelle étape, demande-moi ! Je suis là pour t'aider. 💪

**Note** : Garde précieusement tous tes identifiants et fichiers de configuration !

---

**Dernière mise à jour** : Janvier 2025
**ProFireManager** - Gestion intelligente de service incendie 🚒
