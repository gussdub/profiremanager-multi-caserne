# 🗑️ Instructions : Suppression Assignations Auto Décembre 2025

## ⚠️ ATTENTION - OPÉRATION SUR PRODUCTION

Ce script va supprimer des données de la base de **PRODUCTION**.

---

## 📋 Paramètres de Suppression

- **Base de données** : `profiremanager` (PRODUCTION)
- **Tenant** : `shefford`
- **Période** : 1er au 31 décembre 2025
- **Type** : Uniquement `assignation_type="auto"`
- **Préservé** : Les assignations manuelles (`assignation_type="manuel"`) ne seront PAS touchées

---

## 🚀 Comment Exécuter le Script

### Étape 1 : Télécharger le Script

Le script se trouve à : `/app/supprimer_assignations_auto_decembre.py`

Copiez-le sur votre machine locale.

### Étape 2 : Installer les Dépendances

```bash
pip install pymongo
```

### Étape 3 : Exécuter le Script

```bash
python supprimer_assignations_auto_decembre.py
```

### Étape 4 : Suivre les Instructions

Le script va :
1. ✅ Se connecter à la base de production
2. ✅ Trouver le tenant shefford
3. ✅ Lister toutes les assignations auto de décembre 2025
4. ✅ Afficher un résumé détaillé avec :
   - Nombre total d'assignations
   - Exemples d'assignations
   - Répartition par type de garde
   - Répartition par date
5. ⚠️ Demander une confirmation explicite
6. 🗑️ Supprimer uniquement après confirmation

### Étape 5 : Confirmation

Pour confirmer la suppression, vous devrez taper :
```
SUPPRIMER
```
(en majuscules, exactement comme ça)

Si vous tapez autre chose ou annulez (Ctrl+C), aucune donnée ne sera supprimée.

---

## 🔍 Aperçu du Script

### Ce que le script fait

```python
# Critères de suppression
criteres = {
    "tenant_id": tenant_id_shefford,
    "date": {
        "$gte": "2025-12-01",
        "$lte": "2025-12-31"
    },
    "assignation_type": "auto"
}

# Suppression
db.assignations.delete_many(criteres)
```

### Ce que le script NE fait PAS

- ❌ Ne touche PAS aux assignations manuelles
- ❌ Ne touche PAS aux autres tenants (demo, etc.)
- ❌ Ne touche PAS aux autres mois (novembre, janvier, etc.)
- ❌ Ne supprime rien avant votre confirmation explicite

---

## 📊 Exemple de Sortie

```
================================================================================
🗑️  SUPPRESSION ASSIGNATIONS AUTOMATIQUES - DÉCEMBRE 2025
================================================================================
Base de données : profiremanager (PRODUCTION)
Tenant          : shefford
Période         : 2025-12-01 à 2025-12-31
Type            : assignation_type='auto' uniquement
================================================================================

📡 Connexion à MongoDB Atlas (Production)...
✅ Connexion réussie

🔍 Recherche du tenant 'shefford'...
✅ Tenant trouvé: Service Incendie de Shefford (ID: xxx)

🔍 Recherche des assignations automatiques de décembre 2025...
⚠️  125 assignations automatiques trouvées

📋 Aperçu des assignations qui seront supprimées:
--------------------------------------------------------------------------------
  1. 2025-12-01 - Jean Dupont - Garde Interne LMM
  2. 2025-12-01 - Marie Tremblay - Garde Externe 
  3. 2025-12-02 - Pierre Moreau - Garde Interne LMM
  ...
--------------------------------------------------------------------------------

📊 Résumé par type de garde:
--------------------------------------------------------------------------------
  • Garde Interne LMM: 80 assignations
  • Garde Externe: 45 assignations
--------------------------------------------------------------------------------

📊 Résumé par date:
--------------------------------------------------------------------------------
  • 2025-12-01: 4 assignations
  • 2025-12-02: 4 assignations
  • 2025-12-03: 4 assignations
  ...
--------------------------------------------------------------------------------

⚠️  ATTENTION: Cette opération va supprimer définitivement ces assignations !
⚠️  Cette action est IRRÉVERSIBLE !

Tapez 'SUPPRIMER' en majuscules pour confirmer la suppression: 
```

---

## 🛡️ Sécurités Intégrées

1. **Prévisualisation complète** : Vous voyez exactement ce qui sera supprimé
2. **Confirmation explicite** : Tapez "SUPPRIMER" pour confirmer
3. **Critères précis** : Seulement auto, seulement décembre, seulement shefford
4. **Vérification finale** : Le script vérifie qu'il ne reste rien après suppression
5. **Gestion d'erreurs** : En cas d'erreur, rien n'est supprimé

---

## 🆘 En Cas de Problème

### Le script ne trouve pas le tenant

```
❌ ERREUR: Tenant 'shefford' non trouvé !
```

**Solution** : Vérifier que le slug du tenant est bien "shefford" dans la base.

### Erreur de connexion MongoDB

```
❌ ERREUR: connection refused
```

**Solution** : Vérifier que votre IP est autorisée dans MongoDB Atlas Network Access.

### Aucune assignation trouvée

```
✅ Aucune assignation automatique trouvée pour cette période.
```

**C'est bon signe !** Cela signifie qu'il n'y a rien à supprimer.

---

## 📝 Après la Suppression

Une fois la suppression effectuée :

1. ✅ Vérifiez sur www.profiremanager.ca/shefford que le planning de décembre est correct
2. ✅ Les utilisateurs peuvent recréer des assignations manuelles si nécessaire
3. ✅ Vous pouvez relancer l'attribution automatique avec les bons paramètres

---

## ⚠️ Important

- Cette opération est **IRRÉVERSIBLE**
- Assurez-vous que vous voulez vraiment supprimer ces assignations
- En cas de doute, **NE PAS EXÉCUTER LE SCRIPT**
- Vous pouvez toujours demander de l'aide avant d'exécuter

---

## 📞 Support

Si vous avez des questions ou des doutes avant d'exécuter le script, demandez de l'aide.

**Ne vous précipitez pas.** Il vaut mieux prendre 5 minutes pour vérifier que de supprimer les mauvaises données.

---

**Date de création** : 19 novembre 2025  
**Cible** : Production - profiremanager - tenant shefford  
**Période** : Décembre 2025  
**Type** : Assignations automatiques uniquement
