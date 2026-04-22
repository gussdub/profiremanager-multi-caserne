# Guide d'intégration CAUCA API CAD Transfert

## 📚 Vue d'ensemble

Ce guide explique comment configurer l'intégration de l'API CAUCA CAD Transfert dans ProFireManager.

## 🔑 Prérequis

### 1. Certificat SSL Client

Vous devez générer un CSR (Certificate Signing Request) et l'envoyer à CAUCA pour obtenir un certificat signé.

**Étapes:**

```bash
# 1. Générer le CSR et la clé privée
openssl req -new -newkey ec \
    -pkeyopt ec_paramgen_curve:prime256v1 \
    -nodes \
    -keyout private.key \
    -out request.csr \
    -subj "/CN=VotreNomOrganisation"

# 2. Envoyer le fichier request.csr par email à:
ghislain.landry@cauca.ca

# 3. CAUCA vous retournera un certificat signé (certificate.pem)

# 4. IMPORTANT: Conserver précieusement le fichier private.key
```

### 2. Token SSI

CAUCA doit vous fournir un **token SSI** unique pour chaque service incendie.

---

## ⚙️ Configuration dans l'interface Admin

### Étape 1: Créer la configuration CAUCA

1. Connectez-vous en tant que **Super Admin**
2. Accédez à `/admin` → **Centrales 911**
3. Cliquez sur **+ Ajouter une centrale CAUCA API**

**Paramètres:**

| Champ | Description | Valeur par défaut |
|-------|-------------|-------------------|
| **URL de l'API** | URL de production CAUCA | `https://cad-transfert.cauca.ca/api` |
| **Token SSI** | Token fourni par CAUCA | *(fourni par CAUCA)* |
| **Intervalle de polling (secondes)** | Fréquence de vérification | `300` (5 minutes) |
| **Actif** | Activer/désactiver | ✅ Oui |
| **Description** | Note optionnelle | *Ex: CAUCA - Chaudière-Appalaches* |

### Étape 2: Upload des certificats SSL

1. Cliquez sur **📁 Upload Certificat**
2. Sélectionnez le fichier `certificate.pem` (reçu de CAUCA)
3. Cliquez sur **🔐 Upload Clé Privée**
4. Sélectionnez le fichier `private.key` (généré localement)

**⚠️ IMPORTANT:** Gardez la clé privée confidentielle et ne la partagez jamais.

### Étape 3: Démarrer la surveillance

1. Vérifiez que les deux fichiers (certificat + clé) sont uploadés ✅
2. Cliquez sur **▶️ Démarrer la surveillance**
3. Le statut devrait passer à **🟢 Actif**

---

## 🔄 Fonctionnement

### Mode de fonctionnement: Polling

L'API CAUCA fonctionne en **polling** (interrogation périodique), pas en webhook push.

**Flux:**

```
1. ProFireManager interroge GET /CallingCardEvents toutes les N secondes (paramétrable)
   └─> Retourne la liste des nouveaux événements

2. Pour chaque nouvel événement:
   ├─> Type 0 (Création): Récupère GET /CallingCards/{cardNumber}
   │   └─> Parse et importe la carte d'appel dans ProFireManager
   ├─> Type 1 (Annulation): Marque l'intervention comme annulée
   └─> Type 2 (Fermeture): Marque l'intervention comme terminée
```

### Données importées

Chaque carte d'appel CAUCA contient:

- **Identifiants**: Numéro de carte, numéro de dossier
- **Type d'intervention**: Code + libellé (ex: "10 - ALARME INCENDIE")
- **Adresse complète**: Civique, rue, ville, secteurs incendie
- **Chronologie**: Appel, alerte, arrivée, sous contrôle, terminée
- **Véhicules déployés**: Numéros, types, équipage, chronologie
- **Matricules (pompiers)**: Noms, chronologie individuelle
- **Ressources externes**: Police, ambulance, etc.
- **Officiers**: En charge, communication
- **Commentaires**: Libres + rapports de situation
- **Entraide**: Services externes demandés

---

## 📊 Codes d'intervention CAUCA

37 codes sont préchargés dans la base de données:

| Code | Type | Exemples |
|------|------|----------|
| **10-11** | Alarmes | Alarme incendie, Alarme gaz |
| **12-13** | Véhicules | Véhicule motorisé, Entraide |
| **21-33** | Incendies | Cheminée, Déversement, Fuite de gaz |
| **40-50** | Infrastructure | Installation électrique, Forêt |
| **80** | **Bâtiment** | Incendie de bâtiment (commercial, résidentiel, agricole) |
| **90-98** | Sauvetages | Nautique, Aéronef, Désincarcération |
| **110-130** | Médical/Entraide | Premiers répondants, PIABS, Entraide automatique |
| **999** | Pratique | Exercices |

---

## 🛠️ Dépannage

### Le polling ne démarre pas

**Vérifications:**

1. ✅ Certificat SSL uploadé?
2. ✅ Clé privée uploadée?
3. ✅ Token SSI correct?
4. ✅ Configuration "Actif" = Oui?

**Logs backend:**

```bash
tail -f /var/log/supervisor/backend.err.log | grep CAUCA
```

### Aucun événement reçu

1. Vérifier que CAUCA envoie bien les alertes vers votre service
2. Tester l'authentification manuellement (optionnel)
3. Vérifier les logs d'erreur API

### Erreur 403 (Non autorisé)

- **Cause probable**: Token SSI invalide
- **Solution**: Vérifier le token avec CAUCA

### Erreur 400 (Certificat manquant)

- **Cause**: Certificat ou clé privée non uploadé
- **Solution**: Re-uploader les deux fichiers

---

## 🔐 Sécurité

### Bonnes pratiques

1. **Ne jamais partager** la clé privée (`private.key`)
2. **Stocker les certificats** dans Azure Blob Storage (automatique)
3. **Logs d'audit**: Toutes les actions admin sont tracées
4. **Rotation des certificats**: Renouveler périodiquement avec CAUCA

---

## 📞 Support CAUCA

**Contact technique:**
- Email: ghislain.landry@cauca.ca
- Documentation: https://cauca.atlassian.net/wiki/spaces/GU/pages/4394647623/

**Pour demander:**
- Certificat SSL (après envoi du CSR)
- Token SSI pour votre service incendie
- Aide à l'intégration

---

## 🚀 Test après configuration

### 1. Vérifier le statut

- Aller dans `/admin` → Centrales 911
- Cliquer sur **📊 Voir le statut**
- Vérifier:
  - ✅ Polling actif
  - ✅ Dernière vérification (< 5-10 minutes)
  - ✅ Aucune erreur

### 2. Attendre une vraie alerte

- CAUCA enverra automatiquement les nouvelles cartes
- Elles apparaîtront dans le module **Interventions** de ProFireManager
- Source: `cauca_api`

### 3. Tester manuellement (optionnel)

Si vous souhaitez déclencher manuellement une vérification:

1. Aller dans `/admin` → Centrales 911 → CAUCA
2. Cliquer sur **🔄 Vérifier maintenant**

---

## 📝 Maintenance

### Changer l'intervalle de polling

1. `/admin` → Centrales 911 → CAUCA → **✏️ Modifier**
2. Ajuster "Intervalle de vérification (secondes)"
3. **Recommandations:**
   - **Normal**: 300 secondes (5 minutes)
   - **Haute fréquence**: 60-120 secondes (charge serveur +)
   - **Basse fréquence**: 600 secondes (10 minutes) - délai de réception +

### Arrêter temporairement

1. `/admin` → Centrales 911 → CAUCA → **⏸️ Arrêter la surveillance**
2. Le polling s'arrête immédiatement
3. Pour redémarrer: **▶️ Démarrer la surveillance**

### Désactiver complètement

1. `/admin` → Centrales 911 → CAUCA → **✏️ Modifier**
2. Décocher "Actif"
3. Enregistrer

---

## 🔄 Compatibilité avec SMTP (Alerte Santé)

**Aucune modification nécessaire!**

Le système SMTP existant pour les alertes "Alerte Santé" (Premiers Répondants) continue de fonctionner exactement comme avant.

**Architecture actuelle:**
- **CAUCA Incendie** → API CAUCA CAD Transfert (nouveau)
- **Alerte Santé** → SMTP (inchangé)

Les deux systèmes coexistent sans conflit.

---

## ✅ Checklist de mise en production

- [ ] CSR généré et envoyé à ghislain.landry@cauca.ca
- [ ] Certificat signé reçu de CAUCA
- [ ] Token SSI reçu de CAUCA
- [ ] Configuration CAUCA créée dans `/admin`
- [ ] Certificat SSL uploadé
- [ ] Clé privée uploadée
- [ ] Surveillance démarrée
- [ ] Statut vérifié (✅ Actif)
- [ ] Première alerte reçue et importée avec succès

---

**Date de création:** Décembre 2025
**Version:** 1.0
**Contact support ProFireManager:** [votre email support]
