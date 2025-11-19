# 🔧 Dépannage Import XLS - ProFireManager

## 🐛 Problème : Fichier XLS Grisé ou Non Sélectionnable

### Causes Possibles

1. **Cache du navigateur**
2. **Format XLS trop ancien** (Excel 97-2003)
3. **Fichier corrompu ou protégé**
4. **Restrictions du navigateur**

---

## ✅ Solutions (Ordre de Préférence)

### **Solution 1: Convertir XLS en XLSX** (Recommandé)

Le format XLSX est plus moderne et mieux supporté par les navigateurs.

**Dans Excel** :
1. Ouvrir votre fichier XLS
2. Fichier > Enregistrer sous
3. Format: **"Classeur Excel (.xlsx)"**
4. Sauvegarder
5. Importer le fichier XLSX dans ProFireManager

---

### **Solution 2: Convertir XLS en CSV**

Le format CSV est le plus universel.

**Dans Excel** :
1. Ouvrir votre fichier XLS
2. Fichier > Enregistrer sous
3. Format: **"CSV UTF-8 (délimité par des virgules) (.csv)"**
4. Sauvegarder
5. Importer le fichier CSV dans ProFireManager

⚠️ **Important** : Si vous avez plusieurs feuilles, sauvegardez chaque feuille séparément.

---

### **Solution 3: Vider le Cache du Navigateur**

**Chrome / Edge** :
1. Appuyez sur `Ctrl + Shift + Delete` (Windows) ou `Cmd + Shift + Delete` (Mac)
2. Sélectionnez "Images et fichiers en cache"
3. Période : "Toutes les données"
4. Cliquez sur "Effacer les données"
5. Rechargez la page ProFireManager (`F5` ou `Ctrl + R`)

**Firefox** :
1. Appuyez sur `Ctrl + Shift + Delete`
2. Cochez "Cache"
3. Période : "Tout"
4. Cliquez sur "Effacer maintenant"
5. Rechargez la page

**Safari** :
1. Développer > Vider les caches
2. Ou Préférences > Avancées > Cocher "Afficher le menu Développement"
3. Développement > Vider les caches
4. Rechargez la page

---

### **Solution 4: Utiliser un Autre Navigateur**

Essayez avec :
- Chrome (recommandé)
- Firefox
- Edge

Évitez :
- Internet Explorer (obsolète)
- Vieux Safari

---

### **Solution 5: Forcer le Rechargement**

1. **Windows** : `Ctrl + F5` ou `Ctrl + Shift + R`
2. **Mac** : `Cmd + Shift + R`

Cela force le navigateur à recharger tous les fichiers sans utiliser le cache.

---

## 🔍 Vérifications

### **Est-ce que mon fichier est compatible ?**

Ouvrez votre fichier et vérifiez :

✅ **Bon format** :
- Extension : .xls, .xlsx ou .csv
- Colonnes : Employé, Quart, Caserne, Début, Fin, Sélection
- Pas de cellules fusionnées
- Pas de formules complexes
- Première ligne = en-têtes

❌ **Mauvais format** :
- Fichier protégé par mot de passe
- Macros Excel (.xlsm)
- Cellules fusionnées dans les en-têtes
- Plusieurs feuilles avec données différentes

---

## 🆘 Si Rien ne Fonctionne

### **Option A : Export CSV Manuel**

1. Ouvrez votre fichier XLS dans Excel
2. Sélectionnez toutes les données (Ctrl + A)
3. Copiez (Ctrl + C)
4. Ouvrez un nouveau fichier texte (.txt)
5. Collez les données
6. Sauvegardez avec l'extension .csv
7. Importez ce fichier dans ProFireManager

### **Option B : Utiliser Google Sheets**

1. Allez sur https://sheets.google.com
2. Fichier > Importer > Upload > Sélectionnez votre XLS
3. Une fois importé : Fichier > Télécharger > CSV
4. Importez le CSV dans ProFireManager

### **Option C : Convertisseur en Ligne**

Utilisez un convertisseur gratuit :
- https://www.zamzar.com/ (XLS → CSV)
- https://convertio.co/ (XLS → XLSX)

⚠️ **Attention** : Ne pas uploader de données sensibles sur des sites tiers.

---

## 📊 Format de Données Attendu

Peu importe le format (XLS, XLSX, CSV), vos données doivent ressembler à ceci :

| Employé | Quart | Caserne | Début | Fin | Sélection |
|---------|-------|---------|-------|-----|-----------|
| Dupont Jean (101) | jour 12h | Caserne Shefford | 2025-12-01 06:00 | 2025-12-01 18:00 | Disponible |
| Tremblay Marie (102) | matin | Caserne Shefford | 2025-12-02 06:00 | 2025-12-02 18:00 | Aucune |

---

## 🎯 Recommandation Finale

**Pour une compatibilité maximale** :

1. ✅ **Format recommandé** : XLSX (Excel moderne)
2. ✅ **Alternative fiable** : CSV UTF-8
3. ⚠️ **Éviter si possible** : XLS (ancien format)

**Pourquoi XLSX plutôt que XLS ?**
- Plus moderne (depuis 2007)
- Mieux supporté par les navigateurs
- Taille de fichier plus petite
- Plus sécurisé
- Standard actuel

---

## 📞 Support

Si après avoir essayé toutes ces solutions, le problème persiste :

1. Envoyez votre fichier en exemple (avec quelques lignes de données fictives)
2. Précisez :
   - Navigateur utilisé (Chrome, Firefox, etc.)
   - Version du navigateur
   - Format du fichier (XLS, XLSX, CSV)
   - Message d'erreur exact (si affiché)
   - Capture d'écran

---

**Dernière mise à jour** : 19 novembre 2025
