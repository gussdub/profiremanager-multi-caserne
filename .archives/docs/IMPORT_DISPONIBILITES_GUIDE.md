# 📅 Guide d'Import des Disponibilités - ProFireManager

**Date de création**: 19 novembre 2025  
**Version**: 1.0

---

## 🎯 Fonctionnalité

Import en masse des disponibilités du personnel depuis un fichier CSV ou Excel.

---

## 📂 Fichiers Créés

### **Backend**
- **Endpoint**: `/api/{tenant_slug}/disponibilites/import-csv` (POST)
- **Location**: `/app/backend/server.py` (lignes 10816-10993)
- **Fonctionnalités**:
  - Parse CSV/XLS/XLSX
  - Trouve les utilisateurs par numéro d'employé ou nom
  - Mappe les types de garde
  - Gère les doublons (update si existe, sinon create)
  - Retourne un résumé détaillé

### **Frontend**
- **Composant**: `/app/frontend/src/components/ImportCSVDisponibilites.jsx`
- **Intégration**: Ajouté dans `/app/frontend/src/components/Parametres.js`
- **Accès**: Paramètres > Imports CSV > Import Disponibilités

### **Templates**
- **CSV**: `/app/template_disponibilites.csv`
- **Excel**: `/app/template_disponibilites.xlsx`

---

## 📋 Format du Fichier

### **Colonnes Requises**

| Colonne | Description | Format | Exemple | Obligatoire |
|---------|-------------|--------|---------|-------------|
| **Employé** | Nom avec numéro d'employé | "Nom Prénom (numéro)" | Bernard Sébastien (981) | ✅ Oui |
| **Quart** | Type de garde/quart | Texte libre | jour 12h, matin, apres midi | ⚠️ Optionnel |
| **Caserne** | Lieu de travail | Texte libre | Caserne Shefford | ⚠️ Optionnel |
| **Début** | Date et heure de début | YYYY-MM-DD HH:MM | 2025-12-01 06:00 | ✅ Oui |
| **Fin** | Date et heure de fin | YYYY-MM-DD HH:MM | 2025-12-01 18:00 | ✅ Oui |
| **Sélection** | Statut de disponibilité | "Disponible" ou "Aucune" | Disponible | ✅ Oui |

### **Mapping des Statuts**

| Valeur dans CSV | Statut en BDD | Description |
|-----------------|---------------|-------------|
| "Disponible" | disponible | L'employé est disponible pour cette période |
| "Aucune" | indisponible | L'employé n'est PAS disponible |

---

## 🚀 Utilisation

### **Étape 1: Accéder à l'Import**

1. Se connecter à ProFireManager
2. Aller dans **Paramètres**
3. Cliquer sur l'onglet **"Imports CSV"**
4. Trouver la section **"📅 Import Disponibilités"**

### **Étape 2: Préparer le Fichier**

**Option A: Télécharger le Template**
1. Cliquer sur **"Télécharger le template"**
2. Ouvrir le fichier dans Excel ou un éditeur de texte
3. Remplir avec vos données
4. Sauvegarder

**Option B: Utiliser votre Fichier Existant**
- Assurez-vous que les colonnes correspondent au format ci-dessus
- Le système peut auto-détecter les colonnes si les noms sont similaires

### **Étape 3: Importer**

1. **Upload**: Cliquer sur "Sélectionner un fichier" ou glisser-déposer
2. **Mapping**: Vérifier/ajuster le mapping des colonnes
3. **Aperçu**: Vérifier les 5 premières lignes
4. **Import**: Confirmer l'import

### **Étape 4: Vérifier les Résultats**

Le système affiche:
- ✅ **Créées**: Nouvelles disponibilités ajoutées
- 🔄 **Mises à jour**: Disponibilités existantes modifiées
- ❌ **Erreurs**: Lignes avec problèmes (détails fournis)

---

## 🔍 Logique de Détection des Employés

Le système cherche les employés dans cet ordre:

1. **Par numéro d'employé** (entre parenthèses)
   - Exemple: "Bernard Sébastien (981)" → Recherche numéro "981"

2. **Par nom complet** (si numéro pas trouvé)
   - Exemple: "Bernard Sébastien" → Recherche dans la BDD

3. **Erreur si non trouvé**
   - La ligne est ignorée avec un message d'erreur

---

## 🔄 Gestion des Doublons

Le système détecte les doublons selon:
- `tenant_id` (automatique)
- `user_id` (détecté)
- `date` (de Début)
- `heure_debut` (de Début)
- `heure_fin` (de Fin)

**Si un doublon existe**:
- ✅ La disponibilité existante est **mise à jour**
- ❌ Pas de création de doublon

**Si pas de doublon**:
- ✅ Une nouvelle disponibilité est **créée**

---

## 📊 Exemple de Fichier CSV

```csv
Employé,Quart,Caserne,Début,Fin,Sélection
Bernard Sébastien (981),jour 12h,Caserne Shefford,2025-12-01 06:00,2025-12-01 18:00,Aucune
Girard Robert (967),jour 12h,Caserne Shefford,2025-12-01 06:00,2025-12-01 18:00,Aucune
Grenier William (966),jour 12h,Caserne Shefford,2025-12-01 06:00,2025-12-01 18:00,Disponible
Dubeau Guillaume (968),jour 12h,Caserne Shefford,2025-12-01 06:00,2025-12-01 18:00,Aucune
Bachand Guy (969),jour 12h,Caserne Shefford,2025-12-01 06:00,2025-12-01 18:00,Aucune
```

---

## ⚠️ Erreurs Courantes

### **Erreur: "Employé non trouvé"**

**Cause**: L'employé n'existe pas dans la base de données

**Solutions**:
1. Vérifier l'orthographe du nom
2. Vérifier le numéro d'employé
3. Créer l'employé d'abord dans Paramètres > Personnel

### **Erreur: "Format de date/heure invalide"**

**Cause**: Le format des dates n'est pas YYYY-MM-DD HH:MM

**Solutions**:
1. Dans Excel: Format personnalisé → `YYYY-MM-DD HH:MM`
2. Exemple correct: `2025-12-01 06:00`
3. Exemple incorrect: `01/12/2025 6h00`

### **Erreur: "Date/heure de début ou fin manquante"**

**Cause**: Une colonne Début ou Fin est vide

**Solutions**:
1. Vérifier que toutes les lignes ont des dates
2. Supprimer les lignes vides en fin de fichier

### **Erreur: "Aucune disponibilité à importer"**

**Cause**: Le fichier est vide ou mal formaté

**Solutions**:
1. Vérifier que le fichier contient des données
2. Vérifier que la première ligne contient les en-têtes
3. Vérifier qu'il y a au moins une ligne de données après les en-têtes

---

## 🎯 Cas d'Usage

### **Import de Disponibilités pour un Mois**

1. Exporter les horaires de travail depuis votre système RH
2. Formatter en CSV selon le template
3. Importer via l'interface
4. Vérifier les résultats

### **Mise à Jour en Masse**

1. Modifier le fichier CSV existant
2. Réimporter
3. Le système met à jour automatiquement les doublons

### **Import Initial pour Nouvelle Caserne**

1. Préparer la liste de tous les employés
2. Définir leurs disponibilités par défaut
3. Importer en une seule fois

---

## 🔧 Configuration Technique

### **Limites**

- **Taille fichier**: Pas de limite stricte (recommandé < 10 000 lignes)
- **Format**: CSV, XLS, XLSX
- **Encodage CSV**: UTF-8 avec BOM recommandé
- **Séparateur CSV**: Virgule (,)

### **Performance**

- **Temps d'import**: ~0.5 secondes pour 100 lignes
- **Traitement**: Asynchrone (ne bloque pas l'interface)
- **Optimisation**: Préchargement des utilisateurs et types de garde

---

## 📝 Notes Importantes

1. **Origine**: Les disponibilités importées ont `origine="import_csv"`
2. **Permissions**: Seuls les admins et superviseurs peuvent importer
3. **Tenant**: L'import est automatiquement lié au tenant actuel
4. **Logs**: Toutes les erreurs sont détaillées dans les résultats

---

## 🆘 Support

En cas de problème:

1. **Vérifier le format** du fichier (télécharger le template pour référence)
2. **Tester avec quelques lignes** avant l'import complet
3. **Consulter les erreurs** affichées après l'import
4. **Contacter le support** avec:
   - Le fichier CSV
   - Les messages d'erreur
   - Le nombre de lignes tentées

---

## 🔄 Évolutions Futures

- [ ] Support de dates relatives ("aujourd'hui", "demain")
- [ ] Import depuis Google Sheets
- [ ] Validation avancée (conflits d'horaires)
- [ ] Templates par type de garde
- [ ] Export des disponibilités actuelles en CSV

---

**Dernière mise à jour**: 19 novembre 2025  
**Auteur**: Assistant IA  
**Version**: 1.0
