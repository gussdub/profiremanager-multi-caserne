# ProFireManager - Présentation des Fonctionnalités

## 📋 Description Générale

**ProFireManager** est une solution complète de gestion pour les services d'incendie du Québec. Cette plateforme multi-tenant permet aux casernes de gérer l'ensemble de leurs opérations quotidiennes, de la gestion du personnel aux interventions d'urgence, en passant par la prévention incendie et la gestion des équipements.

---

## 🏢 Architecture Multi-Tenant

- **Isolation complète** des données par organisation
- Chaque service d'incendie dispose de son propre espace sécurisé
- Configuration personnalisable par tenant
- Gestion centralisée pour les regroupements de casernes

---

## 📊 Modules Principaux

### 1. 📊 Tableau de Bord
**Accès:** Tous les utilisateurs

- Vue d'ensemble des activités du service
- Indicateurs clés de performance (KPI)
- Alertes et notifications en temps réel
- Calendrier des événements à venir
- Messages de diffusion pour communication interne
- Résumé des équipements nécessitant attention
- Statistiques des interventions

---

### 2. 👥 Gestion du Personnel
**Accès:** Administrateurs, Superviseurs

**Fonctionnalités:**
- Dossiers employés complets (informations personnelles, contacts d'urgence)
- Gestion des grades et fonctions
- Suivi des types d'emploi (temps plein, temps partiel, temporaire)
- Gestion des équipes de garde avec rotation automatique
- Historique des affectations
- Photos d'identification
- Gestion des compétences et certifications
- Export PDF et Excel des listes du personnel

**Sous-modules:**
- Attribution automatique des ressources
- Gestion des équipes de garde (rotations personnalisables)
- Fonctions supérieures et suppléances

---

### 3. 🚒 Gestion des Actifs
**Accès:** Tous les utilisateurs (lecture), Administrateurs (écriture)

**Catégories d'équipements:**
- **Véhicules:** Autopompes, échelles, unités de secours, véhicules de commandement
- **EPI (Équipements de Protection Individuelle):** Casques, habits de combat, APRIA, bottes
- **Équipements médicaux:** Trousses de premiers soins, DEA, matériel de réanimation
- **Matériel d'intervention:** Tuyaux, lances, outils hydrauliques
- **Équipements de communication:** Radios, pagers

**Fonctionnalités:**
- Suivi des inspections et maintenances planifiées
- Alertes d'expiration et de péremption
- Historique complet des interventions par équipement
- Gestion des stocks et inventaires
- Personnes ressources par catégorie d'équipement
- Codes-barres et QR codes pour identification rapide
- Rapports d'état et statistiques

**Module EPI Personnel:**
- Chaque employé peut consulter ses propres EPI
- Inspection mensuelle obligatoire avec formulaire dédié
- Alertes automatiques pour inspections en retard
- Historique des inspections

---

### 4. 🚨 Module Interventions (Cartes d'appel)
**Accès:** Tous les utilisateurs

**Fonctionnalités:**
- Import automatique des cartes d'appel via SFTP (fichiers XML)
- Saisie manuelle des interventions
- Gestion complète du rapport d'intervention :
  - Identification (numéro, date, heure, adresse, type)
  - Chronologie détaillée (alerte, départ, arrivée, contrôle, fin)
  - Ressources humaines avec heures partielles
  - Véhicules déployés
  - Narratif structuré avec modèles
  - DSI (Déclaration de Sinistre Incendie)
  - Photos et documents joints
  
**Validation et signature:**
- Workflow de validation multi-niveaux
- Signature électronique des rapports
- Personnes ressources et validateurs désignés
- Conformité DSI automatisée

**Statistiques et rapports:**
- Temps de réponse moyens
- Types d'interventions
- Analyses par secteur géographique
- Export PDF des rapports individuels

**🚨 Facturation des fausses alarmes:**
- Suivi automatique des alarmes non fondées par adresse
- Compteur avec période configurable (annuelle ou 12 mois roulants)
- Seuil de gratuité paramétrable
- Facturation fixe ou progressive
- Alertes automatiques aux administrateurs
- Suggestions de facturation et exemptions

---

### 5. 💰 Module Paie
**Accès:** Administrateurs, Superviseurs

**Fonctionnalités:**
- Calcul automatique des heures travaillées
- Gestion des différents taux horaires :
  - Taux régulier
  - Temps supplémentaire
  - Primes de nuit/week-end
  - Fonction supérieure
  - Gardes
- Primes de repas (déjeuner, dîner, souper)
- Intégration avec les interventions pour calcul automatique
- Périodes de paie personnalisables
- Export pour logiciels de paie externes
- Rapports détaillés par employé et par période
- Heures partielles d'intervention

---

### 6. 📅 Module Horaire (Planning)
**Accès:** Tous les utilisateurs

**Fonctionnalités:**
- Calendrier interactif multi-vues (jour, semaine, mois)
- Gestion des quarts de travail
- Rotation automatique des équipes de garde
- Types de rotation supportés :
  - 24 heures
  - 48 heures
  - Hebdomadaire
  - Personnalisé
- Visualisation par équipe ou par employé
- Conflits de planification détectés automatiquement
- Export et impression du planning

---

### 7. 🔄 Module Remplacements
**Accès:** Tous les utilisateurs

**Fonctionnalités:**
- Demandes de remplacement en ligne
- Workflow d'approbation automatisé
- Système d'offres aux remplaçants disponibles
- Notifications automatiques (email + in-app)
- Gestion des congés avec types personnalisables :
  - Vacances
  - Maladie
  - Personnel
  - Formation
  - Autres
- Calendrier des absences
- Historique complet des remplacements
- Timeout automatique des offres non répondues

**Délégation automatique des responsabilités:**
- Détection des personnes ressources en congé
- Transfert automatique des notifications aux admins/superviseurs
- Notifications de début et fin de délégation

---

### 8. 📚 Module Formations
**Accès:** Tous les utilisateurs

**Fonctionnalités:**
- Catalogue des formations disponibles
- Suivi des certifications par employé
- Dates d'expiration et renouvellements
- Alertes automatiques avant expiration
- Planification des sessions de formation
- Gestion des présences
- Documents et attestations
- Compétences et grades associés
- Validations de compétences

---

### 9. 🔥 Module Prévention (Optionnel)
**Accès:** Administrateurs, Superviseurs, Préventionnistes

**Fonctionnalités:**
- **Gestion des bâtiments:**
  - Registre complet des bâtiments à risque
  - Classification par catégorie et niveau de risque
  - Informations des propriétaires/responsables
  - Historique des visites

- **Visites d'inspection:**
  - Planification des visites périodiques
  - Formulaires d'inspection personnalisables
  - Photos et documents joints
  - Géolocalisation

- **Non-conformités:**
  - Suivi des anomalies détectées
  - Workflow de résolution
  - Délais de correction
  - Relances automatiques
  - Avis de non-conformité officiels

- **Rapports:**
  - Statistiques par secteur
  - Taux de conformité
  - Bâtiments en retard de visite

- **Assignation des préventionnistes:**
  - Par secteur géographique
  - Par type de bâtiment

---

### 10. 📋 Module Disponibilités
**Accès:** Temps partiels, Temporaires, Administrateurs

**Fonctionnalités:**
- Déclaration des disponibilités hebdomadaires
- Calendrier interactif de saisie
- Validation par les superviseurs
- Intégration avec le planning
- Historique des disponibilités
- Paramètres de périodes et délais

---

### 11. 🛡️ Module Mes EPI
**Accès:** Tous les employés

**Fonctionnalités:**
- Liste des EPI assignés à l'employé
- Inspection mensuelle obligatoire
- Formulaire d'auto-inspection
- Signalement des problèmes
- Historique des inspections
- Rappels automatiques

---

### 12. 👤 Mon Profil
**Accès:** Tous les utilisateurs

**Fonctionnalités:**
- Consultation des informations personnelles
- Modification des coordonnées
- Changement de mot de passe
- Photo de profil
- Préférences de notification
- Historique des connexions

---

### 13. 📈 Module Rapports
**Accès:** Administrateurs

**Fonctionnalités:**
- Rapports d'heures par période
- Statistiques d'interventions
- Rapports de conformité
- Exports personnalisables (PDF, Excel)
- Graphiques et visualisations
- Rapports d'activité du personnel

---

### 14. ⚙️ Paramètres
**Accès:** Administrateurs

**Configuration générale:**
- Informations de l'organisation
- Logo et personnalisation
- Paramètres de notification

**Configuration par module:**
- **Interventions:** Templates narratifs, validateurs, DSI
- **Paie:** Taux horaires, primes, périodes
- **Planning:** Types de quarts, rotations
- **Remplacements:** Types de congés, délais
- **Actifs:** Catégories, personnes ressources
- **Prévention:** Secteurs, types de bâtiments

**Gestion des utilisateurs:**
- Création et modification des comptes
- Attribution des rôles
- Réinitialisation des mots de passe

---

## 🔔 Système de Notifications

**Types de notifications:**
- Alertes d'équipements (maintenance, expiration)
- Demandes de remplacement
- Validations en attente
- Nouvelles interventions
- Formations à renouveler
- Non-conformités en prévention
- Délégations de responsabilités

**Canaux:**
- Notifications in-app en temps réel
- Emails automatiques
- Messages de diffusion (broadcast)

---

## 🔐 Sécurité et Accès

**Rôles utilisateurs:**
- **Administrateur:** Accès complet à tous les modules
- **Superviseur:** Gestion opérationnelle sans paramètres avancés
- **Employé/Pompier:** Accès aux fonctions personnelles et consultation

**Fonctionnalités de sécurité:**
- Authentification sécurisée
- Sessions avec expiration automatique
- Journalisation des actions
- Isolation des données par tenant

---

## 📱 Interface Utilisateur

- Design moderne et responsive
- Compatible desktop, tablette et mobile
- Interface intuitive avec icônes visuelles
- Mode sombre disponible
- Recherche rapide dans tous les modules
- Filtres et tri avancés

---

## 🔗 Intégrations

- **Import SFTP:** Récupération automatique des cartes d'appel XML
- **Export:** PDF et Excel pour tous les rapports
- **API REST:** Intégration avec systèmes externes
- **Email:** Notifications automatiques via service d'envoi

---

## 📊 Points Forts

✅ **Solution tout-en-un** - Un seul outil pour toutes les opérations

✅ **Multi-tenant** - Idéal pour les regroupements et MRC

✅ **Automatisation** - Calculs de paie, rotations, alertes

✅ **Conformité** - DSI, inspections, certifications

✅ **Mobilité** - Accessible partout, sur tous les appareils

✅ **Support local** - Développé au Québec, en français

✅ **Évolutif** - Modules activables selon les besoins

---

## 📞 Contact

Pour plus d'informations ou une démonstration:
- Site web: [votre site]
- Email: [votre email]
- Téléphone: [votre téléphone]

---

*Document généré le 12 février 2026*
*Version: ProFireManager 2.0*
