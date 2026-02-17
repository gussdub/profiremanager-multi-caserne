"""
Routes API pour le module Horaires Personnalisés
================================================

Ce module gère la création et gestion des horaires de rotation personnalisés.
Les horaires peuvent être utilisés pour:
- Le planning des gardes (internes/externes)
- Le module disponibilité/indisponibilité
- La rotation des équipes

Chaque horaire définit un cycle (généralement 28 jours) avec des patterns
de travail pour chaque équipe.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
from datetime import datetime, timezone
import uuid
import logging

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    User
)

router = APIRouter(tags=["Horaires Personnalisés"])
logger = logging.getLogger(__name__)


# ==================== MODÈLES PYDANTIC ====================

class SegmentJour(BaseModel):
    """Un segment d'une journée (ex: Jour, Nuit, Repos)"""
    type: str  # "travail", "repos"
    label: str  # "Jour", "Nuit", "Repos", "24h"
    heure_debut: str  # "08:00"
    heure_fin: str  # "20:00"
    couleur: str = "#22C55E"  # Couleur pour l'affichage

class JourTravail(BaseModel):
    """Un jour de travail avec son segment"""
    jour: int  # 1-28
    segment: str = "24h"  # "24h", "jour", "nuit"

class JourCycle(BaseModel):
    """Configuration d'un jour dans le cycle"""
    jour: int  # 1-28
    segments: List[SegmentJour]

class EquipeConfig(BaseModel):
    """Configuration d'une équipe"""
    numero: int
    nom: str
    couleur: str
    jours_travail: List[Any]  # Liste mixte: int ou {jour: int, segment: str}

class HorairePersonnaliseCreate(BaseModel):
    """Modèle pour créer un horaire personnalisé"""
    nom: str = Field(..., min_length=1, max_length=100)
    description: str = ""
    duree_cycle: int = Field(default=28, ge=7, le=56)
    nombre_equipes: int = Field(default=4, ge=1, le=8)
    date_reference: str  # Date où l'équipe 1 commence jour 1 du cycle
    equipes: List[EquipeConfig]
    jours_config: List[JourCycle] = []  # Configuration détaillée par jour (optionnel)
    type_quart: str = "24h"  # "24h", "12h_jour_nuit", "8h"
    heures_quart: Dict[str, str] = {}  # {"jour_debut": "08:00", "jour_fin": "20:00", ...}

class HorairePersonnaliseUpdate(BaseModel):
    """Modèle pour mettre à jour un horaire"""
    nom: Optional[str] = None
    description: Optional[str] = None
    duree_cycle: Optional[int] = None
    nombre_equipes: Optional[int] = None
    date_reference: Optional[str] = None
    equipes: Optional[List[EquipeConfig]] = None
    jours_config: Optional[List[JourCycle]] = None
    type_quart: Optional[str] = None
    heures_quart: Optional[Dict[str, str]] = None


# ==================== HORAIRES PRÉDÉFINIS ====================

HORAIRES_PREDEFINIS = {
    "montreal": {
        "id": "montreal",
        "nom": "Montréal 7/24",
        "description": "Cycle de 28 jours, 4 équipes, 7 jours de travail par cycle",
        "duree_cycle": 28,
        "nombre_equipes": 4,
        "type_quart": "24h",
        "predefini": True,
        "date_reference": "2025-01-27",
        "equipes": [
            {"numero": 1, "nom": "Vert", "couleur": "#22C55E", "jours_travail": [2, 8, 11, 19, 21, 24, 27]},
            {"numero": 2, "nom": "Bleu", "couleur": "#3B82F6", "jours_travail": [3, 6, 9, 15, 18, 26, 28]},
            {"numero": 3, "nom": "Jaune", "couleur": "#EAB308", "jours_travail": [5, 7, 10, 13, 16, 22, 25]},
            {"numero": 4, "nom": "Rouge", "couleur": "#EF4444", "jours_travail": [1, 4, 12, 14, 17, 20, 23]}
        ]
    },
    "quebec": {
        "id": "quebec",
        "nom": "Québec 10/14",
        "description": "Cycle de 28 jours avec rotation 10/14",
        "duree_cycle": 28,
        "nombre_equipes": 4,
        "type_quart": "24h",
        "predefini": True,
        "date_reference": "2026-02-01",
        "equipes": [
            {"numero": 1, "nom": "Vert", "couleur": "#22C55E", "jours_travail": [2, 3, 4, 5, 12, 13, 14, 20, 21, 22, 23, 24, 25]},
            {"numero": 2, "nom": "Bleu", "couleur": "#3B82F6", "jours_travail": [6, 7, 8, 9, 10, 11, 16, 17, 18, 19, 26, 27, 28]},
            {"numero": 3, "nom": "Jaune", "couleur": "#EAB308", "jours_travail": [1, 2, 3, 4, 9, 10, 11, 12, 19, 20, 21, 27, 28]},
            {"numero": 4, "nom": "Rouge", "couleur": "#EF4444", "jours_travail": [5, 6, 7, 13, 14, 15, 16, 17, 18, 23, 24, 25, 26]}
        ]
    },
    "longueuil": {
        "id": "longueuil",
        "nom": "Longueuil 7/24",
        "description": "Cycle de 28 jours, style Longueuil",
        "duree_cycle": 28,
        "nombre_equipes": 4,
        "type_quart": "24h",
        "predefini": True,
        "date_reference": "2026-01-25",
        "equipes": [
            {"numero": 1, "nom": "Vert", "couleur": "#22C55E", "jours_travail": [2, 6, 8, 12, 18, 21, 24]},
            {"numero": 2, "nom": "Bleu", "couleur": "#3B82F6", "jours_travail": [3, 9, 13, 15, 19, 25, 28]},
            {"numero": 3, "nom": "Jaune", "couleur": "#EAB308", "jours_travail": [4, 7, 10, 16, 20, 22, 26]},
            {"numero": 4, "nom": "Rouge", "couleur": "#EF4444", "jours_travail": [1, 5, 11, 14, 17, 23, 27]}
        ]
    }
}


# ==================== ROUTES API ====================

@router.get("/{tenant_slug}/horaires-personnalises")
async def get_horaires(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """
    Récupère tous les horaires disponibles (prédéfinis + personnalisés)
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer les horaires personnalisés du tenant
    horaires_custom = await db.horaires_personnalises.find(
        {"tenant_id": tenant.id}
    ).to_list(100)
    
    # Créer un dict des horaires personnalisés par ID
    custom_by_id = {}
    horaires_custom_clean = []
    for h in horaires_custom:
        h_clean = clean_mongo_doc(h)
        # Si l'ID correspond à un prédéfini, c'est une version modifiée
        if h_clean.get("id") in HORAIRES_PREDEFINIS or h_clean.get("base_predefini_id"):
            h_clean["predefini"] = False
            h_clean["modifie_depuis_predefini"] = True
        else:
            h_clean["predefini"] = False
        custom_by_id[h_clean.get("id")] = h_clean
        # Si c'est basé sur un prédéfini, utiliser l'ID de base pour le remplacement
        base_id = h_clean.get("base_predefini_id")
        if base_id:
            custom_by_id[base_id] = h_clean
        horaires_custom_clean.append(h_clean)
    
    # Combiner: prédéfinis (sauf ceux remplacés) + personnalisés
    all_horaires = []
    for predefini in HORAIRES_PREDEFINIS.values():
        predefini_id = predefini.get("id")
        # Vérifier si ce prédéfini a une version modifiée
        if predefini_id in custom_by_id:
            # Utiliser la version modifiée
            all_horaires.append(custom_by_id[predefini_id])
        else:
            all_horaires.append(predefini)
    
    # Ajouter les horaires totalement personnalisés (pas basés sur un prédéfini)
    for h in horaires_custom_clean:
        if not h.get("base_predefini_id") and h.get("id") not in HORAIRES_PREDEFINIS:
            all_horaires.append(h)
    
    return {
        "horaires": all_horaires,
        "predefinis": list(HORAIRES_PREDEFINIS.values()),
        "personnalises": horaires_custom_clean
    }


@router.get("/{tenant_slug}/horaires-personnalises/{horaire_id}")
async def get_horaire(
    tenant_slug: str,
    horaire_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Récupère un horaire spécifique par ID
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier d'abord si c'est un prédéfini
    if horaire_id in HORAIRES_PREDEFINIS:
        return HORAIRES_PREDEFINIS[horaire_id]
    
    # Sinon chercher dans les personnalisés
    horaire = await db.horaires_personnalises.find_one({
        "tenant_id": tenant.id,
        "id": horaire_id
    })
    
    if not horaire:
        raise HTTPException(status_code=404, detail="Horaire non trouvé")
    
    result = clean_mongo_doc(horaire)
    result["predefini"] = False
    return result


@router.post("/{tenant_slug}/horaires-personnalises")
async def create_horaire(
    tenant_slug: str,
    data: HorairePersonnaliseCreate,
    current_user: User = Depends(get_current_user)
):
    """
    Crée un nouvel horaire personnalisé
    """
    if current_user.role not in ["admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Admin requis")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier que le nom n'existe pas déjà
    existing = await db.horaires_personnalises.find_one({
        "tenant_id": tenant.id,
        "nom": data.nom
    })
    if existing:
        raise HTTPException(status_code=400, detail=f"Un horaire nommé '{data.nom}' existe déjà")
    
    # Créer l'horaire
    horaire_id = str(uuid.uuid4())
    horaire_doc = {
        "id": horaire_id,
        "tenant_id": tenant.id,
        "nom": data.nom,
        "description": data.description,
        "duree_cycle": data.duree_cycle,
        "nombre_equipes": data.nombre_equipes,
        "date_reference": data.date_reference,
        "equipes": [e.dict() for e in data.equipes],
        "jours_config": [j.dict() for j in data.jours_config] if data.jours_config else [],
        "type_quart": data.type_quart,
        "heures_quart": data.heures_quart,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user.email,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.horaires_personnalises.insert_one(horaire_doc)
    logger.info(f"[HORAIRE] Créé: {data.nom} par {current_user.email}")
    
    result = clean_mongo_doc(horaire_doc)
    result["predefini"] = False
    return result


@router.put("/{tenant_slug}/horaires-personnalises/{horaire_id}")
async def update_horaire(
    tenant_slug: str,
    horaire_id: str,
    data: HorairePersonnaliseUpdate,
    current_user: User = Depends(get_current_user)
):
    """
    Met à jour un horaire personnalisé ou crée une version modifiée d'un prédéfini
    """
    if current_user.role not in ["admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Admin requis")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Si c'est un horaire prédéfini, créer ou mettre à jour une version en base
    if horaire_id in HORAIRES_PREDEFINIS:
        # Vérifier si une version modifiée existe déjà
        existing = await db.horaires_personnalises.find_one({
            "tenant_id": tenant.id,
            "base_predefini_id": horaire_id
        })
        
        predefini = HORAIRES_PREDEFINIS[horaire_id]
        
        if existing:
            # Mettre à jour la version existante
            updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
            
            if data.nom is not None:
                updates["nom"] = data.nom
            if data.description is not None:
                updates["description"] = data.description
            if data.duree_cycle is not None:
                updates["duree_cycle"] = data.duree_cycle
            if data.nombre_equipes is not None:
                updates["nombre_equipes"] = data.nombre_equipes
            if data.date_reference is not None:
                updates["date_reference"] = data.date_reference
            if data.equipes is not None:
                updates["equipes"] = [e.dict() for e in data.equipes]
            if data.jours_config is not None:
                updates["jours_config"] = [j.dict() for j in data.jours_config]
            if data.type_quart is not None:
                updates["type_quart"] = data.type_quart
            if data.heures_quart is not None:
                updates["heures_quart"] = data.heures_quart
            
            await db.horaires_personnalises.update_one(
                {"tenant_id": tenant.id, "base_predefini_id": horaire_id},
                {"$set": updates}
            )
            
            updated = await db.horaires_personnalises.find_one({
                "tenant_id": tenant.id,
                "base_predefini_id": horaire_id
            })
            result = clean_mongo_doc(updated)
            result["predefini"] = False
            result["modifie_depuis_predefini"] = True
            logger.info(f"[HORAIRE] Prédéfini '{horaire_id}' mis à jour par {current_user.email}")
            return result
        else:
            # Créer une nouvelle version basée sur le prédéfini
            new_id = str(uuid.uuid4())
            horaire_doc = {
                "id": new_id,
                "tenant_id": tenant.id,
                "base_predefini_id": horaire_id,  # Référence au prédéfini d'origine
                "nom": data.nom if data.nom is not None else predefini.get("nom"),
                "description": data.description if data.description is not None else predefini.get("description", ""),
                "duree_cycle": data.duree_cycle if data.duree_cycle is not None else predefini.get("duree_cycle", 28),
                "nombre_equipes": data.nombre_equipes if data.nombre_equipes is not None else predefini.get("nombre_equipes", 4),
                "date_reference": data.date_reference if data.date_reference is not None else predefini.get("date_reference"),
                "equipes": [e.dict() for e in data.equipes] if data.equipes is not None else predefini.get("equipes", []),
                "jours_config": [j.dict() for j in data.jours_config] if data.jours_config is not None else [],
                "type_quart": data.type_quart if data.type_quart is not None else predefini.get("type_quart", "24h"),
                "heures_quart": data.heures_quart if data.heures_quart is not None else predefini.get("heures_quart"),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "created_by": current_user.email,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            
            await db.horaires_personnalises.insert_one(horaire_doc)
            logger.info(f"[HORAIRE] Version modifiée du prédéfini '{horaire_id}' créée par {current_user.email}")
            
            result = clean_mongo_doc(horaire_doc)
            result["predefini"] = False
            result["modifie_depuis_predefini"] = True
            return result
    
    # Sinon, c'est un horaire personnalisé existant
    horaire = await db.horaires_personnalises.find_one({
        "tenant_id": tenant.id,
        "id": horaire_id
    })
    if not horaire:
        raise HTTPException(status_code=404, detail="Horaire non trouvé")
    
    # Construire les mises à jour
    updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    if data.nom is not None:
        updates["nom"] = data.nom
    if data.description is not None:
        updates["description"] = data.description
    if data.duree_cycle is not None:
        updates["duree_cycle"] = data.duree_cycle
    if data.nombre_equipes is not None:
        updates["nombre_equipes"] = data.nombre_equipes
    if data.date_reference is not None:
        updates["date_reference"] = data.date_reference
    if data.equipes is not None:
        updates["equipes"] = [e.dict() for e in data.equipes]
    if data.jours_config is not None:
        updates["jours_config"] = [j.dict() for j in data.jours_config]
    if data.type_quart is not None:
        updates["type_quart"] = data.type_quart
    if data.heures_quart is not None:
        updates["heures_quart"] = data.heures_quart
    
    await db.horaires_personnalises.update_one(
        {"tenant_id": tenant.id, "id": horaire_id},
        {"$set": updates}
    )
    
    # Retourner l'horaire mis à jour
    updated = await db.horaires_personnalises.find_one({
        "tenant_id": tenant.id,
        "id": horaire_id
    })
    
    result = clean_mongo_doc(updated)
    result["predefini"] = False
    if horaire.get("base_predefini_id"):
        result["modifie_depuis_predefini"] = True
    return result


@router.delete("/{tenant_slug}/horaires-personnalises/{horaire_id}")
async def delete_horaire(
    tenant_slug: str,
    horaire_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Supprime un horaire personnalisé
    """
    if current_user.role not in ["admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Admin requis")
    
    # Empêcher la suppression des prédéfinis
    if horaire_id in HORAIRES_PREDEFINIS:
        raise HTTPException(status_code=400, detail="Les horaires prédéfinis ne peuvent pas être supprimés")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    result = await db.horaires_personnalises.delete_one({
        "tenant_id": tenant.id,
        "id": horaire_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Horaire non trouvé")
    
    logger.info(f"[HORAIRE] Supprimé: {horaire_id} par {current_user.email}")
    
    return {"success": True, "message": "Horaire supprimé"}


@router.post("/{tenant_slug}/horaires-personnalises/{horaire_id}/dupliquer")
async def dupliquer_horaire(
    tenant_slug: str,
    horaire_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Duplique un horaire (prédéfini ou personnalisé) pour créer une version modifiable
    """
    if current_user.role not in ["admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Admin requis")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer l'horaire source
    if horaire_id in HORAIRES_PREDEFINIS:
        source = HORAIRES_PREDEFINIS[horaire_id].copy()
    else:
        source_doc = await db.horaires_personnalises.find_one({
            "tenant_id": tenant.id,
            "id": horaire_id
        })
        if not source_doc:
            raise HTTPException(status_code=404, detail="Horaire source non trouvé")
        source = clean_mongo_doc(source_doc)
    
    # Générer un nouveau nom unique
    base_nom = f"{source['nom']} (copie)"
    count = 1
    new_nom = base_nom
    while await db.horaires_personnalises.find_one({"tenant_id": tenant.id, "nom": new_nom}):
        count += 1
        new_nom = f"{source['nom']} (copie {count})"
    
    # Créer la copie
    new_horaire = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant.id,
        "nom": new_nom,
        "description": source.get("description", ""),
        "duree_cycle": source.get("duree_cycle", 28),
        "nombre_equipes": source.get("nombre_equipes", 4),
        "date_reference": source.get("date_reference", ""),
        "equipes": source.get("equipes", []),
        "jours_config": source.get("jours_config", []),
        "type_quart": source.get("type_quart", "24h"),
        "heures_quart": source.get("heures_quart", {}),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user.email,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "source_id": horaire_id
    }
    
    await db.horaires_personnalises.insert_one(new_horaire)
    logger.info(f"[HORAIRE] Dupliqué: {horaire_id} -> {new_horaire['id']} par {current_user.email}")
    
    result = clean_mongo_doc(new_horaire)
    result["predefini"] = False
    return result


@router.get("/{tenant_slug}/horaires-personnalises/{horaire_id}/apercu")
async def apercu_horaire(
    tenant_slug: str,
    horaire_id: str,
    date_debut: str = None,
    nb_jours: int = 28,
    current_user: User = Depends(get_current_user)
):
    """
    Génère un aperçu du calendrier pour un horaire donné
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer l'horaire
    if horaire_id in HORAIRES_PREDEFINIS:
        horaire = HORAIRES_PREDEFINIS[horaire_id]
    else:
        horaire_doc = await db.horaires_personnalises.find_one({
            "tenant_id": tenant.id,
            "id": horaire_id
        })
        if not horaire_doc:
            raise HTTPException(status_code=404, detail="Horaire non trouvé")
        horaire = clean_mongo_doc(horaire_doc)
    
    # Calculer l'aperçu
    from datetime import datetime, timedelta
    
    if date_debut:
        start_date = datetime.strptime(date_debut, "%Y-%m-%d").date()
    else:
        start_date = datetime.now().date()
    
    date_ref = datetime.strptime(horaire["date_reference"], "%Y-%m-%d").date()
    duree_cycle = horaire.get("duree_cycle", 28)
    type_quart = horaire.get("type_quart", "24h")
    
    apercu = []
    for i in range(nb_jours):
        current_date = start_date + timedelta(days=i)
        # Calculer le nombre de jours depuis la date de référence
        jours_depuis_ref = (current_date - date_ref).days
        
        # Calculer le jour du cycle (1 à duree_cycle)
        # Si date_ref = 1er février et current_date = 1er février: jours_depuis_ref = 0, jour_cycle = 1
        # Si date_ref = 1er février et current_date = 2 février: jours_depuis_ref = 1, jour_cycle = 2
        # etc.
        if jours_depuis_ref >= 0:
            jour_cycle = (jours_depuis_ref % duree_cycle) + 1
        else:
            # Pour les dates avant la date de référence
            # Ex: date_ref = 1er février, current_date = 31 janvier: jours_depuis_ref = -1
            # On veut jour_cycle = 28 (dernier jour du cycle précédent)
            jour_cycle = duree_cycle - ((-jours_depuis_ref - 1) % duree_cycle)
        
        # Trouver quelle équipe travaille ce jour
        # Le format de jours_travail peut être:
        # - Liste d'entiers: [1, 2, 3] (ancien format)
        # - Liste d'objets: [{jour: 1, segment: "jour"}, {jour: 2, segment: "nuit"}] (nouveau format)
        equipe_jour = None
        equipe_nuit = None
        equipe_am = None
        equipe_pm = None
        
        for eq in horaire.get("equipes", []):
            jours_travail = eq.get("jours_travail", [])
            for jt in jours_travail:
                if isinstance(jt, int):
                    # Ancien format: simple entier
                    if jt == jour_cycle:
                        equipe_jour = eq
                        equipe_nuit = eq
                        equipe_am = eq
                        equipe_pm = eq
                        break
                elif isinstance(jt, dict):
                    # Nouveau format: {jour: int, segment: str}
                    if jt.get("jour") == jour_cycle:
                        seg = jt.get("segment", "24h")
                        if seg == "24h":
                            equipe_jour = eq
                            equipe_nuit = eq
                            equipe_am = eq
                            equipe_pm = eq
                        elif seg == "jour":
                            equipe_jour = eq
                        elif seg == "nuit":
                            equipe_nuit = eq
                        elif seg == "am":
                            equipe_am = eq
                        elif seg == "pm":
                            equipe_pm = eq
        
        # Pour l'aperçu, on affiche l'équipe principale selon le type
        if type_quart == "6h_demi_quarts":
            equipe_travail = equipe_am or equipe_pm
        else:
            equipe_travail = equipe_jour or equipe_nuit
        
        apercu.append({
            "date": current_date.strftime("%Y-%m-%d"),
            "jour_semaine": current_date.strftime("%A"),
            "jour_cycle": jour_cycle,
            "equipe": equipe_travail,
            "equipe_jour": equipe_jour,
            "equipe_nuit": equipe_nuit,
            "equipe_am": equipe_am,
            "equipe_pm": equipe_pm,
            "type_quart": type_quart
        })
    
    return {
        "horaire": horaire.get("nom"),
        "date_debut": start_date.strftime("%Y-%m-%d"),
        "nb_jours": nb_jours,
        "apercu": apercu
    }
