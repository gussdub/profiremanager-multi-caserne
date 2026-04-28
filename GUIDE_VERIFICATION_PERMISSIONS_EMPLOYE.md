# 🔍 Guide de vérification - Permissions Employé en Production

## ✅ Vérifications effectuées

### 1. Permissions Employé sauvegardées ✅
```json
{
  "planning": {
    "rapport-heures": {
      "access": true,
      "actions": ["voir", "exporter"]
    }
  },
  "actifs": {
    "eau": {
      "access": true,
      "actions": ["voir", "historique"]
    }
  }
}
```

**Résultat** : Les permissions sont BIEN sauvegardées en production pour Shefford.

---

## 🧪 Checklist de test pour vous

### Étape 1 : Vérifier le type d'accès de l'employé
1. Connexion admin : https://romantic-moser-2.preview.emergentagent.com
2. **Personnel → Liste des employés**
3. Trouver votre employé de test
4. Vérifier que son **Type d'accès = "Employé"** (pas "Pompier", pas autre chose)

**Si ce n'est PAS "Employé"** :
- Cliquer sur l'employé
- Modifier le type d'accès → Sélectionner **"Employé"**
- Sauvegarder

---

### Étape 2 : Reconnexion obligatoire de l'employé
⚠️ **IMPORTANT** : Les permissions sont chargées **au moment de la connexion**.

L'employé DOIT :
1. **Se déconnecter complètement**
2. **Fermer le navigateur** (pour effacer la session)
3. **Rouvrir le navigateur**
4. **Se reconnecter**

Sans cette étape, les anciennes permissions restent en cache !

---

### Étape 3 : Vérifier "Rapport d'heures"

**En tant qu'employé connecté** :
1. Aller dans **Planning** (menu gauche)
2. Chercher un onglet ou lien **"Rapport d'heures"** ou **"Heures"**
3. **Devrait être VISIBLE** maintenant

**Si NON visible** :
- Vérifier que l'employé est bien type "Employe" (Étape 1)
- Vérifier qu'il s'est bien déconnecté/reconnecté (Étape 2)

---

### Étape 4 : Vérifier "Historique" dans Eau

**En tant qu'employé connecté** :
1. Aller dans **Gestion des Actifs** (menu gauche)
2. Cliquer sur **"Approvisionnement en Eau"**
3. Sélectionner un point d'eau
4. Chercher un bouton **"Historique"** ou **"📜 Historique"**
5. **Devrait être VISIBLE** maintenant

**Si NON visible** :
- Vérifier type d'accès (Étape 1)
- Vérifier reconnexion (Étape 2)

---

## 🐛 Problèmes possibles

### Problème 1 : L'employé n'est pas type "Employe"
**Symptôme** : Rien n'apparaît même après reconnexion
**Solution** : Vérifier et changer le type d'accès vers "Employé"

### Problème 2 : Session pas rafraîchie
**Symptôme** : Les permissions ne changent pas
**Solution** : Déconnexion + fermeture navigateur + reconnexion

### Problème 3 : Frontend ne vérifie pas ces permissions
**Symptôme** : Les permissions backend sont OK mais UI ne les utilise pas
**Solution** : Vérifier le code frontend (components Planning et Eau)

---

## 🔧 Test rapide avec mon compte

Essayez avec **VOTRE compte admin** pour vérifier :

1. **Personnel → Types d'accès**
2. Modifier le type **"Administrateur"** temporairement
3. Retirer tous les accès sauf :
   - Planning → Rapport-heures → Voir + Exporter
   - Actifs → Eau → Historique
4. Sauvegarder
5. **Se déconnecter**
6. **Se reconnecter**
7. Vérifier ce que vous voyez

Si VOUS ne voyez rien non plus → Problème frontend
Si VOUS voyez → Problème de type d'accès de l'employé

---

## 📞 Informations pour moi

**Si ça ne fonctionne toujours pas**, dites-moi :

1. **Quel est le type d'accès exact de l'employé ?**
   - "Employe" (avec 'e' minuscule)
   - "Pompier"
   - Autre ?

2. **L'employé s'est-il déconnecté/reconnecté ?**
   - Oui, complètement
   - Non
   - Seulement rafraîchi la page

3. **Que voit l'employé dans le menu Planning ?**
   - Aucun sous-menu
   - Seulement "Calendrier"
   - Autre chose ?

4. **Dans Gestion des Actifs → Eau, que voit l'employé ?**
   - Rien
   - La liste mais pas de bouton Historique
   - Autre ?

Avec ces informations, je pourrai identifier le problème exact !
