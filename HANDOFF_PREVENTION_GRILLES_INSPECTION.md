# 🔥 HANDOFF SUMMARY - Module Prévention : Grilles d'Inspection Complètes

**Date** : 28 avril 2026
**Priorité** : P0 - CRITIQUE
**Complexité** : 🔴 ÉLEVÉE (6-7h de développement)
**Statut** : 🟡 EN COURS (Phase 1 - 10% complété)

---

## 📋 CONTEXTE & BESOIN UTILISATEUR

L'utilisateur gère une application de gestion pour services d'incendie canadiens. Le **module Prévention** permet de créer des grilles d'inspection personnalisées pour les bâtiments.

### Problème Principal
La création de grilles d'inspection est **limitée** : 
- Seulement 12 types de champs sur 23 attendus
- Pas de champs auto-rempli (Inspecteur, Lieu, Météo)
- Pas de lien dynamique avec les référentiels de violation
- Pas de création automatique d'anomalies selon les réponses

---

## 🎯 OBJECTIFS COMPLETS

### Phase 1 : Ajout de 11 Types de Champs Manquants ✅ 10% FAIT
**Statut** : Les types sont ajoutés dans `typesChamp` mais le **rendu n'est pas implémenté**

**Types ajoutés** :
1. ✅ `nombre_unite` - Nombre avec unité (ex: 5 mètres)
2. ✅ `curseur` - Curseur/Slider (0-100)
3. ✅ `chronometre` - Chronomètre (démarrer/arrêter)
4. ✅ `compte_rebours` - Compte à rebours (timer)
5. ✅ `qr_code` - Scan QR/Code-barres
6. ✅ `calcul_auto` - Calcul automatique (formules)
7. ✅ `inspecteur_auto` - Nom de l'inspecteur (auto-rempli)
8. ✅ `lieu_auto` - Lieu GPS ou adresse (auto-rempli)
9. ✅ `meteo_auto` - Météo actuelle (auto-rempli)

**⚠️ TÂCHE RESTANTE** :
- Implémenter le **rendu** de chaque type dans le formulaire d'inspection
- Implémenter la **configuration** de chaque type lors de la création
- Implémenter la **validation** de chaque type

### Phase 2 : Système d'Anomalies Dynamiques ❌ 0% FAIT

**Objectif** : Créer automatiquement une anomalie (non-conformité) selon la réponse donnée.

**Fonctionnalités à implémenter** :
1. **Lien avec référentiels de violation**
   - Lors de la configuration d'une question, permettre de lier un article de loi
   - Dropdown intelligent avec recherche par mots-clés
   - Tri par fréquence d'utilisation (articles les plus utilisés en haut)

2. **Création automatique d'anomalie**
   - Si réponse = "Non conforme" → Créer une anomalie
   - Lier l'anomalie à l'article de violation sélectionné
   - Gravité et date de correction automatiques (depuis le référentiel)

3. **Configuration dans la grille**
   - Champ "Déclencher une alerte si" (déjà présent dans l'UI)
   - Ajouter "Article de violation" (dropdown intelligent)
   - Sauvegarder dans la structure de la question

**Structure de données attendue** :
```javascript
{
  question: "Les extincteurs sont-ils conformes ?",
  type: "conforme_non_conforme",
  alerte: {
    declencheur: "non_conforme",  // Quand déclencher
    article_id: "ref_extincteur_123",  // ID du référentiel
    creer_anomalie: true
  }
}
```

### Phase 3 : Référentiels de Violation ❌ 0% FAIT

**Localisation** : `Prévention > Paramètres > Référentiel de Violation`

**Structure actuelle** (à vérifier) :
```javascript
{
  id: "ref_extincteur_123",
  article: "NFPA 10 - 5.2.1",
  titre: "Entretien des extincteurs",
  description: "Les extincteurs doivent être inspectés mensuellement",
  gravite: "Majeure",  // ou "Mineure"
  delai_correction: 30,  // jours
  frequence_utilisation: 45  // nombre d'utilisations
}
```

**Fonctionnalités à implémenter** :
1. **Compteur de fréquence**
   - Incrémenter `frequence_utilisation` à chaque utilisation
   - Stocker dans MongoDB

2. **Recherche intelligente**
   - Recherche full-text sur `article`, `titre`, `description`
   - Tri par pertinence + fréquence
   - Ex: "extincteur" → Affiche tous les articles liés aux extincteurs, les plus utilisés en haut

3. **API Backend**
   - `GET /api/{tenant}/prevention/referentiels?search=extincteur`
   - Retourne les référentiels triés par fréquence

### Phase 4 : Audit Complet ❌ 0% FAIT

Tester tous les workflows :
1. Création d'une grille avec tous les types de champs
2. Remplissage d'une inspection
3. Création automatique d'anomalies
4. Vérification des champs auto-rempli
5. Export des données

---

## 📁 FICHIERS CLÉS

### Frontend
- **`/app/frontend/src/components/GrillesInspectionComponents.jsx`** (1239 lignes)
  - **Ligne 162-189** : Types de champs (✅ MODIFIÉ - 11 types ajoutés)
  - **À trouver** : Fonction de rendu des champs (chercher `renderField` ou `switch`)
  - **À trouver** : Configuration des questions (formulaire d'ajout d'item)
  
- **`/app/frontend/src/components/ParametresPrevention.jsx`** (348 lignes)
  - Gestion des référentiels de violation
  - À vérifier : Structure des données
  
- **`/app/frontend/src/components/InspectionComponents.jsx`**
  - Remplissage des inspections
  - Rendu des champs pendant l'inspection
  
- **`/app/frontend/src/components/Prevention.jsx`**
  - Composant principal du module

### Backend
- **`/app/backend/routes/prevention.py`** (à localiser)
  - Routes pour grilles d'inspection
  - Routes pour référentiels de violation
  - Route pour création d'anomalies
  
- **`/app/backend/routes/anomalies.py`** (à localiser)
  - Création automatique d'anomalies
  
---

## 🔧 IMPLÉMENTATION DÉTAILLÉE

### Étape 1 : Implémenter le Rendu des Nouveaux Types

**Localiser** la fonction de rendu (probablement dans `GrillesInspectionComponents.jsx` ou `InspectionComponents.jsx`).

**Exemple de structure attendue** :
```javascript
const renderFieldInput = (item, value, onChange) => {
  switch (item.type) {
    case 'nombre_unite':
      return (
        <div className="flex gap-2">
          <Input type="number" value={value?.nombre || ''} onChange={...} />
          <Input placeholder="Unité" value={value?.unite || ''} onChange={...} />
        </div>
      );
      
    case 'curseur':
      return (
        <input 
          type="range" 
          min={item.config?.min || 0} 
          max={item.config?.max || 100}
          value={value || 50}
          onChange={(e) => onChange(parseInt(e.target.value))}
        />
      );
      
    case 'chronometre':
      return <ChronometerComponent value={value} onChange={onChange} />;
      
    case 'inspecteur_auto':
      return (
        <Input 
          value={value || user?.prenom + ' ' + user?.nom} 
          readOnly 
          className="bg-gray-100"
        />
      );
      
    case 'lieu_auto':
      return <LieuAutoComponent batiment={batiment} onChange={onChange} />;
      
    case 'meteo_auto':
      return <MeteoAutoComponent location={location} onChange={onChange} />;
      
    // ... autres types
  }
};
```

### Étape 2 : Configuration des Nouveaux Types

**Localiser** le formulaire d'ajout d'item/question (probablement ligne 800-1000 dans `GrillesInspectionComponents.jsx`).

**Ajouter** les champs de configuration pour chaque nouveau type :
```javascript
{item.type === 'nombre_unite' && (
  <div>
    <Label>Unité par défaut</Label>
    <Input placeholder="Ex: mètres, kg, litres" />
  </div>
)}

{item.type === 'curseur' && (
  <>
    <Label>Min / Max</Label>
    <div className="flex gap-2">
      <Input type="number" placeholder="Min" />
      <Input type="number" placeholder="Max" />
    </div>
  </>
)}

{item.type === 'calcul_auto' && (
  <div>
    <Label>Formule</Label>
    <Input placeholder="Ex: {champ1} + {champ2}" />
  </div>
)}
```

### Étape 3 : Lien avec Référentiels de Violation

**1. Créer un composant de recherche intelligent** :
```javascript
// ReferentielSearch.jsx
const ReferentielSearch = ({ value, onChange, questionType }) => {
  const [search, setSearch] = useState('');
  const [referentiels, setReferentiels] = useState([]);
  
  useEffect(() => {
    const fetchReferentiels = async () => {
      const results = await apiGet(tenantSlug, `/prevention/referentiels?search=${search}`);
      // Triés par fréquence côté backend
      setReferentiels(results);
    };
    fetchReferentiels();
  }, [search]);
  
  return (
    <div>
      <Input 
        placeholder="Rechercher un article (ex: extincteur)" 
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="mt-2 max-h-48 overflow-y-auto">
        {referentiels.map(ref => (
          <div 
            key={ref.id}
            onClick={() => onChange(ref.id)}
            className={`p-2 cursor-pointer ${value === ref.id ? 'bg-blue-100' : 'hover:bg-gray-50'}`}
          >
            <div className="font-bold">{ref.article}</div>
            <div className="text-sm text-gray-600">{ref.titre}</div>
            <div className="text-xs text-gray-400">Utilisé {ref.frequence_utilisation} fois</div>
          </div>
        ))}
      </div>
    </div>
  );
};
```

**2. Ajouter dans la configuration de question** :
```javascript
{/* Dans le formulaire d'item, après "Configuration des alertes" */}
{item.alerte?.declencheur && (
  <div className="mt-4">
    <Label>Article de violation (optionnel)</Label>
    <ReferentielSearch 
      value={item.alerte?.article_id} 
      onChange={(id) => updateItem(sectionIndex, itemIndex, {
        ...item,
        alerte: { ...item.alerte, article_id: id, creer_anomalie: true }
      })}
    />
  </div>
)}
```

### Étape 4 : Backend - Référentiels de Violation

**Fichier** : `/app/backend/routes/prevention.py` (à créer ou modifier)

```python
@router.get("/{tenant_slug}/prevention/referentiels")
async def get_referentiels(
    tenant_slug: str,
    search: str = "",
    db = Depends(get_db),
    tenant = Depends(get_tenant_from_slug)
):
    """
    Recherche intelligente dans les référentiels de violation
    Tri par pertinence + fréquence d'utilisation
    """
    query = {"tenant_id": tenant.id}
    
    if search:
        # Recherche full-text
        query["$or"] = [
            {"article": {"$regex": search, "$options": "i"}},
            {"titre": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}}
        ]
    
    referentiels = await db.referentiels_violation.find(
        query,
        {"_id": 0}
    ).sort("frequence_utilisation", -1).to_list(100)
    
    return referentiels
```

### Étape 5 : Création Automatique d'Anomalies

**Fichier** : `/app/backend/routes/inspections.py` (à modifier)

**Lors de la soumission d'une inspection** :
```python
# Analyser les réponses et créer des anomalies
for section in inspection_data['sections']:
    for item in section['items']:
        # Vérifier si cette question déclenche une alerte
        if item.get('alerte') and item['alerte'].get('creer_anomalie'):
            response_value = item.get('reponse')
            declencheur = item['alerte']['declencheur']
            
            # Vérifier si la réponse correspond au déclencheur
            if should_trigger_alert(response_value, declencheur):
                # Récupérer le référentiel
                ref_id = item['alerte'].get('article_id')
                referentiel = await db.referentiels_violation.find_one({
                    "id": ref_id,
                    "tenant_id": tenant.id
                })
                
                # Créer l'anomalie
                anomalie = {
                    "id": str(uuid4()),
                    "tenant_id": tenant.id,
                    "batiment_id": inspection_data['batiment_id'],
                    "inspection_id": inspection_id,
                    "question": item['question'],
                    "reponse": response_value,
                    "article": referentiel['article'],
                    "titre": referentiel['titre'],
                    "gravite": referentiel['gravite'],
                    "date_detection": datetime.now(timezone.utc),
                    "date_correction_prevue": datetime.now(timezone.utc) + timedelta(days=referentiel['delai_correction']),
                    "statut": "ouverte"
                }
                
                await db.anomalies.insert_one(anomalie)
                
                # Incrémenter la fréquence d'utilisation
                await db.referentiels_violation.update_one(
                    {"id": ref_id},
                    {"$inc": {"frequence_utilisation": 1}}
                )
```

---

## 🧪 TESTS À EFFECTUER

### Tests Unitaires par Type
Pour chaque nouveau type de champ, tester :
1. **Configuration** : Peut-on créer une question avec ce type ?
2. **Affichage** : Le champ s'affiche-t-il correctement dans l'inspection ?
3. **Saisie** : Peut-on saisir/modifier une valeur ?
4. **Validation** : Les règles de validation fonctionnent-elles ?
5. **Sauvegarde** : La valeur est-elle sauvegardée correctement ?

### Tests d'Intégration
1. **Workflow complet** :
   - Créer une grille avec les nouveaux types
   - Créer une inspection
   - Remplir l'inspection
   - Vérifier la création d'anomalies automatiques

2. **Champs auto-rempli** :
   - `inspecteur_auto` : Affiche le nom de l'inspecteur connecté
   - `lieu_auto` : Affiche l'adresse du bâtiment ou la position GPS
   - `meteo_auto` : Affiche la météo actuelle (API externe nécessaire)

3. **Référentiels de violation** :
   - Rechercher "extincteur" → Affiche les articles pertinents
   - Vérifier le tri par fréquence
   - Lier un article à une question
   - Créer une inspection avec réponse "Non conforme"
   - Vérifier qu'une anomalie est créée avec le bon article

---

## ⚠️ POINTS D'ATTENTION

### Champs Auto-Rempli
- **Inspecteur** : Utiliser `current_user` du contexte
- **Lieu** : Soit adresse du bâtiment, soit géolocalisation navigateur
- **Météo** : Nécessite une API externe (OpenWeatherMap, etc.)
  - Clé API à demander à l'utilisateur ou utiliser Emergent LLM Key si disponible

### Performance
- Les référentiels de violation peuvent être nombreux (100+)
- Implémenter la pagination si > 50 résultats
- Cache côté frontend pour la recherche

### Mobile
- Les champs comme `qr_code` et `lieu_auto` nécessitent des permissions navigateur
- Tester sur mobile (responsive)

---

## 🚀 PROCHAINES ACTIONS IMMÉDIATES

1. ✅ **Localiser la fonction de rendu** dans `GrillesInspectionComponents.jsx` ou `InspectionComponents.jsx`
2. ✅ **Implémenter le rendu** des 11 nouveaux types un par un
3. ✅ **Ajouter la configuration** de chaque type dans le formulaire
4. ✅ **Créer le composant ReferentielSearch**
5. ✅ **Implémenter la route backend** `/prevention/referentiels`
6. ✅ **Modifier la route d'inspection** pour créer les anomalies automatiquement
7. ✅ **Tester chaque type** individuellement
8. ✅ **Tester le workflow complet**

---

## 📞 QUESTIONS POUR L'UTILISATEUR (si bloqué)

1. **API Météo** : Quelle API utiliser ? Avez-vous une clé API ?
2. **Structure des référentiels** : Confirmer la structure MongoDB actuelle
3. **Anomalies** : Y a-t-il déjà un système d'anomalies en place ?
4. **Priorisation** : Si manque de temps, quels types sont les plus importants ?
   - Champs auto (Inspecteur, Lieu, Météo) ?
   - Champs avancés (Curseur, Chronomètre, QR) ?

---

## 📝 NOTES TECHNIQUES

- React 18+ avec hooks
- MongoDB Atlas (pas local)
- FastAPI backend
- Drag & Drop avec `@dnd-kit`
- Toast notifications avec `use-toast`
- Permissions RBAC (vérifier `user_has_module_action`)

---

## ✅ SUCCÈS ATTENDU

**Frontend** :
- Tous les 23 types de champs disponibles dans la liste
- Configuration fonctionnelle pour chaque type
- Rendu correct dans les inspections
- Auto-rempli fonctionne (Inspecteur, Lieu, Météo)

**Backend** :
- Route de recherche intelligente des référentiels
- Création automatique d'anomalies selon les réponses
- Compteur de fréquence d'utilisation

**UX** :
- Recherche intuitive des articles (ex: "extincteur")
- Tri par fréquence (plus utilisés en haut)
- Workflow fluide de création de grilles

**Cette tâche est CRITIQUE pour le module Prévention. Prendre le temps nécessaire pour bien l'implémenter.** 🔥
