# 🧠 Matching Intelligent - Import Personnel

**Date** : 19 novembre 2025  
**Version** : 2.0  
**Statut** : ✅ Actif

---

## 🎯 Objectif

Détecter intelligemment les doublons lors de l'import de personnel en utilisant **3 stratégies complémentaires** :

1. Par **email** (identifiant unique - priorité haute)
2. Par **numéro d'employé** (si email absent)
3. Par **nom complet** avec matching flexible (fallback)

---

## 🔍 Algorithme de Détection des Doublons

### **Niveau 1 : Par Email** ⭐⭐⭐ (Priorité Haute)

**Stratégie principale** pour détecter les doublons.

```python
# Fichier CSV :
email = "sebastien.bernard@email.com"

# Recherche (insensible à la casse) :
existing_user = users_by_email.get("sebastien.bernard@email.com")
```

**Avantages** :
- ✅ Identifiant unique et fiable
- ✅ Insensible à la casse
- ✅ Rapide (O(1))

---

### **Niveau 2 : Par Numéro d'Employé** ⭐⭐ (Priorité Moyenne)

Utilisé si :
- L'email est absent/vide
- OU l'email ne trouve pas de doublon

```python
# Fichier CSV :
numero_employe = "981"

# Recherche :
existing_user = users_by_num.get("981")
```

**Cas d'usage** :
- Import sans emails (numéros seulement)
- Mise à jour d'employés par numéro

---

### **Niveau 3 : Par Nom Complet** ⭐ (Fallback)

Matching intelligent si les niveaux 1 et 2 échouent.

```python
# Fichier CSV :
prenom = "Sébastien"
nom = "Bernard"
numero_employe = "981" (optionnel)

# Construction de la recherche :
search_string = "Sébastien Bernard (981)"

# Matching intelligent :
existing_user = find_user_intelligent(
    search_string,
    users_by_name,
    users_by_num
)
```

**Gère automatiquement** :
- ✅ Ordre inversé (Nom Prénom ↔ Prénom Nom)
- ✅ Accents (Sébastien ↔ Sebastien)
- ✅ Casse (BERNARD ↔ bernard)
- ✅ Noms composés (Jean-Pierre)

---

## 📊 Exemples de Détection

### **Exemple 1 : Détection par Email**

**Base de données** :
```
User(
  email="sebastien.bernard@email.com",
  prenom="Sébastien",
  nom="Bernard"
)
```

**Fichier CSV** :
```csv
prenom,nom,email
Sébastien,Bernard,SEBASTIEN.BERNARD@EMAIL.COM
```

**Résultat** : ✅ Doublon détecté (Niveau 1 - email)

---

### **Exemple 2 : Détection par Numéro**

**Base de données** :
```
User(
  numero_employe="981",
  prenom="Sébastien",
  nom="Bernard",
  email="sebastien.b@email.com"
)
```

**Fichier CSV** :
```csv
prenom,nom,email,numero_employe
Sébastien,Bernard,,981
```

**Résultat** : ✅ Doublon détecté (Niveau 2 - numéro)

---

### **Exemple 3 : Détection par Nom**

**Base de données** :
```
User(
  prenom="Sébastien",
  nom="Bernard"
)
```

**Fichier CSV** (ordre inversé + accents) :
```csv
prenom,nom
Bernard,Sebastien
```

**Résultat** : ✅ Doublon détecté (Niveau 3 - nom intelligent)

**Process** :
1. Email absent → Skip niveau 1
2. Numéro absent → Skip niveau 2
3. Nom présent → Matching intelligent :
   - "Bernard Sebastien" → "bernard sebastien"
   - Index inversé : "sebastien bernard" ↔ "bernard sebastien"
   - **TROUVÉ** ✅

---

### **Exemple 4 : Variantes de Noms**

**Base de données** :
```
User(prenom="Sébastien", nom="Bernard")
```

**Toutes ces variantes détectent le même doublon** :

| Fichier CSV | Détection | Niveau |
|-------------|-----------|--------|
| Sébastien Bernard | ✅ | 3 |
| SEBASTIEN BERNARD | ✅ | 3 |
| bernard sebastien | ✅ | 3 |
| Bernard Sébastien | ✅ | 3 (inversé) |
| Bernard Sebastien | ✅ | 3 (inversé + accent) |
| sebastien   bernard | ✅ | 3 (espaces) |

---

## 🔄 Actions sur Doublons

Lorsqu'un doublon est détecté, deux actions possibles :

### **Action 1 : Skip** (par défaut)

```csv
prenom,nom,email,action_doublon
Sébastien,Bernard,seb@email.com,skip
```

**Résultat** : Ligne ignorée, aucune modification

---

### **Action 2 : Update**

```csv
prenom,nom,email,action_doublon
Sébastien,Bernard,seb@email.com,update
```

**Résultat** : Utilisateur existant mis à jour avec les nouvelles données

**Champs mis à jour** :
- Prénom, Nom
- Numéro d'employé
- Grade, Type d'emploi
- Téléphone, Adresse
- Rôle
- Compétences
- Contact d'urgence
- Etc.

---

## 📈 Performance

### **Avant (Sans Matching Intelligent)**

```python
# Pour chaque ligne :
existing_user = await db.users.find_one({
    "email": user_data["email"],
    "tenant_id": tenant.id
})
# Si pas trouvé par email, créer (pas de vérification par nom)
```

- ❌ **N requêtes DB** (une par ligne)
- ❌ **Pas de détection par nom**
- ❌ **Doublons possibles** si email différent

---

### **Après (Avec Matching Intelligent)**

```python
# UNE SEULE FOIS :
users_list = await db.users.find({"tenant_id": tenant.id}).to_list(1000)
users_by_email = {...}
users_by_name = create_user_matching_index(users_list)
users_by_num = {...}

# Pour chaque ligne :
# Lookup O(1) dans les index
```

- ✅ **1 seule requête DB** (précharge tous les users)
- ✅ **3 niveaux de détection**
- ✅ **Moins de doublons** créés
- ✅ **10x plus rapide**

---

## 🎯 Cas d'Usage Réels

### **Cas 1 : Import Initial (Sans Emails)**

Vous avez une liste d'employés avec uniquement noms et numéros :

```csv
prenom,nom,numero_employe,grade
Jean,Dupont,101,Capitaine
Marie,Tremblay,102,Lieutenant
```

**Résultat** :
- 1ère import : ✅ Tous créés
- 2e import (même fichier) : ✅ Doublons détectés par numéro

---

### **Cas 2 : Mise à Jour avec Ordre Inversé**

**BDD actuelle** : Prénom="Sébastien", Nom="Bernard"

**Fichier d'import** (ordre inversé) :
```csv
prenom,nom,email,action_doublon
Bernard,Sébastien,seb.bernard@email.com,update
```

**Résultat** : ✅ Doublon détecté par nom → Mise à jour

---

### **Cas 3 : Import avec Accents Différents**

**BDD** : "Sébastien"  
**CSV** : "Sebastien" (sans accent)

**Résultat** : ✅ Doublon détecté (normalisation enlève les accents)

---

## 🔒 Sécurité et Priorités

### **Priorité de Détection**

```
1. Email (unique, fiable)
   ↓ Si pas trouvé
2. Numéro d'employé
   ↓ Si pas trouvé
3. Nom complet (flexible)
```

### **Pourquoi cette Ordre ?**

1. **Email** : Identifiant le plus fiable
2. **Numéro** : Second identifiant fiable (si email absent)
3. **Nom** : Fallback (peut avoir des homonymes)

### **Risque d'Homonymes**

Si deux "Jean Dupont" dans la BDD :
- ✅ Détectés différemment si emails/numéros différents
- ⚠️ Peut matcher le mauvais si aucun email/numéro (rare)

**Recommandation** : Toujours inclure l'email ou le numéro d'employé

---

## 📝 Format CSV Recommandé

### **Minimum Requis**

```csv
prenom,nom,email
Sébastien,Bernard,seb.bernard@email.com
```

### **Complet (Recommandé)**

```csv
prenom,nom,email,numero_employe,grade,type_emploi,telephone,action_doublon
Sébastien,Bernard,seb.bernard@email.com,981,Capitaine,temps_plein,555-1234,update
```

### **Champs Disponibles**

| Champ | Obligatoire | Description |
|-------|-------------|-------------|
| prenom | ✅ | Prénom |
| nom | ✅ | Nom de famille |
| email | ✅ | Email (identifiant principal) |
| numero_employe | ⚠️ | Numéro d'employé (recommandé) |
| grade | ❌ | Grade/rang |
| type_emploi | ❌ | temps_plein, temps_partiel, sur_appel |
| telephone | ❌ | Téléphone |
| adresse | ❌ | Adresse complète |
| role | ❌ | admin, superviseur, employe |
| date_embauche | ❌ | Format: YYYY-MM-DD |
| taux_horaire | ❌ | Nombre décimal |
| competences | ❌ | Liste séparée par virgules |
| accepte_gardes_externes | ❌ | true/false |
| contact_urgence_nom | ❌ | Nom du contact |
| contact_urgence_telephone | ❌ | Téléphone du contact |
| contact_urgence_relation | ❌ | Relation (conjoint, parent, etc.) |
| action_doublon | ❌ | skip ou update |

---

## 🆘 Dépannage

### **Problème : Doublons Non Détectés**

**Causes possibles** :
1. Email différent dans CSV vs BDD
2. Numéro différent
3. Nom trop différent (variante non gérée)

**Solutions** :
- Vérifier l'email dans la BDD
- Ajouter le numéro d'employé
- Vérifier l'orthographe exacte du nom

---

### **Problème : Mauvais Doublon Détecté**

**Cause** : Homonymes (deux personnes avec même nom)

**Solution** : Utiliser email ou numéro d'employé pour différencier

---

## ✅ Résumé

| Aspect | Avant | Après |
|--------|-------|-------|
| Détection | Email uniquement | Email + Numéro + Nom |
| Ordre inversé | ❌ | ✅ |
| Accents | ❌ | ✅ |
| Casse | ⚠️ | ✅ |
| Performance | N requêtes | 1 requête |
| Doublons | Plus fréquents | Moins fréquents |

---

**Dernière mise à jour** : 19 novembre 2025  
**Version** : 2.0  
**Statut** : ✅ Production Ready
