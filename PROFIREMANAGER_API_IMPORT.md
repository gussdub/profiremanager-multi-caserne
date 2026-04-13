# PROFIREMANAGER — API Import Batch (Endpoint Générique)

## Endpoint
```
POST /api/{TENANT}/import/batch
Content-Type: application/json
Authorization: Bearer {token}
```

## Body
```json
{
  "entity_type": "Intervention",
  "source_system": "PremLigne",
  "record": { ... }
}
```

## Entity Types Supportés

### Entités principales
| entity_type | Collection MongoDB | Détection doublons |
|---|---|---|
| `Intervention` | `interventions` | `num_activite` |
| `DossierAdresse` | `batiments` | adresse + ville |
| `Prevention` | `inspections` | `num_activite` |
| `RCCI` | `rcci` | `num_activite` |
| `PlanIntervention` | `plans_intervention` | `num_activite` |
| `Employe` | `imported_personnel` | `matricule` |
| `BorneIncendie` | `points_eau` | `nom` |
| `BorneSeche` | `points_eau` | `nom` |
| `PointEau` | `points_eau` | `nom` |
| `MaintenanceBorne` | `maintenance_bornes` | `num_activite` |
| `Travail` | `travaux` | `num_activite` |

### Référentiels (stockage générique dans `ref_{type}`)
Caserne, Grade, Equipe, Vehicule, CodeAppel, TypePrevention, TypeBatiment,
TypeEquipement, ModeleBorne, TypeValve, UsageBorne, Raccord, Classification, ReferenceCode

## Réponses
```json
{"status": "created", "entity_type": "Intervention", "id": "uuid", "batiment_id": "uuid-ou-null"}
{"status": "duplicate", "entity_type": "Intervention", "id": "uuid-existant"}
{"status": "error", "entity_type": "DossierAdresse", "message": "Adresse manquante"}
```

## Fonctionnalités automatiques
- **Auto-match bâtiment** : Intervention, Prevention, RCCI, PlanIntervention → matchés automatiquement par adresse
- **Mapping rétroactif** : Quand un DossierAdresse est créé, les interventions/préventions orphelines sont auto-reliées
- **Record complet stocké** : Le `pfm_record` est conservé tel quel pour consultation future
- **Cache bâtiments** : 60s de cache pour le matching (performance ~300 records/min)

## Upload fichiers
Séparé, après chaque record :
```
POST /api/{TENANT}/files/upload?category=import-history&entity_type=intervention&entity_id={uuid}
Content-Type: multipart/form-data
Body: file=@174038.jpg
```
