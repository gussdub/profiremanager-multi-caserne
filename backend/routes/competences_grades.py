"""
Routes API pour les modules Compétences et Grades
=================================================

STATUT: ACTIF
Ce module gère les compétences et grades des pompiers.

Routes Compétences:
- POST   /{tenant_slug}/competences                    - Créer une compétence
- GET    /{tenant_slug}/competences                    - Liste des compétences
- PUT    /{tenant_slug}/competences/{competence_id}   - Modifier une compétence
- DELETE /{tenant_slug}/competences/{competence_id}   - Supprimer une compétence
- POST   /{tenant_slug}/competences/clean-invalid     - Nettoyer compétences invalides

Routes Grades:
- POST   /{tenant_slug}/grades                - Créer un grade
- GET    /{tenant_slug}/grades                - Liste des grades
- PUT    /{tenant_slug}/grades/{grade_id}     - Modifier un grade
- DELETE /{tenant_slug}/grades/{grade_id}     - Supprimer un grade

Routes Échelle Salariale:
- GET    /{tenant_slug}/echelle-salariale              - Récupérer l'échelle salariale
- POST   /{tenant_slug}/echelle-salariale              - Créer/mettre à jour l'échelle
- POST   /{tenant_slug}/echelle-salariale/generer-annee - Générer les taux pour une nouvelle année
- PUT    /{tenant_slug}/grades/{grade_id}/prime        - Définir la prime d'un grade
- GET    /{tenant_slug}/users/{user_id}/salaire        - Calculer le salaire d'un employé
- PUT    /{tenant_slug}/users/{user_id}/echelon        - Modifier l'échelon d'embauche d'un employé
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone
import uuid
import logging

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    User,
    require_permission,
    user_has_module_action
)

router = APIRouter(tags=["Compétences & Grades"])
logger = logging.getLogger(__name__)


# ==================== MODÈLES COMPÉTENCES ====================

class Competence(BaseModel):
    """Compétence avec exigences NFPA 1500"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str
    description: str = ""
    heures_requises_annuelles: float = 0.0
    obligatoire: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CompetenceCreate(BaseModel):
    tenant_id: Optional[str] = None
    nom: str
    description: str = ""
    heures_requises_annuelles: float = 0.0
    obligatoire: bool = False


class CompetenceUpdate(BaseModel):
    nom: Optional[str] = None
    description: Optional[str] = None
    heures_requises_annuelles: Optional[float] = None
    obligatoire: Optional[bool] = None


# ==================== MODÈLES GRADES ====================

class Grade(BaseModel):
    """Grade hiérarchique pour les pompiers"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str
    niveau_hierarchique: int  # 1 = niveau le plus bas, 10 = niveau le plus haut
    est_officier: bool = False  # True si ce grade est considéré comme un officier
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class GradeCreate(BaseModel):
    tenant_id: Optional[str] = None
    nom: str
    niveau_hierarchique: int
    est_officier: bool = False


class GradeUpdate(BaseModel):
    nom: Optional[str] = None
    niveau_hierarchique: Optional[int] = None
    est_officier: Optional[bool] = None


# ==================== ROUTES COMPÉTENCES ====================

@router.post("/{tenant_slug}/competences", response_model=Competence)
async def create_competence(
    tenant_slug: str,
    competence: CompetenceCreate,
    current_user: User = Depends(get_current_user)
):
    """Crée une compétence"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de création sur le module formations/competences
    await require_permission(tenant.id, current_user, "formations", "creer", "competences")
    
    competence_dict = competence.dict()
    competence_dict["tenant_id"] = tenant.id
    competence_obj = Competence(**competence_dict)
    
    comp_data = competence_obj.dict()
    comp_data["created_at"] = competence_obj.created_at.isoformat()
    
    await db.competences.insert_one(comp_data)
    return competence_obj


@router.get("/{tenant_slug}/competences", response_model=List[Competence])
async def get_competences(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère toutes les compétences"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    competences = await db.competences.find({"tenant_id": tenant.id}).to_list(1000)
    cleaned = [clean_mongo_doc(c) for c in competences]
    
    for c in cleaned:
        if isinstance(c.get("created_at"), str):
            c["created_at"] = datetime.fromisoformat(c["created_at"].replace('Z', '+00:00'))
    
    return [Competence(**c) for c in cleaned]


@router.put("/{tenant_slug}/competences/{competence_id}", response_model=Competence)
async def update_competence(
    tenant_slug: str,
    competence_id: str,
    competence_update: CompetenceUpdate,
    current_user: User = Depends(get_current_user)
):
    """Met à jour une compétence"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de modification sur le module formations/competences
    await require_permission(tenant.id, current_user, "formations", "modifier", "competences")
    
    update_data = {k: v for k, v in competence_update.dict().items() if v is not None}
    
    result = await db.competences.update_one(
        {"id": competence_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Compétence non trouvée")
    
    updated = await db.competences.find_one({"id": competence_id, "tenant_id": tenant.id})
    cleaned = clean_mongo_doc(updated)
    
    if isinstance(cleaned.get("created_at"), str):
        cleaned["created_at"] = datetime.fromisoformat(cleaned["created_at"].replace('Z', '+00:00'))
    
    return Competence(**cleaned)


@router.delete("/{tenant_slug}/competences/{competence_id}")
async def delete_competence(
    tenant_slug: str,
    competence_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprime une compétence"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de suppression sur le module formations/competences
    await require_permission(tenant.id, current_user, "formations", "supprimer", "competences")
    
    result = await db.competences.delete_one({"id": competence_id, "tenant_id": tenant.id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Compétence non trouvée")
    
    return {"message": "Compétence supprimée"}


@router.post("/{tenant_slug}/competences/clean-invalid")
async def clean_invalid_competences(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Nettoie les compétences invalides/obsolètes des utilisateurs
    
    Supprime des profils utilisateurs toutes les compétences qui n'existent plus 
    dans la collection competences.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de modification sur le module formations/competences
    await require_permission(tenant.id, current_user, "formations", "modifier", "competences")
    
    # Récupérer tous les IDs de compétences valides
    valid_competences = await db.competences.find({"tenant_id": tenant.id}, {"id": 1, "_id": 0}).to_list(1000)
    valid_competence_ids = {c["id"] for c in valid_competences}
    
    # Récupérer tous les utilisateurs avec des compétences
    users = await db.users.find(
        {"tenant_id": tenant.id, "competences": {"$exists": True, "$ne": []}},
        {"id": 1, "competences": 1, "prenom": 1, "nom": 1, "_id": 0}
    ).to_list(1000)
    
    cleaned_count = 0
    invalid_removed = 0
    
    for user in users:
        original_competences = user.get("competences", [])
        # Filtrer pour ne garder que les compétences valides
        valid_user_competences = [c_id for c_id in original_competences if c_id in valid_competence_ids]
        
        if len(valid_user_competences) < len(original_competences):
            # Il y avait des compétences invalides
            removed = len(original_competences) - len(valid_user_competences)
            invalid_removed += removed
            cleaned_count += 1
            
            # Mettre à jour l'utilisateur
            await db.users.update_one(
                {"id": user["id"], "tenant_id": tenant.id},
                {"$set": {"competences": valid_user_competences}}
            )
            
            logger.info(f"🧹 Nettoyage: {user['prenom']} {user['nom']} - {removed} compétence(s) invalide(s) supprimée(s)")
    
    return {
        "message": "Nettoyage terminé",
        "users_cleaned": cleaned_count,
        "invalid_competences_removed": invalid_removed
    }


# ==================== ROUTES GRADES ====================

@router.post("/{tenant_slug}/grades", response_model=Grade)
async def create_grade(
    tenant_slug: str,
    grade: GradeCreate,
    current_user: User = Depends(get_current_user)
):
    """Crée un grade"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de création sur le module parametres/grades
    await require_permission(tenant.id, current_user, "parametres", "creer")
    
    # Vérifier si le grade existe déjà
    existing = await db.grades.find_one({"nom": grade.nom, "tenant_id": tenant.id})
    if existing:
        raise HTTPException(status_code=400, detail="Ce grade existe déjà")
    
    grade_dict = grade.dict()
    grade_dict["tenant_id"] = tenant.id
    grade_obj = Grade(**grade_dict)
    
    grade_data = grade_obj.dict()
    grade_data["created_at"] = grade_obj.created_at.isoformat()
    grade_data["updated_at"] = grade_obj.updated_at.isoformat()
    
    await db.grades.insert_one(grade_data)
    return grade_obj


@router.get("/{tenant_slug}/grades", response_model=List[Grade])
async def get_grades(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère tous les grades triés par niveau hiérarchique"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    grades = await db.grades.find({"tenant_id": tenant.id}).sort("niveau_hierarchique", 1).to_list(1000)
    cleaned = [clean_mongo_doc(g) for g in grades]
    
    for g in cleaned:
        if isinstance(g.get("created_at"), str):
            g["created_at"] = datetime.fromisoformat(g["created_at"].replace('Z', '+00:00'))
        if isinstance(g.get("updated_at"), str):
            g["updated_at"] = datetime.fromisoformat(g["updated_at"].replace('Z', '+00:00'))
    
    return [Grade(**g) for g in cleaned]


@router.put("/{tenant_slug}/grades/{grade_id}", response_model=Grade)
async def update_grade(
    tenant_slug: str,
    grade_id: str,
    grade_update: GradeUpdate,
    current_user: User = Depends(get_current_user)
):
    """Met à jour un grade"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de modification sur le module parametres
    await require_permission(tenant.id, current_user, "parametres", "modifier")
    
    update_data = {k: v for k, v in grade_update.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.grades.update_one(
        {"id": grade_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Grade non trouvé")
    
    updated = await db.grades.find_one({"id": grade_id, "tenant_id": tenant.id})
    cleaned = clean_mongo_doc(updated)
    
    if isinstance(cleaned.get("created_at"), str):
        cleaned["created_at"] = datetime.fromisoformat(cleaned["created_at"].replace('Z', '+00:00'))
    if isinstance(cleaned.get("updated_at"), str):
        cleaned["updated_at"] = datetime.fromisoformat(cleaned["updated_at"].replace('Z', '+00:00'))
    
    return Grade(**cleaned)


@router.delete("/{tenant_slug}/grades/{grade_id}")
async def delete_grade(
    tenant_slug: str,
    grade_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprime un grade si aucun employé ne l'utilise"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de suppression sur le module parametres
    await require_permission(tenant.id, current_user, "parametres", "supprimer")
    
    # Vérifier si le grade existe
    existing_grade = await db.grades.find_one({"id": grade_id, "tenant_id": tenant.id})
    if not existing_grade:
        raise HTTPException(status_code=404, detail="Grade non trouvé")
    
    # Vérifier si des employés utilisent ce grade
    users_count = await db.users.count_documents({"grade": existing_grade["nom"], "tenant_id": tenant.id})
    
    if users_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Impossible de supprimer ce grade. {users_count} employé(s) l'utilisent actuellement. Veuillez d'abord réassigner ces employés à un autre grade."
        )
    
    result = await db.grades.delete_one({"id": grade_id, "tenant_id": tenant.id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Grade non trouvé")
    
    return {"message": "Grade supprimé avec succès"}


# ==================== MODÈLES ÉCHELLE SALARIALE ====================

class Echelon(BaseModel):
    """Un échelon dans l'échelle salariale"""
    numero: int  # 1, 2, 3, etc.
    libelle: str  # "1ère année", "2ème année", etc.
    taux_horaire: float  # Taux en dollars


class EchelleSalariale(BaseModel):
    """Échelle salariale complète pour un tenant"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    annee: int  # Année de référence (ex: 2026)
    taux_indexation: float = 3.0  # Pourcentage d'indexation annuelle
    prime_fonction_superieure_pct: float = 10.0  # Prime % pour fonction supérieure (FS)
    echelons: List[Echelon] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class EchelleSalarialeCreate(BaseModel):
    annee: int
    taux_indexation: float = 3.0
    prime_fonction_superieure_pct: float = 10.0
    echelons: List[Echelon] = []


class EchelonUpdate(BaseModel):
    numero: Optional[int] = None
    libelle: Optional[str] = None
    taux_horaire: Optional[float] = None


class PrimeGradeUpdate(BaseModel):
    prime_pourcentage: float = 0.0  # Pourcentage de prime (ex: 10 pour +10%)


class EchelonEmbaucheUpdate(BaseModel):
    echelon_embauche: int  # Échelon de départ à l'embauche


class SalaireEmployeResponse(BaseModel):
    """Réponse avec les informations salariales d'un employé"""
    user_id: str
    nom_complet: str
    grade: str
    date_embauche: Optional[str]
    anciennete_mois: int
    anciennete_texte: str
    echelon_embauche: int
    echelon_actuel: int
    echelon_libelle: str
    taux_horaire_base: float
    prime_grade_pourcentage: float
    prime_grade_montant: float
    taux_horaire_final: float
    annee_reference: int


# ==================== ROUTES ÉCHELLE SALARIALE ====================

@router.get("/{tenant_slug}/echelle-salariale")
async def get_echelle_salariale(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère l'échelle salariale du tenant"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    echelle = await db.echelles_salariales.find_one(
        {"tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not echelle:
        # Retourner une échelle vide par défaut
        return {
            "id": None,
            "tenant_id": tenant.id,
            "annee": datetime.now().year,
            "taux_indexation": 3.0,
            "prime_fonction_superieure_pct": 10.0,
            "echelons": []
        }
    
    return echelle


@router.post("/{tenant_slug}/echelle-salariale")
async def create_or_update_echelle_salariale(
    tenant_slug: str,
    echelle_data: EchelleSalarialeCreate,
    current_user: User = Depends(get_current_user)
):
    """Crée ou met à jour l'échelle salariale du tenant"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de modification sur le module parametres
    await require_permission(tenant.id, current_user, "parametres", "modifier")
    
    existing = await db.echelles_salariales.find_one({"tenant_id": tenant.id})
    
    now = datetime.now(timezone.utc).isoformat()
    
    if existing:
        # Mise à jour
        update_data = {
            "annee": echelle_data.annee,
            "taux_indexation": echelle_data.taux_indexation,
            "prime_fonction_superieure_pct": echelle_data.prime_fonction_superieure_pct,
            "echelons": [e.dict() for e in echelle_data.echelons],
            "updated_at": now
        }
        await db.echelles_salariales.update_one(
            {"tenant_id": tenant.id},
            {"$set": update_data}
        )
        return {"message": "Échelle salariale mise à jour", "id": existing["id"]}
    else:
        # Création
        echelle = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant.id,
            "annee": echelle_data.annee,
            "taux_indexation": echelle_data.taux_indexation,
            "prime_fonction_superieure_pct": echelle_data.prime_fonction_superieure_pct,
            "echelons": [e.dict() for e in echelle_data.echelons],
            "created_at": now,
            "updated_at": now
        }
        await db.echelles_salariales.insert_one(echelle)
        return {"message": "Échelle salariale créée", "id": echelle["id"]}


@router.post("/{tenant_slug}/echelle-salariale/generer-annee")
async def generer_taux_nouvelle_annee(
    tenant_slug: str,
    nouvelle_annee: int,
    current_user: User = Depends(get_current_user)
):
    """Génère les taux pour une nouvelle année en appliquant l'indexation"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de modification sur le module parametres
    await require_permission(tenant.id, current_user, "parametres", "modifier")
    
    echelle = await db.echelles_salariales.find_one({"tenant_id": tenant.id})
    
    if not echelle or not echelle.get("echelons"):
        raise HTTPException(status_code=400, detail="Aucune échelle salariale existante")
    
    if nouvelle_annee <= echelle.get("annee", 0):
        raise HTTPException(
            status_code=400, 
            detail=f"L'année {nouvelle_annee} doit être supérieure à l'année actuelle ({echelle.get('annee')})"
        )
    
    # Calculer le facteur d'indexation
    taux_indexation = echelle.get("taux_indexation", 3.0) / 100
    annees_diff = nouvelle_annee - echelle.get("annee", datetime.now().year)
    facteur = (1 + taux_indexation) ** annees_diff
    
    # Appliquer l'indexation à chaque échelon
    nouveaux_echelons = []
    for echelon in echelle.get("echelons", []):
        nouveau_taux = round(echelon["taux_horaire"] * facteur, 2)
        nouveaux_echelons.append({
            "numero": echelon["numero"],
            "libelle": echelon["libelle"],
            "taux_horaire": nouveau_taux
        })
    
    # Mettre à jour l'échelle
    await db.echelles_salariales.update_one(
        {"tenant_id": tenant.id},
        {
            "$set": {
                "annee": nouvelle_annee,
                "echelons": nouveaux_echelons,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    return {
        "message": f"Taux générés pour {nouvelle_annee} avec indexation de {echelle.get('taux_indexation', 3.0)}%",
        "nouvelle_annee": nouvelle_annee,
        "echelons": nouveaux_echelons
    }


@router.put("/{tenant_slug}/grades/{grade_id}/prime")
async def update_grade_prime(
    tenant_slug: str,
    grade_id: str,
    prime_data: PrimeGradeUpdate,
    current_user: User = Depends(get_current_user)
):
    """Met à jour la prime (%) associée à un grade"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de modification sur le module parametres
    await require_permission(tenant.id, current_user, "parametres", "modifier")
    
    # Vérifier que le grade existe
    grade = await db.grades.find_one({"id": grade_id, "tenant_id": tenant.id})
    if not grade:
        raise HTTPException(status_code=404, detail="Grade non trouvé")
    
    # Mettre à jour la prime
    await db.grades.update_one(
        {"id": grade_id, "tenant_id": tenant.id},
        {
            "$set": {
                "prime_pourcentage": prime_data.prime_pourcentage,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    return {
        "message": f"Prime de {prime_data.prime_pourcentage}% définie pour le grade {grade['nom']}",
        "grade_id": grade_id,
        "prime_pourcentage": prime_data.prime_pourcentage
    }


@router.get("/{tenant_slug}/users/{user_id}/salaire", response_model=SalaireEmployeResponse)
async def get_salaire_employe(
    tenant_slug: str,
    user_id: str,
    current_user: User = Depends(get_current_user)
):
    """Calcule et retourne les informations salariales d'un employé"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer l'employé
    user = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
    if not user:
        raise HTTPException(status_code=404, detail="Employé non trouvé")
    
    # Récupérer l'échelle salariale
    echelle = await db.echelles_salariales.find_one({"tenant_id": tenant.id})
    
    # Récupérer le grade pour la prime
    grade_nom = user.get("grade", "")
    grade = await db.grades.find_one({"nom": grade_nom, "tenant_id": tenant.id})
    prime_pourcentage = grade.get("prime_pourcentage", 0) if grade else 0
    
    # Calculer l'ancienneté
    date_embauche_str = user.get("date_embauche")
    anciennete_mois = 0
    anciennete_texte = "Non définie"
    
    if date_embauche_str:
        try:
            if isinstance(date_embauche_str, str):
                # Essayer plusieurs formats de date
                date_embauche = None
                formats_to_try = [
                    "%Y-%m-%d",      # ISO format: 2026-01-29
                    "%d/%m/%Y",      # FR format: 29/01/2026
                    "%d-%m-%Y",      # FR format with dashes: 29-01-2026
                    "%Y-%m-%dT%H:%M:%S",  # ISO datetime
                    "%Y-%m-%dT%H:%M:%SZ", # ISO datetime with Z
                ]
                for fmt in formats_to_try:
                    try:
                        date_embauche = datetime.strptime(date_embauche_str.split('T')[0] if 'T' in date_embauche_str else date_embauche_str, fmt.split('T')[0])
                        break
                    except ValueError:
                        continue
                
                if date_embauche is None:
                    # Dernier essai avec fromisoformat
                    date_embauche = datetime.fromisoformat(date_embauche_str.replace('Z', '+00:00'))
            else:
                date_embauche = date_embauche_str
            
            now = datetime.now(timezone.utc)
            if date_embauche.tzinfo is None:
                date_embauche = date_embauche.replace(tzinfo=timezone.utc)
            diff = now - date_embauche
            anciennete_mois = int(diff.days / 30.44)  # Moyenne de jours par mois
            
            annees = anciennete_mois // 12
            mois = anciennete_mois % 12
            if annees > 0:
                anciennete_texte = f"{annees} an{'s' if annees > 1 else ''}"
                if mois > 0:
                    anciennete_texte += f" {mois} mois"
            else:
                anciennete_texte = f"{mois} mois"
        except Exception as e:
            logger.warning(f"Erreur parsing date_embauche '{date_embauche_str}': {e}")
    
    # Déterminer l'échelon
    echelon_embauche = user.get("echelon_embauche", 1)
    annees_depuis_embauche = anciennete_mois // 12
    echelon_actuel = echelon_embauche + annees_depuis_embauche
    
    # Plafonner à l'échelon max si échelle existe
    echelons = echelle.get("echelons", []) if echelle else []
    echelon_max = max([e["numero"] for e in echelons]) if echelons else 1
    echelon_actuel = min(echelon_actuel, echelon_max)
    
    # Trouver le taux horaire de base
    taux_horaire_base = 0.0
    echelon_libelle = f"Échelon {echelon_actuel}"
    
    for e in echelons:
        if e["numero"] == echelon_actuel:
            taux_horaire_base = e["taux_horaire"]
            echelon_libelle = e["libelle"]
            break
    
    # Calculer la prime et le taux final
    prime_montant = round(taux_horaire_base * (prime_pourcentage / 100), 2)
    taux_horaire_final = round(taux_horaire_base + prime_montant, 2)
    
    return SalaireEmployeResponse(
        user_id=user_id,
        nom_complet=f"{user.get('prenom', '')} {user.get('nom', '')}".strip(),
        grade=grade_nom,
        date_embauche=date_embauche_str,
        anciennete_mois=anciennete_mois,
        anciennete_texte=anciennete_texte,
        echelon_embauche=echelon_embauche,
        echelon_actuel=echelon_actuel,
        echelon_libelle=echelon_libelle,
        taux_horaire_base=taux_horaire_base,
        prime_grade_pourcentage=prime_pourcentage,
        prime_grade_montant=prime_montant,
        taux_horaire_final=taux_horaire_final,
        annee_reference=echelle.get("annee", datetime.now().year) if echelle else datetime.now().year
    )


@router.put("/{tenant_slug}/users/{user_id}/echelon")
async def update_echelon_embauche(
    tenant_slug: str,
    user_id: str,
    echelon_data: EchelonEmbaucheUpdate,
    current_user: User = Depends(get_current_user)
):
    """Met à jour l'échelon d'embauche d'un employé"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de modification sur le module personnel
    # On utilise une action spéciale "modifier_salaire" ou simplement "modifier"
    await require_permission(tenant.id, current_user, "personnel", "modifier")
    
    # Vérifier que l'employé existe
    user = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
    if not user:
        raise HTTPException(status_code=404, detail="Employé non trouvé")
    
    # Vérifier que l'échelon est valide
    echelle = await db.echelles_salariales.find_one({"tenant_id": tenant.id})
    if echelle and echelle.get("echelons"):
        echelons_valides = [e["numero"] for e in echelle["echelons"]]
        if echelon_data.echelon_embauche not in echelons_valides:
            raise HTTPException(
                status_code=400, 
                detail=f"Échelon invalide. Échelons disponibles: {echelons_valides}"
            )
    
    # Mettre à jour l'échelon
    await db.users.update_one(
        {"id": user_id, "tenant_id": tenant.id},
        {"$set": {"echelon_embauche": echelon_data.echelon_embauche}}
    )
    
    return {
        "message": f"Échelon d'embauche mis à jour à {echelon_data.echelon_embauche}",
        "user_id": user_id,
        "echelon_embauche": echelon_data.echelon_embauche
    }

