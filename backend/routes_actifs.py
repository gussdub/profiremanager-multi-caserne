"""
Routes API pour le module Gestion des Actifs
Véhicules, Bornes, Tests, Inspections SAAQ
"""

from fastapi import APIRouter, Depends, HTTPException, Body
from typing import List, Optional
from datetime import datetime
import qrcode
from io import BytesIO
import base64

# Import des modèles (à adapter selon votre structure)
from models_actifs import (
    Vehicle, VehicleType, VehicleStatus,
    InspectionSAAQ, Defect, DefectSeverity,
    BorneIncendie, BorneType, BorneStatus,
    TestDebitBorne, ChecklistTemplate,
    GeoLocation, AuditLog
)

# Supposons que vous avez ces fonctions dans server.py
# from server import get_current_user, get_tenant_from_slug, db, User

router = APIRouter(prefix="/actifs", tags=["Gestion Actifs"])


# ===== HELPERS =====

def calculate_nfpa_color(gpm: float) -> str:
    """Calcule la couleur NFPA 291 selon le débit"""
    if gpm >= 1500:
        return "blue"
    elif gpm >= 1000:
        return "green"
    elif gpm >= 500:
        return "orange"
    else:
        return "red"


def generate_qr_code(data: str) -> str:
    """Génère un QR code en base64"""
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(data)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = BytesIO()
    img.save(buffer, format='PNG')
    buffer.seek(0)
    
    img_base64 = base64.b64encode(buffer.getvalue()).decode()
    return f"data:image/png;base64,{img_base64}"


# ===== ROUTES VÉHICULES =====

@router.get("/{tenant_slug}/vehicules")
async def get_vehicules(
    tenant_slug: str,
    status: Optional[VehicleStatus] = None,
    # current_user: User = Depends(get_current_user)
):
    """Liste tous les véhicules du tenant"""
    # tenant = await get_tenant_from_slug(tenant_slug)
    
    # query = {"tenant_id": tenant.id}
    # if status:
    #     query["status"] = status
    
    # vehicules = await db.vehicles.find(query, {"_id": 0}).to_list(1000)
    # return vehicules
    
    # PLACEHOLDER pour test
    return {
        "message": "Endpoint véhicules - À implémenter avec db",
        "tenant": tenant_slug,
        "filter_status": status
    }


@router.post("/{tenant_slug}/vehicules")
async def create_vehicule(
    tenant_slug: str,
    vehicle: Vehicle,
    # current_user: User = Depends(get_current_user)
):
    """Créer un nouveau véhicule"""
    # Validation role admin/superviseur
    # if current_user.role not in ["admin", "superviseur"]:
    #     raise HTTPException(status_code=403, detail="Accès refusé")
    
    # tenant = await get_tenant_from_slug(tenant_slug)
    # vehicle.tenant_id = tenant.id
    
    # Générer QR code
    qr_data = f"vehicle:{vehicle.id}"
    vehicle.qr_code = generate_qr_code(qr_data)
    
    # Audit log
    # vehicle.logs.append(AuditLog(
    #     date=datetime.now(),
    #     user_id=current_user.id,
    #     user_name=f"{current_user.prenom} {current_user.nom}",
    #     action="created",
    #     details=f"Véhicule {vehicle.numero} créé"
    # ))
    
    # await db.vehicles.insert_one(vehicle.dict())
    
    return {
        "message": "Véhicule créé (placeholder)",
        "vehicle_id": vehicle.id,
        "qr_generated": True
    }


@router.put("/{tenant_slug}/vehicules/{vehicle_id}")
async def update_vehicule(
    tenant_slug: str,
    vehicle_id: str,
    updates: dict,
    # current_user: User = Depends(get_current_user)
):
    """Mettre à jour un véhicule"""
    # Vérifier si changement de statut
    if "status" in updates and updates["status"] == VehicleStatus.HORS_SERVICE.value:
        updates["status_reason"] = updates.get("status_reason", "Défectuosité majeure")
    
    updates["updated_at"] = datetime.now()
    
    # result = await db.vehicles.update_one(
    #     {"id": vehicle_id, "tenant_id": tenant.id},
    #     {"$set": updates}
    # )
    
    return {
        "message": "Véhicule mis à jour (placeholder)",
        "vehicle_id": vehicle_id
    }


# ===== ROUTES INSPECTIONS SAAQ =====

@router.post("/{tenant_slug}/vehicules/{vehicle_id}/inspection-saaq")
async def create_inspection_saaq(
    tenant_slug: str,
    vehicle_id: str,
    inspection_data: dict,
    # current_user: User = Depends(get_current_user)
):
    """Créer une inspection SAAQ (Ronde de sécurité)"""
    
    # Créer l'inspection
    inspection = InspectionSAAQ(
        tenant_id="tenant_id_placeholder",
        vehicle_id=vehicle_id,
        inspector_id="user_id",
        inspector_name="Nom Inspecteur",
        signature_certify=inspection_data.get("certify", False),
        signature_timestamp=datetime.now(),
        checklist=inspection_data.get("checklist", {}),
        defects=[]
    )
    
    # Analyser les défectuosités
    for defect_data in inspection_data.get("defects", []):
        defect = Defect(
            item=defect_data["item"],
            severity=DefectSeverity(defect_data["severity"]),
            description=defect_data["description"],
            reported_by="user_id",
            reported_at=datetime.now()
        )
        inspection.defects.append(defect)
        
        # Si défectuosité majeure, véhicule hors service
        if defect.severity == DefectSeverity.MAJEURE:
            inspection.has_major_defect = True
    
    inspection.passed = not inspection.has_major_defect
    
    # await db.inspections_saaq.insert_one(inspection.dict())
    
    # Si défaut majeur, mettre véhicule hors service
    if inspection.has_major_defect:
        # await db.vehicles.update_one(
        #     {"id": vehicle_id},
        #     {"$set": {
        #         "status": VehicleStatus.HORS_SERVICE.value,
        #         "status_reason": "Défectuosité majeure détectée"
        #     }}
        # )
        pass
    
    return {
        "message": "Inspection créée (placeholder)",
        "inspection_id": inspection.id,
        "vehicle_status": "hors_service" if inspection.has_major_defect else "en_service"
    }


@router.get("/{tenant_slug}/vehicules/{vehicle_id}/inspections")
async def get_inspections_vehicule(
    tenant_slug: str,
    vehicle_id: str,
    limit: int = 50
):
    """Historique des inspections d'un véhicule"""
    # inspections = await db.inspections_saaq.find(
    #     {"vehicle_id": vehicle_id},
    #     {"_id": 0}
    # ).sort("inspection_date", -1).limit(limit).to_list(limit)
    
    return {
        "message": "Historique inspections (placeholder)",
        "vehicle_id": vehicle_id
    }


# ===== ROUTES BORNES =====

@router.get("/{tenant_slug}/bornes")
async def get_bornes(
    tenant_slug: str,
    status: Optional[BorneStatus] = None,
    type: Optional[BorneType] = None,
    bbox: Optional[str] = None  # "lon1,lat1,lon2,lat2" pour filtrage géographique
):
    """Liste toutes les bornes avec filtres optionnels"""
    
    # Si bbox fourni, utiliser geospatial query MongoDB
    # query = {"tenant_id": tenant.id}
    # if bbox:
    #     coords = [float(x) for x in bbox.split(",")]
    #     query["location"] = {
    #         "$geoWithin": {
    #             "$box": [[coords[0], coords[1]], [coords[2], coords[3]]]
    #         }
    #     }
    
    return {
        "message": "Liste bornes (placeholder)",
        "filters": {"status": status, "type": type, "bbox": bbox}
    }


@router.post("/{tenant_slug}/bornes")
async def create_borne(
    tenant_slug: str,
    borne: BorneIncendie
):
    """Créer une nouvelle borne"""
    
    # Générer QR code
    qr_data = f"borne:{borne.id}"
    borne.qr_code = generate_qr_code(qr_data)
    
    # await db.bornes.insert_one(borne.dict())
    
    return {
        "message": "Borne créée (placeholder)",
        "borne_id": borne.id,
        "qr_generated": True
    }


@router.post("/{tenant_slug}/bornes/{borne_id}/test-debit")
async def create_test_debit(
    tenant_slug: str,
    borne_id: str,
    test_data: dict
):
    """Enregistrer un test de débit (NFPA 291)"""
    
    # Calculer couleur NFPA
    gpm = test_data["debit_gpm"]
    couleur = calculate_nfpa_color(gpm)
    
    test = TestDebitBorne(
        tenant_id="tenant_id",
        borne_id=borne_id,
        tested_by_id="user_id",
        tested_by_name="Nom Testeur",
        pression_statique_psi=test_data["pression_statique_psi"],
        pression_residuelle_psi=test_data["pression_residuelle_psi"],
        debit_gpm=gpm,
        couleur_nfpa=couleur
    )
    
    # await db.tests_debit.insert_one(test.dict())
    
    # Mettre à jour la borne avec dernier test
    # await db.bornes.update_one(
    #     {"id": borne_id},
    #     {"$set": {
    #         "dernier_test_debit": {
    #             "date": test.test_date.isoformat(),
    #             "gpm": gpm,
    #             "pression_statique": test.pression_statique_psi,
    #             "pression_residuelle": test.pression_residuelle_psi
    #         },
    #         "couleur_nfpa": couleur
    #     }}
    # )
    
    return {
        "message": "Test enregistré (placeholder)",
        "test_id": test.id,
        "couleur_nfpa": couleur
    }


# ===== ROUTES CHECKLISTS TEMPLATES =====

@router.get("/{tenant_slug}/checklist-templates")
async def get_checklist_templates(tenant_slug: str):
    """Liste des templates de checklist SAAQ"""
    # templates = await db.checklist_templates.find(
    #     {"tenant_id": tenant.id, "active": True},
    #     {"_id": 0}
    # ).to_list(100)
    
    return {
        "message": "Templates checklist (placeholder)"
    }


@router.post("/{tenant_slug}/checklist-templates")
async def create_checklist_template(
    tenant_slug: str,
    template: ChecklistTemplate
):
    """Créer un template de checklist personnalisé"""
    # await db.checklist_templates.insert_one(template.dict())
    
    return {
        "message": "Template créé (placeholder)",
        "template_id": template.id
    }
