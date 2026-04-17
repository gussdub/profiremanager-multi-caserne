# 🔍 AUDIT DES LOGIQUES DE REMPLACEMENTS

**Date**: 2025-01-XX  
**Demandé par**: Utilisateur (Tenant: demo)  
**Objectif**: Vérifier et valider le bon fonctionnement des 3 stratégies de remplacement

---

## 📋 RÉSUMÉ EXÉCUTIF

### ✅ **Points Forts**
1. ✅ Architecture modulaire bien organisée (`/routes/remplacements/`)
2. ✅ Workflow de timeout et relance fonctionne correctement
3. ✅ Gestion des heures silencieuses implémentée
4. ✅ Système de tentatives historiques (`tentatives_historique`) en place
5. ✅ Notifications multi-canal (Push, Email, SMS, In-app)
6. ✅ Gestion des priorités (Urgente, Haute, Normale, Faible)

### ⚠️ **Anomalie Critique Détectée**

**PROBLÈME MAJEUR**: Le backend ne différencie PAS les 3 modes de notification correctement.

#### Symptôme
Le frontend offre 3 choix :
- ⚡ **Simultané** - Tous en même temps
- 🎯 **Séquentiel** - Un par un
- 🔀 **Groupes séquentiels** - Par groupes

**MAIS** le code backend (`remplacements_routes.py`, ligne 339) ne gère que 2 cas :
```python
if mode_notification == "multiple":
    nombre_a_contacter = min(nombre_simultane, len(remplacants))
else:
    nombre_a_contacter = 1
```

#### Valeurs attendues vs Valeurs réelles

| **Modèle (`models.py`)** | **Frontend (UI)** | **Backend (code)** | **Statut** |
|---------------------------|-------------------|-------------------|------------|
| `"simultane"` | ✅ Présent | ❌ Non traité | ⚠️ INCOHÉRENCE |
| `"sequentiel"` | ✅ Présent | ❌ Traité comme défaut (1 par 1) | ⚠️ INCOHÉRENCE |
| `"groupe_sequentiel"` | ✅ Présent | ❌ Non implémenté | ❌ MANQUANT |
| `"multiple"` | ❌ Absent | ✅ Présent dans le code | 🤔 LEGACY? |
| `"un_par_un"` | ❌ Absent | ✅ Utilisé comme fallback | 🤔 LEGACY? |

---

## 📊 ANALYSE DÉTAILLÉE PAR MODE

### 1. MODE SIMULTANÉ (`simultane`)

**Objectif théorique** : Contacter TOUS les remplaçants potentiels en même temps.

**Implémentation actuelle** :
- ❌ La valeur `"simultane"` n'est **jamais vérifiée** dans le code
- ❌ Le code vérifie uniquement `if mode_notification == "multiple"` (ligne 339)
- ⚠️ Si l'utilisateur sélectionne "Simultané" dans le frontend, le code **ne contacte qu'1 seule personne** (fallback `else`)

**Code problématique** (`remplacements_routes.py` lignes 339-342) :
```python
if mode_notification == "multiple":
    nombre_a_contacter = min(nombre_simultane, len(remplacants))
else:
    nombre_a_contacter = 1
```

**Ce qui devrait être** :
```python
if mode_notification == "simultane":
    nombre_a_contacter = len(remplacants)  # TOUS
elif mode_notification == "groupe_sequentiel":
    nombre_a_contacter = parametres_data.get("taille_groupe", 3)
else:  # sequentiel
    nombre_a_contacter = 1
```

**Verdict** : 🔴 **NON FONCTIONNEL** si l'utilisateur choisit vraiment "Simultané" dans l'UI

---

### 2. MODE SÉQUENTIEL (`sequentiel`)

**Objectif théorique** : Contacter UNE personne à la fois, attendre le timeout, puis passer à la suivante.

**Implémentation actuelle** :
- ✅ Le code contacte bien 1 personne (fallback `else`)
- ✅ Le système de timeout fonctionne (`verifier_et_traiter_timeouts_workflow`)
- ✅ Après timeout, la relance se fait via `lancer_recherche_remplacant()`
- ✅ Les personnes déjà contactées sont exclues (`exclus_ids`)

**Flux séquentiel observé** :
1. **Tentative 1** : Contact Pompier A → Timeout après X minutes
2. **Tentative 2** : Contact Pompier B (A exclu) → Timeout après X minutes
3. **Tentative 3** : Contact Pompier C (A, B exclus) → etc.

**Code fonctionnel** (`remplacements_routes.py` lignes 182-191) :
```python
exclus_ids = [t.get("user_id") for t in demande_data.get("tentatives_historique", [])]

remplacants = await trouver_remplacants_potentiels(
    db=db,
    tenant_id=tenant_id,
    type_garde_id=demande_data["type_garde_id"],
    date_garde=demande_data["date"],
    demandeur_id=demande_data["demandeur_id"],
    exclus_ids=exclus_ids  # ✅ Exclusion des déjà contactés
)
```

**Verdict** : ✅ **FONCTIONNEL** (mode par défaut, probablement ce que l'utilisateur a testé)

---

### 3. MODE GROUPES SÉQUENTIELS (`groupe_sequentiel`)

**Objectif théorique** : Contacter un GROUPE de N personnes, attendre le timeout, puis passer au groupe suivant.

**Exemple** : Si `taille_groupe = 3` et 10 candidats disponibles
- **Tentative 1** : Contact Pompiers A, B, C → Timeout 15 min
- **Tentative 2** : Contact Pompiers D, E, F → Timeout 15 min
- **Tentative 3** : Contact Pompiers G, H, I → Timeout 15 min
- **Tentative 4** : Contact Pompier J

**Implémentation actuelle** :
- ❌ La valeur `"groupe_sequentiel"` n'est **jamais vérifiée** dans le code backend
- ❌ Le paramètre `taille_groupe` est **ignoré** (présent uniquement dans le modèle)
- ⚠️ Si l'utilisateur sélectionne "Groupes séquentiels", le système contacte **1 seule personne** (comme mode séquentiel)

**Ce qui manque** :
```python
if mode_notification == "groupe_sequentiel":
    taille_groupe = parametres_data.get("taille_groupe", 3)
    nombre_a_contacter = min(taille_groupe, len(remplacants))
```

**Verdict** : 🔴 **NON IMPLÉMENTÉ** 

---

## 🔄 FLUX DE WORKFLOW (Relance après Timeout)

### Scénario : Refus ou Timeout

**Fichier** : `workflow.py` (lignes 265-332)

**Flux de refus** :
1. Remplaçant clique "Refuser"
2. ➡️ Statut tentative = `"refused"` dans historique
3. ➡️ Retrait de `remplacants_contactes_ids`
4. ➡️ Si liste vide → Relance `lancer_recherche_remplacant()`

**Flux de timeout** :
1. Job périodique détecte `date_prochaine_tentative` dépassée
2. ➡️ Marque toutes les tentatives en cours comme `"expired"`
3. ➡️ Réinitialise `remplacants_contactes_ids = []`
4. ➡️ Relance `lancer_recherche_remplacant()`

**Code de timeout** (`workflow.py` lignes 436-464) :
```python
# Marquer les tentatives comme expirées
for remplacant_id in demande.get("remplacants_contactes_ids", []):
    await db.demandes_remplacement.update_one(
        {
            "id": demande["id"],
            "tentatives_historique.user_id": remplacant_id,
            "tentatives_historique.statut": "contacted"
        },
        {
            "$set": {
                "tentatives_historique.$.statut": "expired",
                "tentatives_historique.$.date_reponse": maintenant.isoformat()
            }
        }
    )

# Réinitialiser la liste des contactés
await db.demandes_remplacement.update_one(
    {"id": demande["id"]},
    {
        "$set": {
            "remplacants_contactes_ids": [],
            "updated_at": maintenant
        }
    }
)

# Relancer la recherche
if lancer_recherche_remplacant:
    await lancer_recherche_remplacant(demande["id"], demande["tenant_id"])
```

**Verdict** : ✅ **FONCTIONNEL** - Le système de relance est robuste

---

## 🧩 GESTION DES CAS LIMITES

### 1. Heures Silencieuses 🌙

**Fonctionnement** : Les demandes de priorité **Normale** et **Faible** sont mises en pause entre `heure_debut_silence` (21:00) et `heure_fin_silence` (07:00).

**Code** (`remplacements_routes.py` lignes 163-180) :
```python
if priorite not in ["urgent", "haute"] and heures_silencieuses_actif:
    if est_dans_heures_silencieuses(heure_debut_silence, heure_fin_silence):
        prochaine_reprise = calculer_prochaine_heure_active(heure_fin_silence)
        
        await db.demandes_remplacement.update_one(
            {"id": demande_id},
            {
                "$set": {
                    "en_pause_silencieuse": True,
                    "reprise_contacts_prevue": prochaine_reprise.isoformat()
                }
            }
        )
        return  # ✅ Pause jusqu'au matin
```

**Verdict** : ✅ **FONCTIONNEL**

---

### 2. Quart Ouvert (Aucun remplaçant trouvé)

**Fonctionnement** : Si aucun candidat ne correspond aux critères, la demande passe en statut `"ouvert"` et TOUS les employés sont notifiés.

**Code** (`remplacements_routes.py` lignes 197-336) :
- ✅ Statut changé en `"ouvert"`
- ✅ Notification à tous les employés actifs (sauf demandeur)
- ✅ Email au demandeur
- ✅ Notification aux superviseurs

**Verdict** : ✅ **FONCTIONNEL**

---

### 3. Acceptation d'un remplacement

**Fonctionnement** : Dès qu'un remplaçant accepte :
1. ✅ Statut de la demande → `"accepte"`
2. ✅ Mise à jour du planning (`assignations`)
3. ✅ Notification au demandeur (Push + Email + In-app)
4. ✅ Notification aux superviseurs
5. ✅ Notification aux autres remplaçants contactés ("Quart pourvu")

**Code** (`workflow.py` lignes 20-256)

**Verdict** : ✅ **FONCTIONNEL**

---

## 🔢 DÉLAIS PAR PRIORITÉ

Le système supporte 4 niveaux de priorité avec des délais configurables :

| Priorité | Délai par défaut | Ignore heures silencieuses |
|----------|------------------|----------------------------|
| 🚨 **Urgente** | 5 minutes | ✅ OUI |
| 🔥 **Haute** | 15 minutes | ✅ OUI |
| 📋 **Normale** | 60 minutes | ❌ NON |
| 📝 **Faible** | 120 minutes | ❌ NON |

**Code** (`remplacements_routes.py` lignes 139-158)

**Verdict** : ✅ **FONCTIONNEL**

---

## 🎯 ALGORITHME DE SÉLECTION DES REMPLAÇANTS

**Fichier** : `search.py` (530 lignes)

### Filtres appliqués (N0 - Filtres absolus) :
1. ✅ Compétences requises par le type de garde
2. ✅ Compétences équivalentes au demandeur (si activé)
3. ✅ Pas d'indisponibilité déclarée
4. ✅ Règle officier (si type de garde nécessite un officier)
5. ✅ Pas de conflit horaire (chevauchement de garde)

### Classification par niveau (N2-N5) :
- **N2** : Temps partiel DISPONIBLES (ont déclaré leur disponibilité)
- **N3** : Temps partiel STAND-BY (pas de disponibilité déclarée)
- **N4** : Temps plein INCOMPLETS (n'ont pas atteint leur maximum d'heures)
- **N5** : HEURES SUPPLÉMENTAIRES (dépassent leur maximum)

### Tri interne (par niveau) :
1. **Priorité grade** : Grade équivalent > Fonction supérieure > Autre
2. **Priorité équipe de garde** : Membre de l'équipe du jour > Autres
3. **Équitabilité** : Moins d'heures mensuelles = priorité
4. **Ancienneté** : Plus ancien = priorité

**Code de tri** (`search.py` lignes 502-508) :
```python
def sort_key(candidat):
    return (
        candidat.get("grade_priorite", 3),      # 1=équivalent, 2=fonction sup, 3=autre
        candidat.get("equipe_priorite", 1),     # 0=membre équipe garde, 1=autre
        candidat.get("heures_mois", 999),       # Équitabilité
        candidat.get("date_embauche", "2999-12-31")  # Ancienneté
    )
```

**Verdict** : ✅ **TRÈS ROBUSTE** - Algorithme de recherche bien conçu

---

## 📈 RÉSUMÉ DES CONSTATS

### ✅ Ce qui fonctionne bien
1. ✅ **Mode Séquentiel** : Contact 1 par 1 avec timeout et relance
2. ✅ **Workflow de timeout** : Détection et relance automatique
3. ✅ **Gestion des refus** : Exclusion des refus et passage au suivant
4. ✅ **Heures silencieuses** : Pause nocturne pour priorités Normale/Faible
5. ✅ **Quart ouvert** : Broadcast à tous si aucun candidat
6. ✅ **Notifications multi-canal** : Push, Email, SMS, In-app
7. ✅ **Algorithme de recherche** : Filtres et tri multi-niveaux robustes
8. ✅ **Priorités différenciées** : Délais configurables par niveau

### ⚠️ Ce qui ne fonctionne PAS
1. ❌ **Mode Simultané** : N'est pas reconnu par le backend → Contacte 1 seule personne au lieu de tous
2. ❌ **Mode Groupes Séquentiels** : N'est pas implémenté → Se comporte comme Séquentiel (1 par 1)

### 🤔 Points d'attention
- Le code contient des valeurs legacy (`"multiple"`, `"un_par_un"`) qui ne correspondent plus au modèle actuel
- L'utilisateur mentionne que "séquentiel fonctionne bien" → C'est normal, c'est le mode par défaut (fallback `else`)

---

## 🛠️ RECOMMANDATIONS

### 🔴 Critique (À corriger immédiatement)

**Correction 1 : Aligner les valeurs du mode de notification**

**Fichier** : `/app/backend/routes/remplacements_routes.py` (ligne 339)

**Remplacer** :
```python
if mode_notification == "multiple":
    nombre_a_contacter = min(nombre_simultane, len(remplacants))
else:
    nombre_a_contacter = 1
```

**Par** :
```python
if mode_notification == "simultane":
    # Simultané : contacter TOUS les remplaçants potentiels
    nombre_a_contacter = len(remplacants)
elif mode_notification == "groupe_sequentiel":
    # Groupes séquentiels : contacter un groupe de taille N
    taille_groupe = parametres_data.get("taille_groupe", 3)
    nombre_a_contacter = min(taille_groupe, len(remplacants))
else:  # "sequentiel" ou valeur par défaut
    # Séquentiel : contacter UNE personne à la fois
    nombre_a_contacter = 1
```

---

**Correction 2 : Supprimer les valeurs legacy**

Remplacer les fallbacks (lignes 122, 137) :
```python
# AVANT
mode_notification = "un_par_un"

# APRÈS
mode_notification = "sequentiel"
```

---

**Correction 3 : Ajouter une limite raisonnable au mode Simultané**

Pour éviter d'envoyer 200 emails en même temps, ajouter une limite :
```python
if mode_notification == "simultane":
    # Limiter à max_contacts pour éviter le spam
    max_contacts = parametres_data.get("max_contacts", 50)
    nombre_a_contacter = min(len(remplacants), max_contacts)
```

---

### 🟡 Améliorations suggérées (Optionnel)

1. **Ajouter des logs de debug** pour identifier quel mode est utilisé :
```python
logger.info(f"🎯 Mode de notification: {mode_notification} → {nombre_a_contacter} personne(s) à contacter")
```

2. **Ajouter une validation** dans le modèle Pydantic :
```python
from pydantic import validator

class ParametresRemplacements(BaseModel):
    mode_notification: str = "sequentiel"
    
    @validator('mode_notification')
    def validate_mode(cls, v):
        valid_modes = ['simultane', 'sequentiel', 'groupe_sequentiel']
        if v not in valid_modes:
            raise ValueError(f"Mode invalide. Doit être l'un de: {valid_modes}")
        return v
```

3. **Frontend** : Ajouter un indicateur visuel pour montrer quel mode est actuellement actif

---

## 📝 CONCLUSION

### Réponse à la question de l'utilisateur

> "Peux-tu vérifier et valider que dans paramètre/remplacements, les logiques de remplacements (Séquentielle, Séquentielle groupe, Simultané/Tout le monde) fonctionnent bien ?"

**Réponse** :

✅ **Mode Séquentiel** : FONCTIONNE parfaitement  
❌ **Mode Simultané** : NE FONCTIONNE PAS (contacte 1 personne au lieu de tous)  
❌ **Mode Groupes Séquentiels** : N'EST PAS IMPLÉMENTÉ (se comporte comme Séquentiel)

**Cause racine** : Incohérence entre les valeurs du modèle/frontend (`"simultane"`, `"sequentiel"`, `"groupe_sequentiel"`) et le code backend qui vérifie `"multiple"` et `"un_par_un"`.

**Impact utilisateur** :
- Si l'utilisateur choisit "Séquentiel" → ✅ Fonctionne
- Si l'utilisateur choisit "Simultané" → ❌ Contacte quand même 1 par 1
- Si l'utilisateur choisit "Groupes séquentiels" → ❌ Contacte 1 par 1 (au lieu de groupes de 3)

**Effort de correction** : 🟢 FAIBLE (15 minutes - modification de 10 lignes de code)

---

## 📎 FICHIERS CLÉS ANALYSÉS

1. ✅ `/app/backend/routes/remplacements/models.py` - Modèles Pydantic
2. ✅ `/app/backend/routes/remplacements/workflow.py` - Logique d'acceptation/refus/timeout
3. ✅ `/app/backend/routes/remplacements/search.py` - Algorithme de recherche de candidats
4. ✅ `/app/backend/routes/remplacements/notifications.py` - Envoi d'emails/SMS
5. ✅ `/app/backend/routes/remplacements_routes.py` - Routes principales ⚠️ CONTIENT L'ANOMALIE
6. ✅ `/app/frontend/src/components/ParametresRemplacements.jsx` - Interface de configuration

---

**Audit réalisé par** : Agent E1 (Fork)  
**Statut final** : ⚠️ ANOMALIE DÉTECTÉE - Correction recommandée
