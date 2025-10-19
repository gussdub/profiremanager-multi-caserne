# Manuel d'Utilisation ProFireManager
## Guide Complet pour Pompiers et Superviseurs

**Version 2.0 Avancé**

---

## 📖 Table des Matières

1. [Introduction](#introduction)
2. [Connexion à ProFireManager](#connexion)
3. [Interface Générale](#interface-generale)
4. [Module Dashboard](#module-dashboard)
5. [Module Mon Profil](#module-mon-profil)
6. [Module Personnel (Superviseurs/Admin)](#module-personnel)
7. [Module Formations](#module-formations)
8. [Module EPI](#module-epi)
9. [Module Planning](#module-planning)
10. [Module Disponibilités](#module-disponibilites)
11. [Module Rapports (Directeurs)](#module-rapports)
12. [FAQ et Résolution de Problèmes](#faq)

---

## 📘 Introduction {#introduction}

Bienvenue dans **ProFireManager** ! Ce manuel vous guidera pas à pas dans l'utilisation de la plateforme de gestion de votre service d'incendie.

### À Qui S'adresse ce Manuel ?

- **Pompiers** : Pour consulter vos informations, vous inscrire aux formations, gérer vos disponibilités
- **Superviseurs** : Pour gérer les équipes, valider les présences, planifier les quarts
- **Directeurs** : Pour l'administration complète du service et la génération de rapports

### Niveaux d'Accès

ProFireManager utilise un système de **rôles** pour contrôler les accès :

| Rôle | Accès |
|------|-------|
| **Employé (Pompier)** | Mon Profil, Formations, EPI (consultation), Planning (consultation) |
| **Superviseur** | Tout l'accès Employé + Gestion Personnel, Validation formations, Planning (édition) |
| **Directeur/Admin** | Accès complet à tous les modules + Rapports + Configuration |

---

## 🔐 Connexion à ProFireManager {#connexion}

### Première Connexion

1. **Ouvrez votre navigateur** (Chrome, Firefox, Edge, Safari)
2. **Accédez à l'URL de votre caserne** : `https://profiremanager.ca/[votre-caserne]`
   - Exemple : `https://profiremanager.ca/shefford`
3. **Entrez vos identifiants** :
   - **Email** : Votre adresse email professionnelle
   - **Mot de passe** : Fourni par votre directeur lors de la création de votre compte

### Réinitialisation du Mot de Passe

Si vous avez oublié votre mot de passe :
1. Cliquez sur **"Mot de passe oublié ?"** sur la page de connexion
2. Entrez votre **adresse email**
3. Consultez vos emails (vérifiez les spams)
4. Cliquez sur le lien de réinitialisation
5. Créez votre **nouveau mot de passe** (minimum 8 caractères)

### Conseils de Sécurité

⚠️ **Important** :
- Ne partagez jamais votre mot de passe
- Déconnectez-vous toujours après utilisation sur un ordinateur partagé
- Utilisez un mot de passe fort (lettres, chiffres, symboles)
- Changez votre mot de passe régulièrement

---

## 🖥️ Interface Générale {#interface-generale}

### Navigation Principale

Une fois connecté, vous verrez l'interface principale composée de :

#### 1. **Barre de Navigation Latérale (Sidebar)**
Située à gauche de l'écran, elle contient tous les modules :
- 🏠 **Dashboard** : Tableau de bord principal
- 👤 **Mon Profil** : Vos informations personnelles
- 👥 **Personnel** : Gestion des pompiers (Admin/Superviseurs)
- 📚 **Formations** : Catalogue et inscriptions
- 🛡️ **EPI** : Équipements de protection
- 📅 **Planning** : Quarts de travail
- 🗓️ **Disponibilités** : Vos disponibilités (temps partiel)
- 📊 **Rapports** : Analyses et exports (Directeurs)

#### 2. **En-tête (Header)**
En haut de l'écran :
- **Nom de votre caserne**
- **Votre nom et rôle**
- **Bouton de déconnexion** (icône 🚪)

#### 3. **Zone de Contenu**
Au centre, affiche le contenu du module sélectionné.

### Raccourcis Clavier

| Raccourci | Action |
|-----------|--------|
| `Alt + H` | Retour au Dashboard |
| `Alt + P` | Aller à Mon Profil |
| `Echap` | Fermer les modals |
| `Ctrl + S` | Sauvegarder (quand applicable) |

---

## 📊 Module Dashboard {#module-dashboard}

Le **Dashboard** est votre tableau de bord personnalisé selon votre rôle.

### Pour les Pompiers (Employés)

Lorsque vous vous connectez, vous voyez :

#### **Section 1 : Statistiques Personnelles du Mois**

Quatre cartes affichent vos statistiques du mois en cours :

1. **🔥 Interventions** : Nombre d'interventions auxquelles vous avez participé
2. **⏱️ Heures Travaillées** : Total des heures ce mois-ci
3. **📚 Formations** : Nombre de formations complétées
4. **✅ Présence** : Votre taux de présence en pourcentage

💡 **Astuce** : Ces statistiques se mettent à jour en temps réel.

#### **Section 2 : Messages Importants**

- Liste des **messages diffusés par la direction**
- Niveau de priorité : 📌 Normal, ⚠️ Important, 🚨 Urgent
- Dates d'expiration affichées
- Cliquez pour lire le message complet

#### **Section 3 : Prochaines Activités**

- **Formations à venir** : Date, heure, lieu
- **Quarts assignés** : Vos prochains quarts de travail
- **Échéances importantes** : Renouvellement EPI, certifications

### Pour les Superviseurs et Directeurs

En plus des statistiques personnelles, vous voyez :

#### **Section : Vue d'Ensemble du Service**

Statistiques globales du service :

1. **👥 Personnel Actif** : Nombre de pompiers actifs ce mois
2. **🕐 Total Heures** : Somme des heures travaillées par tout le personnel
3. **📚 Formations** : Nombre total de formations organisées
4. **📊 Taux de Présence** : Moyenne du service

#### **Section : Alertes et Notifications**

⚠️ Alertes importantes nécessitant votre attention :

- **Quarts non couverts** : Quarts manquant de pompiers assignés
- **Certifications expirées** : Pompiers avec formations obligatoires expirées
- **EPI à renouveler** : Équipements arrivant à expiration
- **Demandes de congé** : En attente d'approbation

💡 **Astuce** : Cliquez sur une alerte pour aller directement au module concerné.

#### **Section : Graphiques de Performance**

Visualisations graphiques :

- **Évolution des heures** : Graphique en barres par semaine
- **Répartition des formations** : Graphique circulaire par type
- **Taux de présence** : Évolution mensuelle

#### **Section : Activités Récentes**

Flux en temps réel des dernières actions :
- "Marc Dubois s'est inscrit à Formation RCR"
- "Sophie Tremblay a ajouté une disponibilité"
- "Jean Leblanc a mis à jour son profil"

#### **Section : Diffuser un Message**

**Pour Directeurs uniquement** :

1. Cliquez sur **"➕ Nouveau message"**
2. Remplissez :
   - **Titre** : Objet du message
   - **Contenu** : Votre message (max 500 caractères)
   - **Priorité** : Normal, Important, Urgent
   - **Date d'expiration** : Optionnel
3. Cliquez sur **"Publier"**
4. Le message apparaît instantanément pour tous les pompiers

---

## 👤 Module Mon Profil {#module-mon-profil}

Votre espace personnel pour consulter et mettre à jour vos informations.

### Accès au Module

1. Cliquez sur **"👤 Mon Profil"** dans la sidebar
2. La page se divise en **deux colonnes**

### Colonne Gauche : Informations Personnelles

#### **Section Identité**

Affiche :
- **Nom complet**
- **Grade** (Pompier, Lieutenant, Capitaine, Directeur)
- **Numéro d'employé**
- **Type d'emploi** : Temps plein ou Temps partiel
- **Statut** : Actif, Inactif, En congé

#### **Section Contact**

- **Email** : Adresse email professionnelle
- **Téléphone** : Numéro de contact
- **Adresse** : Adresse résidentielle
- **Contact d'urgence** : Personne à contacter en cas d'urgence

#### **Section Informations d'Emploi**

- **Date d'embauche**
- **Taux horaire** : Visible uniquement par Admin
- **Fonction supérieur** : Oui/Non (responsabilités additionnelles)

### Colonne Droite : Compétences et EPI

#### **Section Compétences**

Liste de toutes vos **formations complétées** :
- 📚 Nom de la formation
- ✅ Date de complétion
- 🕐 Heures validées
- 📜 Statut : Actif ou Expiré

💡 **Info** : Les formations apparaissent automatiquement après validation de votre présence par un superviseur.

#### **Section Tailles des EPI**

Tableau interactif pour **saisir vos tailles** d'équipements :

| Équipement | Icône | Taille |
|------------|-------|--------|
| Casque | 🪖 | [Saisir] |
| Bottes | 👢 | [Saisir] |
| Veste Bunker | 🧥 | [Saisir] |
| Pantalon Bunker | 👖 | [Saisir] |
| Gants | 🧤 | [Saisir] |
| Facial APRIA | 😷 | [Saisir] |
| Cagoule | 🎭 | [Saisir] |

**Comment mettre à jour vos tailles :**
1. Cliquez dans le champ **"Taille"** de l'équipement
2. Entrez votre taille (ex: "Large", "42", "10.5")
3. Les modifications sont **sauvegardées automatiquement**
4. Un message de confirmation apparaît

⚠️ **Important** : Assurez-vous que vos tailles sont à jour pour que le service puisse commander les bons équipements.

### Modifier Vos Informations

**Informations modifiables par vous :**
- Téléphone
- Adresse
- Contact d'urgence
- Tailles EPI

**Informations modifiables uniquement par Admin :**
- Nom, prénom
- Email
- Grade
- Type d'emploi
- Taux horaire

**Pour demander une modification :**
Contactez votre superviseur ou directeur.

---

## 👥 Module Personnel (Superviseurs/Admin) {#module-personnel}

**Accès réservé** : Superviseurs et Directeurs

Ce module permet de gérer l'ensemble du personnel de la caserne.

### Vue d'Ensemble

En haut de la page, quatre **indicateurs clés** (KPI) :

1. **Total Personnel** : Nombre total de pompiers
2. **Personnel Actif** : Pompiers avec statut "Actif"
3. **Temps Plein** : Nombre de pompiers temps plein
4. **Temps Partiel** : Nombre de pompiers temps partiel

### Barre de Contrôles

#### 1. **Recherche**
- Champ de recherche : 🔍 Rechercher par nom, email, grade...
- Résultats filtrés en temps réel

#### 2. **Toggle Vue**
Deux modes d'affichage :
- **☰ Vue Liste** : Tableau détaillé (par défaut)
- **⊞ Vue Cartes** : Cartes visuelles

#### 3. **Boutons d'Export**
- **📄 Export PDF** : Génère un PDF de la liste ou d'une personne
- **📊 Export Excel** : Génère un fichier Excel

**Comment utiliser les exports :**
1. Cliquez sur **"📄 Export PDF"** ou **"📊 Export Excel"**
2. Un modal s'ouvre avec deux options :
   - **📋 Tout le personnel** : Exporte la liste complète
   - **👤 Une personne spécifique** : Sélectionnez dans la liste déroulante
3. Cliquez sur **"Exporter"**
4. Le fichier se télécharge automatiquement

### Vue Liste

Tableau avec colonnes :

| Colonne | Description |
|---------|-------------|
| **Pompier** | Nom, prénom, date d'embauche |
| **Grade / N° Employé** | Grade et numéro |
| **Contact** | Email (tronqué si trop long), téléphone |
| **Statut** | Badge coloré : 🟢 Actif, 🔴 Inactif |
| **Type Emploi** | Badge : 🔵 Temps plein, 🟡 Temps partiel |
| **Actions** | Boutons d'action |

#### Boutons d'Action

Chaque ligne contient des boutons :

- **👁️ Voir** : Affiche le profil complet en modal
- **✏️ Modifier** : Ouvre le formulaire de modification
- **🗑️ Supprimer** : Supprime le pompier (avec confirmation)
- **📅 Gérer dispo** : (Temps partiel uniquement) Gère les disponibilités

### Vue Cartes

Affichage en **grille de cartes** avec :
- Avatar du pompier
- Nom et grade
- Statut (badge)
- Email, téléphone
- Type d'emploi
- N° Employé
- Boutons : 👁️ Voir, ✏️ Modifier, 📅 Dispo

### Créer un Nouveau Pompier

1. Cliquez sur **"➕ Nouveau pompier"** (en haut à droite)
2. Un modal s'ouvre avec le **formulaire de création**

#### **Section 1 : Informations Personnelles**
- Prénom *
- Nom *
- Email *
- Téléphone
- Adresse
- Contact d'urgence

#### **Section 2 : Informations d'Emploi**
- Grade * : Pompier, Lieutenant, Capitaine, Directeur
- Fonction supérieur : Oui/Non
- Type d'emploi * : Temps plein / Temps partiel
- N° Employé * (généré automatiquement si vide)
- Date d'embauche * (par défaut : aujourd'hui)
- Taux horaire

#### **Section 3 : Compétences et Certifications**
- Liste de **toutes les formations disponibles**
- Cochez les formations que le pompier possède déjà
- Affichage : Nom, heures requises/an, obligatoire (OBL)

#### **Section 4 : Tailles des EPI**
- Grille pour saisir les tailles de chaque équipement
- Optionnel lors de la création
- Peut être complété plus tard par le pompier

3. Cliquez sur **"💾 Créer le pompier"**
4. Le pompier reçoit automatiquement un **email de bienvenue** avec ses identifiants

### Modifier un Pompier

1. Cliquez sur **✏️ Modifier** dans la ligne du pompier
2. Le modal de modification s'ouvre (même structure que création)
3. **Modifiez les informations** souhaitées
4. Cliquez sur **"💾 Sauvegarder les modifications"**

💡 **Astuce** : Les tailles EPI peuvent être mises à jour directement ici ou par le pompier dans "Mon Profil".

### Supprimer un Pompier

1. Cliquez sur **🗑️ Supprimer**
2. Une **confirmation** apparaît : *"Êtes-vous sûr de vouloir supprimer ce pompier ?"*
3. Cliquez sur **"OK"** pour confirmer

⚠️ **Attention** : La suppression est définitive. Les données ne peuvent pas être récupérées.

### Gérer les Disponibilités (Temps Partiel)

Pour les pompiers **temps partiel uniquement** :

1. Cliquez sur **📅 Gérer dispo**
2. Un modal s'ouvre avec la **liste des disponibilités** du pompier
3. Affichage : Date, heure début, heure fin, statut

#### Ajouter une Disponibilité

1. Cliquez sur **"➕ Ajouter une disponibilité"**
2. Remplissez :
   - **Date** *
   - **Heure début** * (ex: 08:00)
   - **Heure fin** * (ex: 17:00)
   - **Statut** : Disponible, Non disponible, En congé
   - **Récurrence** : Oui/Non
   - Si récurrence :
     - **Type** : Hebdomadaire / Mensuelle
     - **Jours de la semaine** : Cochez les jours
     - **Bi-hebdomadaire** : Oui/Non
     - **Date de fin** *
3. Cliquez sur **"Ajouter"**

💡 **Exemple d'utilisation de la récurrence** :
- Pour créer "Tous les lundis et mercredis de 8h à 17h pour les 3 prochains mois" :
  - Récurrence : Oui
  - Type : Hebdomadaire
  - Jours : Lundi, Mercredi
  - Date de fin : Dans 3 mois

#### Supprimer une Disponibilité

1. Cliquez sur **🗑️** à côté de la disponibilité
2. Confirmez la suppression

---

## 📚 Module Formations {#module-formations}

Ce module permet de **consulter le catalogue** des formations, de **s'inscrire**, et pour les superviseurs de **créer et gérer** les formations.

### Accès au Module

Cliquez sur **"📚 Formations"** dans la sidebar.

### Vue Employé (Pompier)

#### **Catalogue des Formations**

Affichage en **cartes colorées** avec :
- **Nom de la formation**
- **Date et heure** (ex: 15 mai 2025, 09:00 - 17:00)
- **Lieu** (ex: Caserne principale)
- **Formateur**
- **Coût** (si applicable)
- **Heures requises** (ex: 8h/an)
- **Badge "Obligatoire"** si formation obligatoire
- **Statut d'inscription** :
  - ✅ **Inscrit** : Vous êtes inscrit
  - **S'inscrire** : Bouton pour s'inscrire
  - **Présence validée** : Vous avez participé

#### S'inscrire à une Formation

1. **Trouvez la formation** qui vous intéresse
2. Vérifiez la **date et le lieu**
3. Cliquez sur le bouton **"S'inscrire"**
4. Une confirmation apparaît : *"Inscription réussie !"*
5. Le bouton devient **"✅ Inscrit"**

💡 **Conseil** : Inscrivez-vous dès que possible, les places peuvent être limitées.

#### Se Désinscrire d'une Formation

1. Cliquez sur **"✅ Inscrit"** (bouton vert)
2. Le bouton bascule en **"Se désinscrire"**
3. Cliquez à nouveau pour confirmer
4. Vous êtes désinscrits

⚠️ **Important** : Ne vous désinscrivez pas à la dernière minute sans raison valable.

#### Consulter les Inscrits

Pour voir qui est inscrit à une formation :
1. Cliquez sur **"👥 Voir inscrits"** sur la carte de formation
2. Un modal affiche la **liste des participants**
3. Affichage : Nom, grade, présence validée (✅ ou ❌)

### Vue Superviseur/Admin

En plus des fonctionnalités employé, les superviseurs peuvent :

#### **Créer une Nouvelle Formation**

1. Cliquez sur **"➕ Nouvelle formation"** (en haut à droite)
2. Remplissez le formulaire :

**Informations de Base :**
- **Nom de la formation** * (ex: "Formation RCR 2025")
- **Description** (optionnel)
- **Date de début** *
- **Date de fin** *
- **Heure** * (ex: 09:00)
- **Lieu** * (ex: "Caserne principale - Salle de formation")

**Détails :**
- **Formateur** * (nom du formateur ou organisme)
- **Coût** (en $, ex: 150)
- **Obligatoire** : Oui/Non
- **Heures requises annuelles** (ex: 8h/an)
- **Capacité maximale** (optionnel, ex: 20 personnes)

3. Cliquez sur **"Créer la formation"**
4. La formation apparaît dans le catalogue
5. Tous les pompiers sont **notifiés automatiquement**

#### **Modifier une Formation**

1. Cliquez sur **"✏️ Modifier"** sur la carte de formation
2. Le formulaire s'ouvre avec les **informations actuelles**
3. Modifiez ce qui est nécessaire
4. Cliquez sur **"Sauvegarder"**

⚠️ **Note** : Si vous modifiez la date, les inscrits sont re-notifiés.

#### **Supprimer une Formation**

1. Cliquez sur **"🗑️ Supprimer"**
2. Confirmez : *"Êtes-vous sûr ? Cela supprimera aussi toutes les inscriptions."*
3. Cliquez sur **"OK"**

#### **Valider les Présences**

Après la formation :

1. Cliquez sur **"👥 Voir inscrits"**
2. Le modal affiche la liste avec des **cases à cocher**
3. **Cochez** les pompiers qui étaient **présents**
4. Cliquez sur **"💾 Valider les présences"**
5. Les présences sont enregistrées
6. Les formations complétées apparaissent dans les profils des pompiers

💡 **Important** : Seuls les pompiers avec présence validée obtiennent les heures de formation dans leur dossier.

### Rapports de Formations (Admin)

Section **"Rapports"** dans le module Formations :

#### **1. Rapport Général de Compétences**

- Affiche **toutes les compétences** du service
- Pour chaque formation :
  - Nombre de pompiers qualifiés
  - Taux de couverture (%)
  - Liste des pompiers possédant cette compétence

**Export :**
- Cliquez sur **"📄 Export PDF"** ou **"📊 Export Excel"**

#### **2. Rapport par Personne**

- Sélectionnez un pompier dans la liste déroulante
- Affiche **toutes ses formations** complétées
- Dates de complétion
- Heures validées
- Statut (actif/expiré)

**Export :**
- Cliquez sur **"📄 Export PDF"** ou **"📊 Export Excel"**

---

## 🛡️ Module EPI {#module-epi}

Gestion des **Équipements de Protection Individuelle**.

### Accès au Module

Cliquez sur **"🛡️ EPI"** dans la sidebar.

### Vue Employé (Pompier)

#### **Consulter Mes EPI**

Liste de **vos équipements assignés** :

| Équipement | Icône | Taille | État | Date d'Attribution | Date d'Expiration | Actions |
|------------|-------|--------|------|-------------------|-------------------|---------|
| Casque | 🪖 | Large | Bon | 01/01/2024 | 01/01/2029 | 👁️ |
| Bottes | 👢 | 10.5 | Neuf | 15/02/2024 | 15/02/2027 | 👁️ |

**Codes couleur des états :**
- 🟢 **Neuf** : Équipement neuf
- 🔵 **Bon** : En bon état
- 🟡 **À remplacer** : Doit être remplacé bientôt
- 🔴 **Défectueux** : Défectueux, ne pas utiliser

#### **Mettre à Jour Ma Taille**

Deux façons de mettre à jour vos tailles :

**Méthode 1 : Depuis "Mon Profil"**
(Voir section Mon Profil)

**Méthode 2 : Depuis le module EPI**
1. Cliquez sur **👁️ Voir** à côté d'un équipement
2. Le modal affiche les détails
3. Cliquez sur **"✏️ Modifier la taille"**
4. Entrez la **nouvelle taille**
5. Cliquez sur **"Sauvegarder"**

💡 **Rappel** : Des tailles à jour facilitent le remplacement des équipements.

### Vue Superviseur/Admin

#### **Consulter l'Inventaire Complet**

Vue d'ensemble de **tous les EPI** du service :
- Filtres : Par pompier, par type d'EPI, par état
- Recherche par nom de pompier
- Export PDF/Excel de l'inventaire

#### **Assigner un Nouvel EPI**

1. Cliquez sur **"➕ Attribuer un EPI"**
2. Remplissez :
   - **Pompier** * : Sélectionnez dans la liste
   - **Type d'EPI** * : Casque, Bottes, etc.
   - **Taille** *
   - **État** : Neuf, Bon, À remplacer, Défectueux
   - **Date d'attribution** * (par défaut : aujourd'hui)
   - **Date d'expiration** * (calculée automatiquement selon le type)
   - **Date prochaine inspection** (optionnel)
   - **Notes** (optionnel)
3. Cliquez sur **"Attribuer"**

#### **Modifier un EPI**

1. Cliquez sur **✏️ Modifier** dans la ligne de l'EPI
2. Modifiez les champs nécessaires
3. Cliquez sur **"Sauvegarder"**

**Champs modifiables :**
- Taille
- État
- Dates (expiration, inspection)
- Notes

#### **Supprimer un EPI**

1. Cliquez sur **🗑️ Supprimer**
2. Confirmez la suppression

💡 **Usage** : Utilisez la suppression quand un EPI est mis hors service définitivement.

#### **Alertes EPI**

Section **"Alertes"** affiche :
- **EPI expirés** : Liste des équipements dépassant leur date d'expiration
- **EPI à inspecter** : Équipements nécessitant une inspection
- **EPI défectueux** : Liste des équipements défectueux

**Pour chaque alerte :**
- Nom du pompier
- Type d'EPI
- Date concernée
- Bouton **"Gérer"** pour action rapide

---

## 📅 Module Planning {#module-planning}

Gestion des **quarts de travail** et de la couverture 24/7.

### Accès au Module

Cliquez sur **"📅 Planning"** dans la sidebar.

### Vue Employé (Pompier)

#### **Consulter le Planning**

Affichage du planning sous forme de **grille hebdomadaire** :

| Jour | Quart Jour (8h-20h) | Quart Nuit (20h-8h) |
|------|---------------------|---------------------|
| Lundi 15/05 | Marc Dubois, Sophie T. | Jean Leblanc |
| Mardi 16/05 | Pierre Martin | **Non assigné** 🔴 |

**Codes couleur :**
- 🟢 **Vert** : Quart complet
- 🟡 **Jaune** : Partiellement couvert
- 🔴 **Rouge** : Non assigné (manque personnel)
- 🔵 **Bleu** : Votre quart assigné

#### **Voir Mes Quarts**

- Les quarts où **vous êtes assigné** sont surlignés en **bleu**
- Cliquez sur un quart pour voir les détails :
  - Heure exacte
  - Autres pompiers assignés
  - Lieu

💡 **Conseil** : Vérifiez régulièrement vos quarts assignés.

### Vue Superviseur/Admin

#### **Navigation du Planning**

En haut :
- **Boutons de navigation** : ⬅️ Semaine précédente | Aujourd'hui | Semaine suivante ➡️
- **Sélecteur de date** : Choisissez une semaine spécifique

#### **Créer un Quart de Travail**

1. Cliquez sur le **jour** souhaité dans la grille
2. Un modal s'ouvre :

**Formulaire :**
- **Date** * : Pré-remplie avec le jour cliqué
- **Type de quart** * : Jour (8h-20h) ou Nuit (20h-8h)
- **Heure début** * : Personnalisable (ex: 08:00)
- **Heure fin** * : Personnalisable (ex: 20:00)
- **Pompiers assignés** * : Liste à choix multiples
  - Affiche uniquement les pompiers **disponibles** (temps partiel)
  - Indication si déjà assigné ailleurs (⚠️ Conflit)
- **Notes** (optionnel)

3. Cliquez sur **"Créer le quart"**
4. Le quart apparaît dans la grille

#### **Modifier un Quart**

1. Cliquez sur un **quart existant** dans la grille
2. Le modal de modification s'ouvre
3. Modifiez :
   - Heures
   - Pompiers assignés (ajouter/retirer)
   - Notes
4. Cliquez sur **"Sauvegarder"**

#### **Supprimer un Quart**

1. Cliquez sur un quart existant
2. Cliquez sur **"🗑️ Supprimer le quart"**
3. Confirmez

#### **Gestion des Conflits**

Si vous essayez d'assigner un pompier déjà assigné à un autre quart qui chevauche :
- **⚠️ Avertissement** apparaît : *"Jean Leblanc est déjà assigné de 08:00 à 20:00 ce jour"*
- Vous pouvez quand même assigner (le système alerte mais ne bloque pas)

💡 **Bonne pratique** : Évitez les chevauchements pour ne pas surcharger les pompiers.

#### **Statistiques du Planning**

En haut à droite :
- **Taux de couverture** : Pourcentage de quarts couverts vs total
- **Quarts manquants** : Nombre de quarts sans personnel assigné
- **Heures totales** : Somme des heures de quarts cette semaine

#### **Export du Planning**

1. Cliquez sur **"📄 Export PDF"** ou **"📊 Export Excel"**
2. Sélectionnez :
   - **Semaine** : Semaine actuelle ou autre
   - **Format** : PDF ou Excel
3. Le fichier se télécharge

**Contenu de l'export :**
- Grille complète de la semaine
- Tous les quarts et assignations
- Notes et heures
- Statistiques

---

## 🗓️ Module Disponibilités {#module-disponibilites}

**Réservé aux pompiers temps partiel.**

### Accès au Module

Cliquez sur **"🗓️ Disponibilités"** dans la sidebar.

💡 **Note** : Si vous êtes **temps plein**, ce module n'apparaît pas (vous êtes présumé toujours disponible).

### Vue Employé (Temps Partiel)

#### **Consulter Mes Disponibilités**

Liste de vos disponibilités saisies :

| Date | Heure Début | Heure Fin | Statut |
|------|-------------|-----------|--------|
| 20/05/2025 | 08:00 | 17:00 | Disponible 🟢 |
| 21/05/2025 | 08:00 | 17:00 | En congé 🔴 |

**Statuts :**
- 🟢 **Disponible** : Vous êtes disponible pour être assigné
- 🟡 **Non disponible** : Pas disponible (raison personnelle)
- 🔴 **En congé** : Congé officiel

#### **Ajouter une Disponibilité**

1. Cliquez sur **"➕ Ajouter une disponibilité"**
2. Remplissez :
   - **Date** * : Date de disponibilité
   - **Heure début** * (ex: 08:00)
   - **Heure fin** * (ex: 17:00)
   - **Statut** * : Disponible, Non disponible, En congé
3. Cliquez sur **"Ajouter"**

💡 **Conseil** : Ajoutez vos disponibilités **le plus tôt possible** pour faciliter la planification.

#### **Ajouter des Disponibilités Récurrentes**

Pour éviter de saisir manuellement chaque semaine :

1. Cliquez sur **"➕ Ajouter une disponibilité"**
2. Cochez **"Récurrence"**
3. Remplissez :
   - **Type de récurrence** : Hebdomadaire ou Mensuelle
   - **Jours de la semaine** : (si hebdomadaire) Cochez les jours
   - **Bi-hebdomadaire** : (optionnel) Oui/Non
   - **Date de fin** * : Jusqu'à quand répéter
4. Cliquez sur **"Ajouter"**

**Exemple :**
*"Je suis disponible tous les lundis, mercredis et vendredis de 8h à 17h pour les 3 prochains mois"*

- Date : Premier lundi
- Heure : 08:00 - 17:00
- Récurrence : Oui
- Type : Hebdomadaire
- Jours : Lundi, Mercredi, Vendredi
- Date de fin : Dans 3 mois

→ Le système crée **automatiquement** toutes les disponibilités !

#### **Modifier une Disponibilité**

1. Cliquez sur **✏️ Modifier** dans la ligne
2. Modifiez les champs
3. Cliquez sur **"Sauvegarder"**

⚠️ **Note** : Modifier une occurrence d'une récurrence modifie **uniquement cette occurrence**.

#### **Supprimer une Disponibilité**

1. Cliquez sur **🗑️ Supprimer**
2. Confirmez

💡 **Usage** : Supprimez une disponibilité si vos plans changent.

### Vue Superviseur/Admin

Les superviseurs voient les disponibilités de **tous les pompiers temps partiel** :

#### **Consulter les Disponibilités Globales**

Affichage en **calendrier** ou **liste** :
- Filtre par pompier
- Filtre par date
- Recherche

#### **Planifier en Fonction des Disponibilités**

Lors de la création d'un quart dans le **Planning** :
- Le système affiche uniquement les pompiers **disponibles** à cette date/heure
- Indication visuelle si conflit

---

## 📊 Module Rapports (Directeurs) {#module-rapports}

**Accès réservé** : Directeurs et Administrateurs

Module d'analyse et de génération de rapports.

### Accès au Module

Cliquez sur **"📊 Rapports"** dans la sidebar.

### Structure du Module

Deux onglets principaux :

1. **📈 Rapports Internes** : Pour la gestion interne du service
2. **📋 Rapports Externes** : Pour les autorités et la municipalité

### Rapports Internes

#### **1. Présence et Heures Travaillées**

**Affichage :**
- Graphique en barres : Heures par pompier ce mois
- Tableau détaillé : Nom, heures, taux de présence
- Filtres : Par mois, par pompier, par grade

**KPI affichés :**
- Total heures ce mois
- Moyenne heures par pompier
- Taux de présence global (%)

**Export :**
- 📄 PDF : Rapport formaté avec graphiques
- 📊 Excel : Données brutes pour analyses

#### **2. Coûts Salariaux**

**Affichage :**
- Graphique en lignes : Évolution des coûts mensuels
- Tableau : Coût par pompier (heures × taux horaire)
- Total coûts salariaux du mois

**Filtres :**
- Par mois
- Par type d'emploi (temps plein / partiel)
- Par grade

**Export :**
- 📄 PDF
- 📊 Excel

#### **3. Rapport de Disponibilités**

**Affichage :**
- Graphique circulaire : Répartition disponibilités vs non-disponibles
- Tableau : Liste des disponibilités par pompier
- Statistiques :
  - Total disponibilités saisies
  - Taux de couverture des quarts

**Export :**
- 📄 PDF
- 📊 Excel

#### **4. Coûts de Formation**

**Affichage :**
- Graphique en barres : Coût par formation
- Tableau : Détail (nom formation, date, participants, coût)
- Total dépensé en formation ce mois/année

**Filtres :**
- Par période
- Par type de formation
- Par formateur

**Export :**
- 📄 PDF
- 📊 Excel

### Rapports Externes

#### **1. Rapport Budgétaire**

**Affichage :**
- Graphique : Budget alloué vs dépensé
- Tableau : Détail par poste budgétaire
  - Salaires
  - Formations
  - Équipements
  - Opérations
- Projections pour le reste de l'année

**Export :**
- 📄 PDF professionnel (pour conseil municipal)
- 📊 Excel

#### **2. Rapport d'Immobilisations**

**Affichage :**
- Inventaire complet des actifs
- Valeur d'acquisition
- Amortissement
- Valeur résiduelle
- Catégories : Véhicules, équipements, bâtiments

**Export :**
- 📄 PDF
- 📊 Excel

#### **3. Plan Triennal**

**Affichage :**
- Tableau : Investissements planifiés sur 3 ans
- Par année : Projets, coûts estimés, priorité
- Total par année

**Export :**
- 📄 PDF (présentation au conseil)
- 📊 Excel

#### **4. Rapport d'Activité Générale**

**Affichage :**
- Statistiques opérationnelles :
  - Nombre d'interventions
  - Types d'interventions
  - Temps de réponse moyen
  - Personnel mobilisé
- Graphiques de tendances

**Filtres :**
- Par période (mois, trimestre, année)
- Par type d'intervention

**Export :**
- 📄 PDF
- 📊 Excel

### Génération de Rapports

**Pour générer n'importe quel rapport :**

1. Sélectionnez le **rapport** souhaité (onglet Interne ou Externe)
2. Configurez les **filtres** (dates, pompiers, etc.)
3. Visualisez le **graphique et le tableau**
4. Cliquez sur **"📄 Export PDF"** ou **"📊 Export Excel"**
5. Choisissez les **options d'export** si demandé
6. Cliquez sur **"Exporter"**
7. Le fichier se **télécharge automatiquement**

💡 **Conseil** : Les rapports PDF sont idéaux pour les présentations, les rapports Excel pour les analyses approfondies.

---

## ❓ FAQ et Résolution de Problèmes {#faq}

### Questions Fréquentes

#### **1. J'ai oublié mon mot de passe, que faire ?**

**Solution :**
1. Sur la page de connexion, cliquez sur **"Mot de passe oublié ?"**
2. Entrez votre email
3. Vérifiez vos emails (y compris spams)
4. Cliquez sur le lien reçu
5. Créez un nouveau mot de passe

Si vous ne recevez pas l'email, contactez votre directeur.

---

#### **2. Je ne peux pas m'inscrire à une formation, pourquoi ?**

**Causes possibles :**
- La formation est **complète** (capacité maximale atteinte)
- La date est **passée**
- Vous êtes **déjà inscrit** (vérifiez le statut)
- Problème technique temporaire

**Solution :**
Contactez votre superviseur pour vérification.

---

#### **3. Mes tailles EPI ne se sauvegardent pas**

**Solution :**
1. Vérifiez votre **connexion Internet**
2. Essayez de **rafraîchir la page** (F5)
3. Déconnectez-vous et reconnectez-vous
4. Réessayez de saisir les tailles
5. Si le problème persiste, contactez le support : info@profiremanager.ca

---

#### **4. Je ne vois pas le module "Personnel" dans la sidebar**

**Cause :**
Vous êtes connecté avec un compte **Employé**. Seuls les **Superviseurs** et **Directeurs** ont accès à ce module.

**Solution :**
Si vous pensez avoir besoin de cet accès, contactez votre directeur pour ajuster votre rôle.

---

#### **5. Comment puis-je voir mes anciennes formations ?**

**Solution :**
1. Allez dans **"👤 Mon Profil"**
2. Section **"Compétences"** (colonne droite)
3. Toutes vos formations complétées sont listées avec dates

Pour un historique complet, demandez un **rapport à votre directeur**.

---

#### **6. Le planning ne s'affiche pas correctement**

**Solutions :**
1. **Rafraîchissez la page** (F5 ou Ctrl+R)
2. **Videz le cache** de votre navigateur :
   - Chrome : Ctrl+Shift+Delete
   - Firefox : Ctrl+Shift+Delete
   - Safari : Cmd+Option+E
3. **Utilisez un navigateur à jour** (Chrome, Firefox, Edge récent)
4. **Désactivez temporairement** les extensions de navigateur

---

#### **7. Je veux modifier mes informations personnelles mais c'est grisé**

**Cause :**
Certaines informations (nom, email, grade) ne peuvent être modifiées que par un **administrateur**.

**Solution :**
Contactez votre superviseur ou directeur pour demander la modification.

---

#### **8. Comment puis-je télécharger une fiche d'un pompier ?**

**Pour les Superviseurs/Directeurs :**
1. Allez dans **"👥 Personnel"**
2. Cliquez sur **"📄 Export PDF"** ou **"📊 Export Excel"**
3. Dans le modal, sélectionnez **"👤 Une personne spécifique"**
4. Choisissez le pompier dans la liste déroulante
5. Cliquez sur **"Exporter"**

---

#### **9. Le système est lent, que faire ?**

**Solutions :**
1. **Vérifiez votre connexion Internet** (minimum 5 Mbps recommandé)
2. **Fermez les onglets inutiles** dans votre navigateur
3. **Redémarrez votre navigateur**
4. **Essayez un autre navigateur** (Chrome recommandé)
5. Si le problème persiste, contactez le support

---

#### **10. Puis-je utiliser ProFireManager sur mon téléphone ?**

**Oui !** ProFireManager est **responsive** et fonctionne sur :
- Smartphones (iOS et Android)
- Tablettes
- Ordinateurs

**Recommandation :**
Pour une meilleure expérience, utilisez l'application sur **ordinateur ou tablette** pour les tâches administratives complexes (création de formations, rapports).

---

### Résolution de Problèmes Techniques

#### **Problème : Page blanche après connexion**

**Solutions :**
1. Videz le cache du navigateur
2. Désactivez les extensions de blocage de publicités
3. Vérifiez que JavaScript est activé
4. Essayez en **navigation privée**
5. Mettez à jour votre navigateur

---

#### **Problème : Erreur "Session expirée"**

**Cause :**
Votre session a expiré après 8 heures d'inactivité (sécurité).

**Solution :**
Reconnectez-vous. Vos données non sauvegardées peuvent être perdues.

**Conseil :**
Sauvegardez régulièrement votre travail (les modals ont des boutons de sauvegarde).

---

#### **Problème : Export PDF/Excel ne se télécharge pas**

**Solutions :**
1. Vérifiez que les **pop-ups ne sont pas bloquées** par votre navigateur
2. Autorisez les téléchargements depuis ProFireManager
3. Vérifiez votre **dossier de téléchargements**
4. Essayez avec un autre navigateur
5. Désactivez temporairement votre **antivirus** (peut bloquer les téléchargements)

---

#### **Problème : Les graphiques ne s'affichent pas**

**Cause :**
Problème de chargement de la bibliothèque ApexCharts.

**Solutions :**
1. Rafraîchissez la page (F5)
2. Videz le cache
3. Vérifiez votre connexion Internet
4. Attendez quelques secondes (chargement différé)

---

### Contacter le Support

Si vous ne trouvez pas de solution à votre problème :

**Email :** info@profiremanager.ca

**Dans votre email, incluez :**
- Votre **nom et caserne**
- **Description du problème** (étapes pour reproduire)
- **Captures d'écran** si possible
- **Navigateur et version** (ex: Chrome 120)
- **Message d'erreur** exact (si affiché)

**Délai de réponse :** Moins de 24 heures ouvrables

---

## 🎓 Conseils d'Utilisation et Bonnes Pratiques

### Pour les Pompiers

1. **Mettez à jour régulièrement** vos informations (téléphone, adresse)
2. **Consultez le dashboard** chaque semaine pour les nouveaux messages
3. **Inscrivez-vous rapidement** aux formations (places limitées)
4. **Saisissez vos disponibilités** à l'avance (temps partiel)
5. **Vérifiez vos tailles EPI** au moins une fois par an

### Pour les Superviseurs

1. **Validez les présences** dans les 48h après une formation
2. **Planifiez les quarts** au moins 2 semaines à l'avance
3. **Vérifiez les alertes EPI** chaque semaine
4. **Communiquez clairement** via les messages du dashboard
5. **Exportez régulièrement** les données importantes (sauvegarde)

### Pour les Directeurs

1. **Générez les rapports mensuels** en début de mois suivant
2. **Suivez les KPI** du dashboard quotidiennement
3. **Planifiez les formations** 2 mois à l'avance
4. **Gérez le budget** proactivement avec les rapports de coûts
5. **Formez votre personnel** à l'utilisation de la plateforme

---

## 📞 Support et Assistance

### Ressources Disponibles

1. **Ce manuel utilisateur** (document PDF)
2. **Base de connaissances** en ligne : [à venir]
3. **Vidéos tutoriels** : [à venir]
4. **Support par email** : info@profiremanager.ca

### Heures de Support

**Lundi au vendredi :** 8h à 17h (heure de l'Est)  
**Samedi, dimanche et jours fériés :** Fermé

**Délai de réponse :** Moins de 24 heures ouvrables

### Signaler un Bug

Si vous découvrez un bug (comportement inattendu) :

**Email :** info@profiremanager.ca  
**Objet :** BUG - [Description courte]

**Incluez :**
- Étapes pour reproduire le bug
- Résultat attendu vs résultat obtenu
- Captures d'écran
- Navigateur et version

---

## 🎉 Conclusion

**Félicitations !** Vous êtes maintenant familiarisé avec ProFireManager.

Cette plateforme est conçue pour **simplifier votre quotidien** et améliorer l'efficacité de votre service d'incendie.

N'hésitez pas à :
- **Explorer** tous les modules
- **Poser des questions** au support
- **Partager vos retours** pour améliorer la plateforme

**Merci d'utiliser ProFireManager !** 🚒

---

*ProFireManager v2.0 - Manuel d'Utilisation Complet*  
*© 2025 ProFireManager. Tous droits réservés.*  
*Dernière mise à jour : Mai 2025*
