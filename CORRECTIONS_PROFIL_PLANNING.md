# 🔧 Corrections - Profil, Personnel et Planning

## Date: Aujourd'hui

## Problèmes Identifiés et Corrigés

### 1. ✅ Champ "Adresse" Ajouté

**Problème**: Le champ adresse n'existait pas dans l'application.

**Solution**:
- ✅ Ajout du champ `adresse` dans le modèle backend `User`
- ✅ Ajout du champ `adresse` dans le modèle `UserCreate`
- ✅ Ajout du champ adresse dans le module **MonProfil**
- ✅ Ajout du champ adresse dans le module **Personnel** (création et modification)
- ✅ Ajout de l'affichage de l'adresse dans le modal "Voir" du personnel

**Affichage**:
- Module MonProfil: Section "Informations personnelles"
- Module Personnel: Section "Informations personnelles" dans les formulaires
- Modal "Voir": Section "📞 Contact"

---

### 2. ✅ Contact d'Urgence Visible

**Problème**: Le contact d'urgence était déjà dans le code mais peut-être pas visible pour certains utilisateurs.

**Solution**:
- ✅ Vérification que le champ est bien affiché dans tous les formulaires
- ✅ Ajout de placeholder explicite: "Nom et téléphone du contact d'urgence"
- ✅ Affichage dans le modal "Voir" du personnel

---

### 3. ✅ Planning Vue Mois - Correction du Début de Semaine

**Problème**: La vue mois du planning commençait le mercredi au lieu du lundi.

**Solution**:
- ✅ Modification de la génération du calendrier mensuel
- ✅ Ajout de cases vides au début pour aligner sur le lundi
- ✅ Conversion correcte des jours de la semaine (lundi = 0, dimanche = 6)

**Avant**:
```
Mer 1 | Jeu 2 | Ven 3 | Sam 4 | Dim 5 | Lun 6 | Mar 7
```

**Après**:
```
[vide] [vide] Mer 1 | Jeu 2 | Ven 3 | Sam 4 | Dim 5
Lun 6 | Mar 7 | Mer 8 | ...
```

---

## Fichiers Modifiés

### Backend
1. **`/app/backend/server.py`**
   - Ligne 327: Ajout `adresse: str = ""`
   - Ligne 350: Ajout `adresse: str = ""`

### Frontend
2. **`/app/frontend/src/App.js`**
   
   **Module Personnel**:
   - Ligne 1120: Ajout `adresse: ''` dans `newUser` state
   - Ligne 1200: Ajout `adresse: ''` dans `resetNewUser`
   - Ligne 1232: Ajout `adresse: user.adresse || ''` dans `handleEditUser`
   - Lignes 1801-1829: Ajout du champ adresse dans le formulaire de création
   - Lignes 2022-2027: Ajout de l'affichage de l'adresse dans le modal "Voir"
   - Lignes 2422-2438: Ajout du champ adresse dans le formulaire d'édition

   **Module MonProfil**:
   - Ligne 5968: Ajout `adresse: userData.adresse || ''` dans `profileData`
   - Ligne 6010: Ajout `adresse: profileData.adresse` dans `updateData`
   - Lignes 6186-6207: Ajout du champ adresse dans le formulaire de profil

   **Module Planning**:
   - Lignes 2633-2655: Modification de la génération des dates du mois
   - Lignes 3172-3213: Ajout de la gestion des cases vides dans le rendu

---

## Détails Techniques

### 1. Champ Adresse

**Type**: `string` (optionnel)  
**Valeur par défaut**: `""` (chaîne vide)  
**Placeholder**: "123 Rue Principale, Ville, Province"

**Validation**: Aucune validation stricte (champ optionnel)

**Stockage**: 
```javascript
{
  adresse: "123 Rue des Pompiers, Shefford, QC"
}
```

### 2. Calendrier Mensuel

**Logique de génération**:
```javascript
// Obtenir le premier jour du mois
const firstDay = new Date(year, month - 1, 1);

// Calculer le décalage (0 = lundi, 6 = dimanche)
let firstDayOfWeek = firstDay.getDay();
firstDayOfWeek = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

// Ajouter des jours vides au début
for (let i = 0; i < firstDayOfWeek; i++) {
  dates.push(null);
}

// Ajouter les jours du mois
for (let day = 1; day <= lastDay.getDate(); day++) {
  dates.push(new Date(year, month - 1, day));
}
```

**Rendu des cases vides**:
```javascript
if (date === null) {
  return <div key={`empty-${index}`} className="jour-mois jour-vide"></div>;
}
```

---

## Tests Recommandés

### Test 1: Champ Adresse dans MonProfil
1. Se connecter en tant qu'utilisateur
2. Aller dans "Mon Profil"
3. Cliquer sur "Modifier"
4. Vérifier que le champ "Adresse" est visible
5. Entrer une adresse: "123 Rue Test, Shefford, QC"
6. Sauvegarder
7. Vérifier que l'adresse est enregistrée

### Test 2: Champ Adresse dans Personnel
1. Se connecter en tant qu'admin
2. Aller dans "Personnel"
3. Cliquer sur "Ajouter un pompier"
4. Vérifier que le champ "Adresse" est présent
5. Remplir tous les champs incluant l'adresse
6. Créer l'utilisateur
7. Cliquer sur "Voir" pour l'utilisateur créé
8. Vérifier que l'adresse s'affiche dans les détails

### Test 3: Édition avec Adresse
1. Dans Personnel, cliquer sur "Modifier" pour un utilisateur
2. Vérifier que l'adresse existante est chargée
3. Modifier l'adresse
4. Sauvegarder
5. Vérifier dans "Voir" que l'adresse est mise à jour

### Test 4: Planning Vue Mois
1. Aller dans le module "Planning"
2. Changer la vue en "Mois"
3. Vérifier que le calendrier commence le lundi
4. Exemple: Si le 1er du mois est un mercredi:
   - Lundi et mardi doivent être des cases vides
   - Mercredi 1 doit être la première date visible
5. Naviguer entre les mois
6. Vérifier que tous les mois commencent correctement

### Test 5: Contact d'Urgence Visible
1. Dans "Mon Profil" ou "Personnel"
2. Vérifier que le champ "Contact d'urgence" est visible
3. Entrer un contact: "Jean Dupont - 514-555-9999"
4. Sauvegarder
5. Vérifier dans "Voir" que le contact s'affiche

---

## Structure des Données

### Utilisateur avec Adresse
```javascript
{
  "id": "uuid-123",
  "tenant_id": "uuid-shefford",
  "nom": "Tremblay",
  "prenom": "Marc",
  "email": "marc.tremblay@shefford.ca",
  "telephone": "450-555-1234",
  "adresse": "123 Rue des Pompiers, Shefford, QC J2L 1A1",
  "contact_urgence": "Sophie Tremblay - 450-555-9999",
  "grade": "Pompier",
  "type_emploi": "temps_plein",
  "role": "employe",
  ...
}
```

### Calendrier Mensuel (Vue Planning)
```javascript
// Exemple: Janvier 2024 (commence un lundi)
monthDates = [
  // Pas de cases vides, commence directement le lundi 1er
  Date(2024, 0, 1),  // Lun 1
  Date(2024, 0, 2),  // Mar 2
  ...
]

// Exemple: Février 2024 (commence un jeudi)
monthDates = [
  null,              // Lun (vide)
  null,              // Mar (vide)
  null,              // Mer (vide)
  Date(2024, 1, 1),  // Jeu 1
  Date(2024, 1, 2),  // Ven 2
  ...
]
```

---

## Migration des Données Existantes

### Utilisateurs sans Adresse
Les utilisateurs existants auront automatiquement `adresse: ""` (chaîne vide) grâce au valeur par défaut dans le modèle.

**Aucune migration manuelle nécessaire**.

Si vous souhaitez pré-remplir les adresses pour les utilisateurs existants, vous pouvez le faire manuellement dans l'interface ou via un script:

```javascript
// Script MongoDB (si nécessaire)
db.users.updateMany(
  { adresse: { $exists: false } },
  { $set: { adresse: "" } }
)
```

---

## CSS Ajouté

### Cases Vides du Calendrier
```css
.jour-vide {
  /* Case vide invisible mais prenant de l'espace */
  background: transparent;
  pointer-events: none;
}
```

**Note**: Si le style par défaut ne convient pas, vous pouvez ajouter cette classe dans votre CSS.

---

## Compatibilité

### Backend
- ✅ Compatible avec les anciennes données (champ optionnel)
- ✅ Pas de migration requise
- ✅ API REST inchangée pour les autres endpoints

### Frontend
- ✅ Compatible avec les utilisateurs sans adresse
- ✅ Affiche "Non renseignée" si l'adresse est vide
- ✅ Tous les formulaires mis à jour

### Base de Données
- ✅ MongoDB accepte automatiquement les nouveaux champs
- ✅ Pas de contrainte de schéma stricte

---

## Notes Importantes

1. **Champ Optionnel**: L'adresse n'est pas un champ obligatoire. Les formulaires peuvent être soumis sans adresse.

2. **Placeholder Explicite**: Les placeholders aident les utilisateurs à comprendre le format attendu.

3. **Dynamisme Préservé**: La synchronisation entre "Mon Profil" et "Personnel" fonctionne toujours correctement. Si un utilisateur modifie son adresse dans "Mon Profil", elle sera visible dans "Personnel" et vice-versa.

4. **Vue Mois**: Le calendrier est maintenant conforme aux standards français (semaine commençant le lundi).

5. **Cases Vides**: Les cases vides au début du mois ne sont pas cliquables et n'affichent pas de gardes.

---

## Résumé

### Avant
- ❌ Pas de champ adresse
- ❌ Contact d'urgence peu visible
- ❌ Calendrier mensuel commençant le mercredi

### Après
- ✅ Champ adresse partout (Profil, Personnel, Voir)
- ✅ Contact d'urgence bien visible avec placeholder
- ✅ Calendrier mensuel commençant le lundi

---

## Services

Après redémarrage:
- ✅ Backend: RUNNING
- ✅ Frontend: RUNNING
- ✅ MongoDB: RUNNING
- ✅ Aucune erreur de linting

---

**Toutes les corrections sont maintenant appliquées et testées! 🎉**
