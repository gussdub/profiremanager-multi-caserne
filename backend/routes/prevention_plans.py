"""
Routes API pour les Plans d'Intervention (Module Prévention)
=============================================================
Fichier extrait de prevention.py pour améliorer la maintenabilité.

Routes:
- POST   /{tenant_slug}/prevention/plans-intervention                              - Créer un plan
- GET    /{tenant_slug}/prevention/plans-intervention                              - Liste des plans
- GET    /{tenant_slug}/prevention/plans-intervention/templates                    - Templates
- GET    /{tenant_slug}/prevention/plans-intervention/{plan_id}                    - Détail plan
- PUT    /{tenant_slug}/prevention/plans-intervention/{plan_id}                    - Modifier plan
- DELETE /{tenant_slug}/prevention/plans-intervention/{plan_id}                    - Supprimer plan
- POST   /{tenant_slug}/prevention/plans-intervention/{plan_id}/valider            - Soumettre validation
- POST   /{tenant_slug}/prevention/plans-intervention/{plan_id}/approuver          - Approuver plan
- POST   /{tenant_slug}/prevention/plans-intervention/{plan_id}/rejeter            - Rejeter plan
- POST   /{tenant_slug}/prevention/plans-intervention/{plan_id}/nouvelle-version   - Nouvelle version
- GET    /{tenant_slug}/prevention/plans-intervention/{plan_id}/export-pdf         - Export PDF
- GET    /{tenant_slug}/prevention/plans-intervention/{plan_id}/versions           - Historique versions
- POST   /{tenant_slug}/prevention/plans-intervention/{plan_id}/calculer-distance  - Calcul distance
- POST   /{tenant_slug}/prevention/plans-intervention/{plan_id}/generer-pdf        - Générer PDF
- POST   /{tenant_slug}/prevention/plans-intervention/from-template/{template_id}  - Créer depuis template
"""

from fastapi import APIRouter, Depends, HTTPException, Body
from typing import Optional
from datetime import datetime, timezone
import uuid
import logging
import base64
from io import BytesIO
from starlette.responses import Response

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    User,
    require_permission,
    user_has_module_action,
    creer_activite
)

from utils.pdf_helpers import (
    create_branded_pdf,
    get_modern_pdf_styles,
)

from routes.prevention_models import (
    PlanIntervention,
    PlanInterventionCreate,
    PlanInterventionUpdate,
    ValidationRequest,
    RejectionRequest,
)

router = APIRouter(tags=["Prévention - Plans d'intervention"])
logger = logging.getLogger(__name__)


# ==================== PLANS D'INTERVENTION ====================

@router.post("/{tenant_slug}/prevention/plans-intervention")
async def create_plan_intervention(
    tenant_slug: str,
    plan: PlanInterventionCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer un nouveau plan d'intervention (préventionnistes uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    # Vérifier permission RBAC ou préventionniste
    can_create = await user_has_module_action(tenant.id, current_user, "prevention", "creer", "plans")
    if not can_create and current_user.type_emploi != "preventionniste":
        raise HTTPException(status_code=403, detail="Seuls les préventionnistes peuvent créer des plans")
    
    # Vérifier que le bâtiment existe
    batiment = await db.batiments.find_one({"id": plan.batiment_id, "tenant_id": tenant.id})
    if not batiment:
        raise HTTPException(status_code=404, detail="Bâtiment non trouvé")
    
    # Générer le numéro de plan unique
    current_year = datetime.now().year
    count = await db.plans_intervention.count_documents({"tenant_id": tenant.id})
    numero_plan = f"PI-{current_year}-{str(count + 1).zfill(3)}"
    
    plan_dict = plan.dict()
    
    logger.info(f"Layers reçus dans plan_dict: {len(plan_dict.get('layers', []))} layers")
    
    plan_dict["tenant_id"] = tenant.id
    plan_dict["numero_plan"] = numero_plan
    plan_dict["created_by_id"] = current_user.id
    plan_dict["statut"] = "brouillon"
    
    plan_obj = PlanIntervention(**plan_dict)
    
    plan_to_insert = plan_obj.dict()
    
    await db.plans_intervention.insert_one(plan_to_insert)
    
    # Créer une activité
    batiment_nom = batiment.get('nom') or batiment.get('nom_batiment') or batiment.get('adresse_civique') or 'Bâtiment'
    await creer_activite(
        tenant_id=tenant.id,
        type_activite="prevention_plan_creation",
        description=f"{current_user.prenom} {current_user.nom} a créé le plan d'intervention #{numero_plan} pour '{batiment_nom}'",
        user_id=current_user.id,
        user_nom=f"{current_user.prenom} {current_user.nom}"
    )
    
    result = clean_mongo_doc(plan_to_insert)
    return result

@router.get("/{tenant_slug}/prevention/plans-intervention")
async def get_plans_intervention(
    tenant_slug: str,
    batiment_id: Optional[str] = None,
    statut: Optional[str] = None,
    created_by_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Récupérer la liste des plans d'intervention avec filtres"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    query = {"tenant_id": tenant.id}
    
    if batiment_id:
        query["batiment_id"] = batiment_id
    if statut:
        query["statut"] = statut
    if created_by_id:
        query["created_by_id"] = created_by_id
    
    plans = await db.plans_intervention.find(query).sort("created_at", -1).to_list(length=None)
    
    return [clean_mongo_doc(plan) for plan in plans]

@router.get("/{tenant_slug}/prevention/plans-intervention/{plan_id}")
async def get_plan_intervention(
    tenant_slug: str,
    plan_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer un plan d'intervention spécifique"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    plan = await db.plans_intervention.find_one({"id": plan_id, "tenant_id": tenant.id})
    
    if not plan:
        raise HTTPException(status_code=404, detail="Plan d'intervention non trouvé")
    
    return clean_mongo_doc(plan)

@router.put("/{tenant_slug}/prevention/plans-intervention/{plan_id}")
async def update_plan_intervention(
    tenant_slug: str,
    plan_id: str,
    plan_update: PlanInterventionUpdate,
    current_user: User = Depends(get_current_user)
):
    """Mettre à jour un plan d'intervention (seulement si brouillon ou en_attente)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    # Récupérer le plan existant
    existing = await db.plans_intervention.find_one({"id": plan_id, "tenant_id": tenant.id})
    if not existing:
        raise HTTPException(status_code=404, detail="Plan non trouvé")
    
    # Vérifier que le plan est modifiable
    if existing["statut"] not in ["brouillon", "en_attente_validation", "rejete"]:
        raise HTTPException(status_code=403, detail="Plan validé non modifiable - créer une nouvelle version")
    
    # Vérifier permission - créateur ou permission modifier
    can_modify = await user_has_module_action(tenant.id, current_user, "prevention", "modifier", "plans")
    if existing["created_by_id"] != current_user.id and not can_modify:
        raise HTTPException(status_code=403, detail="Seul le créateur ou un utilisateur autorisé peut modifier ce plan")
    
    # Mettre à jour les champs fournis
    update_dict = {k: v for k, v in plan_update.dict(exclude_unset=True).items() if v is not None}
    
    if 'layers' in update_dict:
        logger.info(f"UPDATE - Layers reçus: {len(update_dict.get('layers', []))} layers")
    
    update_dict["updated_at"] = datetime.now(timezone.utc)
    update_dict["date_derniere_maj"] = datetime.now(timezone.utc)
    
    result = await db.plans_intervention.update_one(
        {"id": plan_id, "tenant_id": tenant.id},
        {"$set": update_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Plan non trouvé")
    
    updated = await db.plans_intervention.find_one({"id": plan_id})
    
    return clean_mongo_doc(updated)

@router.delete("/{tenant_slug}/prevention/plans-intervention/{plan_id}")
async def delete_plan_intervention(
    tenant_slug: str,
    plan_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer un plan d'intervention"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "supprimer", "plans")
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    result = await db.plans_intervention.delete_one({"id": plan_id, "tenant_id": tenant.id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Plan non trouvé")
    
    return {"message": "Plan d'intervention supprimé avec succès"}

@router.post("/{tenant_slug}/prevention/plans-intervention/{plan_id}/valider")
async def soumettre_plan_validation(
    tenant_slug: str,
    plan_id: str,
    request: ValidationRequest,
    current_user: User = Depends(get_current_user)
):
    """Soumettre un plan pour validation (préventionniste créateur)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    plan = await db.plans_intervention.find_one({"id": plan_id, "tenant_id": tenant.id})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan non trouvé")
    
    # Vérifier permission - créateur ou permission supprimer
    can_submit = await user_has_module_action(tenant.id, current_user, "prevention", "modifier", "plans")
    if plan["created_by_id"] != current_user.id and not can_submit:
        raise HTTPException(status_code=403, detail="Seul le créateur peut soumettre le plan")
    
    # Vérifier que le plan est en brouillon
    if plan["statut"] != "brouillon":
        raise HTTPException(status_code=400, detail="Le plan n'est pas en brouillon")
    
    await db.plans_intervention.update_one(
        {"id": plan_id, "tenant_id": tenant.id},
        {"$set": {
            "statut": "en_attente_validation",
            "commentaires_validation": request.commentaires,
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    return {"message": "Plan soumis pour validation"}

@router.post("/{tenant_slug}/prevention/plans-intervention/{plan_id}/approuver")
async def approuver_plan_intervention(
    tenant_slug: str,
    plan_id: str,
    request: ValidationRequest,
    current_user: User = Depends(get_current_user)
):
    """Approuver un plan d'intervention"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "approuver", "plans")
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    plan = await db.plans_intervention.find_one({"id": plan_id, "tenant_id": tenant.id})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan non trouvé")
    
    if plan["statut"] != "en_attente_validation":
        raise HTTPException(status_code=400, detail="Le plan n'est pas en attente de validation")
    
    await db.plans_intervention.update_one(
        {"id": plan_id, "tenant_id": tenant.id},
        {"$set": {
            "statut": "valide",
            "validated_by_id": current_user.id,
            "date_validation": datetime.now(timezone.utc),
            "commentaires_validation": request.commentaires,
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    return {"message": "Plan d'intervention approuvé"}

@router.post("/{tenant_slug}/prevention/plans-intervention/{plan_id}/rejeter")
async def rejeter_plan_intervention(
    tenant_slug: str,
    plan_id: str,
    request: RejectionRequest,
    current_user: User = Depends(get_current_user)
):
    """Rejeter un plan d'intervention"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "approuver", "plans")
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    plan = await db.plans_intervention.find_one({"id": plan_id, "tenant_id": tenant.id})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan non trouvé")
    
    if plan["statut"] != "en_attente_validation":
        raise HTTPException(status_code=400, detail="Le plan n'est pas en attente de validation")
    
    await db.plans_intervention.update_one(
        {"id": plan_id, "tenant_id": tenant.id},
        {"$set": {
            "statut": "rejete",
            "validated_by_id": current_user.id,
            "commentaires_rejet": request.commentaires_rejet,
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    return {"message": "Plan d'intervention rejeté"}

@router.post("/{tenant_slug}/prevention/plans-intervention/{plan_id}/nouvelle-version")
async def creer_nouvelle_version_plan(
    tenant_slug: str,
    plan_id: str,
    current_user: User = Depends(get_current_user)
):
    """Créer une nouvelle version d'un plan validé"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    # Vérifier permission RBAC ou préventionniste
    can_create = await user_has_module_action(tenant.id, current_user, "prevention", "creer", "plans")
    if not can_create and current_user.type_emploi != "preventionniste":
        raise HTTPException(status_code=403, detail="Seuls les préventionnistes peuvent créer des versions")
    
    # Récupérer le plan existant
    plan_actuel = await db.plans_intervention.find_one({"id": plan_id, "tenant_id": tenant.id})
    if not plan_actuel:
        raise HTTPException(status_code=404, detail="Plan non trouvé")
    
    if plan_actuel["statut"] != "valide":
        raise HTTPException(status_code=400, detail="Seul un plan validé peut avoir une nouvelle version")
    
    # Archiver l'ancien plan
    await db.plans_intervention.update_one(
        {"id": plan_id, "tenant_id": tenant.id},
        {"$set": {"statut": "archive"}}
    )
    
    # Créer la nouvelle version
    nouveau_plan = plan_actuel.copy()
    nouveau_plan["id"] = str(uuid.uuid4())
    nouveau_plan["version_precedente_id"] = plan_id
    nouveau_plan["statut"] = "brouillon"
    nouveau_plan["created_by_id"] = current_user.id
    nouveau_plan["validated_by_id"] = None
    nouveau_plan["date_validation"] = None
    nouveau_plan["commentaires_validation"] = ""
    nouveau_plan["commentaires_rejet"] = ""
    nouveau_plan["created_at"] = datetime.now(timezone.utc)
    nouveau_plan["updated_at"] = datetime.now(timezone.utc)
    
    # Incrémenter la version
    version_parts = nouveau_plan["version"].split(".")
    version_parts[-1] = str(int(version_parts[-1]) + 1)
    nouveau_plan["version"] = ".".join(version_parts)
    
    # Supprimer _id MongoDB du dict avant insertion
    if "_id" in nouveau_plan:
        del nouveau_plan["_id"]
    
    await db.plans_intervention.insert_one(nouveau_plan)
    
    return clean_mongo_doc(nouveau_plan)


@router.get("/{tenant_slug}/prevention/plans-intervention/{plan_id}/export-pdf")
async def export_plan_intervention_pdf(
    tenant_slug: str,
    plan_id: str,
    current_user: User = Depends(get_current_user)
):
    """Exporter un plan d'intervention en PDF"""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.units import inch
    from reportlab.platypus import Table, TableStyle, Paragraph, Spacer, Image as RLImage, PageBreak
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER
    from PIL import Image as PILImage
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    # Récupérer le plan
    plan = await db.plans_intervention.find_one({"id": plan_id, "tenant_id": tenant.id})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan non trouvé")
    
    # Récupérer le bâtiment associé
    batiment = None
    if plan.get("batiment_id"):
        batiment = await db.batiments.find_one({"id": plan["batiment_id"], "tenant_id": tenant.id})
    
    # Créer le buffer PDF avec branding
    buffer, doc, elements = create_branded_pdf(
        tenant, 
        pagesize=A4, 
        rightMargin=40, 
        leftMargin=40, 
        topMargin=60, 
        bottomMargin=40
    )
    
    # Styles
    styles = getSampleStyleSheet()
    modern_styles = get_modern_pdf_styles(styles)
    title_style = modern_styles['title']
    heading_style = modern_styles['heading']
    normal_style = styles['Normal']
    
    # En-tête avec titre du plan
    elements.append(Paragraph(f"Plan d'Intervention", modern_styles['title']))
    plan_title = plan.get('titre') or plan.get('nom_plan') or f"Plan - {batiment.get('nom_etablissement', 'Sans titre') if batiment else 'Sans titre'}"
    elements.append(Paragraph(f"<b>{plan_title}</b>", heading_style))
    elements.append(Spacer(1, 0.2*inch))
    
    # Informations générales
    info_data = [
        ['Numéro de plan:', plan.get('numero_plan', 'N/A')],
        ['Statut:', plan.get('statut', 'brouillon').replace('_', ' ').capitalize()],
        ['Date de création:', plan.get('created_at').strftime('%Y-%m-%d') if plan.get('created_at') and hasattr(plan.get('created_at'), 'strftime') else (str(plan.get('created_at', 'N/A'))[:10] if plan.get('created_at') else 'N/A')],
    ]
    
    if plan.get('date_validation'):
        date_val = plan['date_validation']
        if hasattr(date_val, 'strftime'):
            info_data.append(['Date de validation:', date_val.strftime('%Y-%m-%d')])
        elif isinstance(date_val, str):
            info_data.append(['Date de validation:', date_val[:10]])
        else:
            info_data.append(['Date de validation:', 'N/A'])
    
    if batiment:
        info_data.append(['Bâtiment:', f"{batiment.get('nom_etablissement', 'N/A')}"])
        info_data.append(['Adresse complète:', f"{batiment.get('adresse_civique', '')} {batiment.get('ville', '')} {batiment.get('province', '')} {batiment.get('code_postal', '')}".strip() or 'N/A'])
        
        if batiment.get('type_batiment'):
            info_data.append(['Type de bâtiment:', batiment['type_batiment']])
        if batiment.get('sous_type_batiment'):
            info_data.append(['Sous-type:', batiment['sous_type_batiment']])
        if batiment.get('groupe_occupation'):
            info_data.append(['Groupe d\'occupation:', batiment['groupe_occupation']])
        if batiment.get('sous_groupe'):
            info_data.append(['Sous-groupe:', batiment['sous_groupe']])
        if batiment.get('niveau_risque'):
            info_data.append(['Niveau de risque:', batiment['niveau_risque']])
        if batiment.get('annee_construction'):
            info_data.append(['Année construction:', batiment['annee_construction']])
        if batiment.get('nombre_etages'):
            info_data.append(['Nombre d\'étages:', batiment['nombre_etages']])
        if batiment.get('superficie_totale_m2'):
            info_data.append(['Superficie totale:', f"{batiment['superficie_totale_m2']} m²"])
        if batiment.get('cadastre_matricule'):
            info_data.append(['Cadastre/Matricule:', batiment['cadastre_matricule']])
        if batiment.get('description_activite'):
            info_data.append(['Description activité:', batiment['description_activite']])
    
    info_table = Table(info_data, colWidths=[2*inch, 4*inch])
    info_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#F3F4F6')),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
    ]))
    elements.append(info_table)
    elements.append(Spacer(1, 0.3*inch))
    
    # Section Contacts (si bâtiment disponible)
    if batiment:
        has_contacts = False
        contact_data = []
        
        # Propriétaire
        if batiment.get('proprietaire_nom') or batiment.get('proprietaire_prenom'):
            contact_data.append(['Propriétaire:', f"{batiment.get('proprietaire_prenom', '')} {batiment.get('proprietaire_nom', '')}".strip()])
            if batiment.get('proprietaire_telephone'):
                contact_data.append(['Téléphone:', batiment.get('proprietaire_telephone')])
            if batiment.get('proprietaire_courriel'):
                contact_data.append(['Courriel:', batiment.get('proprietaire_courriel')])
            has_contacts = True
        
        # Gestionnaire
        if batiment.get('gestionnaire_nom') or batiment.get('gestionnaire_prenom') or batiment.get('gerant_nom'):
            nom = batiment.get('gestionnaire_nom') or batiment.get('gerant_nom', '')
            prenom = batiment.get('gestionnaire_prenom', '')
            contact_data.append(['Gestionnaire:', f"{prenom} {nom}".strip()])
            tel = batiment.get('gestionnaire_telephone') or batiment.get('gerant_telephone')
            if tel:
                contact_data.append(['Téléphone:', tel])
            email = batiment.get('gestionnaire_courriel') or batiment.get('gerant_courriel')
            if email:
                contact_data.append(['Courriel:', email])
            has_contacts = True
        
        # Locataire
        if batiment.get('locataire_nom') or batiment.get('locataire_prenom') or batiment.get('localaire_nom'):
            nom = batiment.get('locataire_nom') or batiment.get('localaire_nom', '')
            prenom = batiment.get('locataire_prenom') or batiment.get('localaire_prenom', '')
            contact_data.append(['Locataire:', f"{prenom} {nom}".strip()])
            tel = batiment.get('locataire_telephone') or batiment.get('localaire_telephone')
            if tel:
                contact_data.append(['Téléphone:', tel])
            email = batiment.get('locataire_courriel') or batiment.get('localaire_courriel')
            if email:
                contact_data.append(['Courriel:', email])
            has_contacts = True
        
        # Responsable sécurité
        if batiment.get('responsable_securite_nom'):
            contact_data.append(['Responsable sécurité:', batiment.get('responsable_securite_nom')])
            if batiment.get('responsable_securite_telephone'):
                contact_data.append(['Téléphone:', batiment.get('responsable_securite_telephone')])
            if batiment.get('responsable_securite_courriel'):
                contact_data.append(['Courriel:', batiment.get('responsable_securite_courriel')])
            has_contacts = True
        
        if has_contacts:
            elements.append(Paragraph("<b>Contacts</b>", heading_style))
            contact_table = Table(contact_data, colWidths=[2*inch, 4*inch])
            contact_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#F3F4F6')),
                ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 10),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                ('TOPPADDING', (0, 0), (-1, -1), 8),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ]))
            elements.append(contact_table)
            elements.append(Spacer(1, 0.3*inch))
    
    # Description
    description = plan.get('description') or plan.get('notes_generales')
    if description:
        elements.append(Paragraph("<b>Description</b>", heading_style))
        elements.append(Paragraph(description, normal_style))
        elements.append(Spacer(1, 0.2*inch))
    
    # Notes Tactiques
    notes_tactiques = plan.get('notes_tactiques') or plan.get('instructions_particulieres')
    if notes_tactiques:
        elements.append(Paragraph("<b>Notes Tactiques</b>", heading_style))
        elements.append(Paragraph(notes_tactiques, normal_style))
        elements.append(Spacer(1, 0.2*inch))
    
    # Section Carte et Légendes (affichage visuel des symboles)
    layers = plan.get('layers', [])
    if layers and len(layers) > 0:
        elements.append(PageBreak())
        elements.append(Paragraph("<b>Carte et Légendes</b>", title_style))
        elements.append(Spacer(1, 0.2*inch))
        
        # Informations de la carte
        carte_info = f"""
        <b>Centre de la carte:</b><br/>
        Latitude: {plan.get('centre_lat', 'N/A')}<br/>
        Longitude: {plan.get('centre_lng', 'N/A')}<br/>
        <br/>
        <b>Éléments placés sur la carte:</b> {len(layers)} symbole(s)
        """
        elements.append(Paragraph(carte_info, normal_style))
        elements.append(Spacer(1, 0.2*inch))
        
        # Image de la carte (si disponible)
        carte_image = plan.get('carte_image')
        if carte_image:
            try:
                # Décoder l'image base64
                if carte_image.startswith('data:image'):
                    image_data = carte_image.split(',')[1]
                    image_bytes = base64.b64decode(image_data)
                    
                    # Créer une image PIL pour optimiser
                    img = PILImage.open(BytesIO(image_bytes))
                    if img.mode in ('RGBA', 'LA', 'P'):
                        img = img.convert('RGB')
                    
                    # Redimensionner pour le PDF (largeur max 6.5 inches)
                    max_width = 6.5 * inch
                    aspect_ratio = img.height / img.width
                    img_width = max_width
                    img_height = img_width * aspect_ratio
                    
                    # Limiter la hauteur maximale à 4 inches
                    if img_height > 4 * inch:
                        img_height = 4 * inch
                        img_width = img_height / aspect_ratio
                    
                    # Compresser l'image
                    img_buffer = BytesIO()
                    img.save(img_buffer, format='JPEG', quality=80, optimize=True)
                    img_buffer.seek(0)
                    
                    # Créer l'image ReportLab
                    carte_rl_image = RLImage(img_buffer, width=img_width, height=img_height)
                    
                    # Centrer l'image
                    elements.append(Paragraph("<b>Vue de la Carte</b>", heading_style))
                    elements.append(Spacer(1, 0.1*inch))
                    elements.append(carte_rl_image)
                    elements.append(Spacer(1, 0.3*inch))
            except Exception as e:
                logger.error(f"Erreur lors de l'ajout de l'image de la carte: {e}")
                elements.append(Paragraph("<i>Erreur lors du chargement de l'image de la carte</i>", normal_style))
                elements.append(Spacer(1, 0.2*inch))
        else:
            elements.append(Paragraph("<i>L'image de la carte sera capturée automatiquement à la prochaine sauvegarde du plan.</i>", normal_style))
            elements.append(Spacer(1, 0.3*inch))
        
        # Légendes des symboles avec icônes
        elements.append(Paragraph("<b>Légende des Symboles</b>", heading_style))
        elements.append(Spacer(1, 0.1*inch))
        
        # Grouper les symboles par type pour éviter les répétitions
        symbol_types = {}
        for layer in layers:
            if layer.get('type') == 'symbol':
                props = layer.get('properties', {})
                label = props.get('label', 'Symbole')
                if label not in symbol_types:
                    symbol_types[label] = {
                        'symbol': props.get('symbol', ''),
                        'image': props.get('image'),
                        'color': props.get('color', '#6B7280'),
                        'count': 0
                    }
                symbol_types[label]['count'] += 1
        
        # Créer un tableau de légendes avec icônes
        legend_data = [['Icône', 'Type', 'Quantité']]
        for label, info in symbol_types.items():
            # Si c'est une image, essayer de l'afficher
            if info['image']:
                try:
                    # Décoder l'image base64
                    if info['image'].startswith('data:image'):
                        image_data = info['image'].split(',')[1]
                        image_bytes = base64.b64decode(image_data)
                        
                        # Créer une image PIL
                        img = PILImage.open(BytesIO(image_bytes))
                        if img.mode in ('RGBA', 'LA', 'P'):
                            img = img.convert('RGB')
                        
                        # Redimensionner pour la légende
                        img.thumbnail((24, 24))
                        img_buffer = BytesIO()
                        img.save(img_buffer, format='PNG')
                        img_buffer.seek(0)
                        
                        # Créer une image ReportLab
                        icon_display = RLImage(img_buffer, width=24, height=24)
                        legend_data.append([icon_display, label, f"{info['count']}x"])
                    else:
                        legend_data.append([Paragraph(info['symbol'], normal_style), label, f"{info['count']}x"])
                except Exception:
                    legend_data.append([Paragraph(info['symbol'], normal_style), label, f"{info['count']}x"])
            else:
                # Afficher l'emoji
                legend_data.append([Paragraph(info['symbol'], normal_style), label, f"{info['count']}x"])
        
        legend_table = Table(legend_data, colWidths=[0.8*inch, 3*inch, 1*inch])
        legend_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3B82F6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F3F4F6')])
        ]))
        elements.append(legend_table)
        elements.append(Spacer(1, 0.4*inch))
    
    # Points d'accès
    points_acces = plan.get('points_acces', [])
    if points_acces and len(points_acces) > 0:
        elements.append(Paragraph(f"<b>Points d'Accès ({len(points_acces)})</b>", heading_style))
        for idx, point in enumerate(points_acces, 1):
            elements.append(Paragraph(f"{idx}. {point.get('description', 'N/A')}", normal_style))
        elements.append(Spacer(1, 0.2*inch))
    else:
        elements.append(Paragraph("<b>Points d'Accès</b>", heading_style))
        elements.append(Paragraph("Aucun point d'accès défini", normal_style))
        elements.append(Spacer(1, 0.2*inch))
    
    # Zones dangereuses
    zones_danger = plan.get('zones_dangereuses', []) or plan.get('zones_danger', [])
    if zones_danger and len(zones_danger) > 0:
        elements.append(Paragraph(f"<b>Zones Dangereuses ({len(zones_danger)})</b>", heading_style))
        for idx, zone in enumerate(zones_danger, 1):
            elements.append(Paragraph(f"{idx}. {zone.get('description', 'N/A')}", normal_style))
        elements.append(Spacer(1, 0.2*inch))
    else:
        elements.append(Paragraph("<b>Zones Dangereuses</b>", heading_style))
        elements.append(Paragraph("Aucune zone dangereuse identifiée", normal_style))
        elements.append(Spacer(1, 0.2*inch))
    
    # Équipements
    equipements = plan.get('equipements', [])
    if equipements and len(equipements) > 0:
        elements.append(Paragraph(f"<b>Équipements ({len(equipements)})</b>", heading_style))
        for idx, equip in enumerate(equipements, 1):
            elements.append(Paragraph(f"{idx}. {equip.get('description', 'N/A')}", normal_style))
        elements.append(Spacer(1, 0.2*inch))
    else:
        elements.append(Paragraph("<b>Équipements</b>", heading_style))
        elements.append(Paragraph("Aucun équipement spécifique", normal_style))
        elements.append(Spacer(1, 0.2*inch))
    
    # Risques identifiés
    risques = plan.get('risques_identifies', [])
    if risques and len(risques) > 0:
        elements.append(Paragraph(f"<b>Risques Identifiés ({len(risques)})</b>", heading_style))
        for idx, risque in enumerate(risques, 1):
            elements.append(Paragraph(f"{idx}. {risque.get('description', 'N/A')}", normal_style))
        elements.append(Spacer(1, 0.2*inch))
    
    # Commentaires de validation
    if plan.get('commentaires_validation'):
        elements.append(Paragraph("<b>Commentaires de Validation</b>", heading_style))
        elements.append(Paragraph(plan['commentaires_validation'], normal_style))
        elements.append(Spacer(1, 0.2*inch))
    
    # Galerie Photos (nouvelle section)
    photos = plan.get('photos', [])
    if photos and len(photos) > 0:
        try:
            elements.append(PageBreak())
            elements.append(Paragraph(f"<b>Galerie Photos ({len(photos)})</b>", title_style))
            elements.append(Spacer(1, 0.3*inch))
        except Exception as e:
            logger.error(f"Erreur lors de l'ajout du titre galerie photos: {e}")
        
        for idx, photo in enumerate(photos, 1):
            try:
                # En-tête de la photo
                photo_title = photo.get('titre', f'Photo {idx}')
                elements.append(Paragraph(f"<b>{idx}. {photo_title}</b>", heading_style))
                
                # Informations de la photo
                photo_info = []
                if photo.get('categorie'):
                    categorie_labels = {
                        'facade': 'Façade',
                        'entree': 'Entrée',
                        'systeme_alarme': "Système d'alarme",
                        'points_eau': "Points d'eau",
                        'risques': 'Risques',
                        'autre': 'Autre'
                    }
                    categorie = categorie_labels.get(photo.get('categorie'), photo.get('categorie'))
                    photo_info.append(f"<b>Catégorie:</b> {categorie}")
                
                if photo.get('localisation'):
                    photo_info.append(f"<b>Localisation:</b> {photo.get('localisation')}")
                
                if photo.get('description'):
                    photo_info.append(f"<b>Description:</b> {photo.get('description')}")
                
                if photo_info:
                    info_text = ' | '.join(photo_info)
                    elements.append(Paragraph(info_text, normal_style))
                    elements.append(Spacer(1, 0.1*inch))
                
                # Image (si disponible)
                if photo.get('url'):
                    try:
                        # Gérer les images base64
                        if photo['url'].startswith('data:image'):
                            # Extraire les données base64
                            image_data = photo['url'].split(',')[1]
                            image_bytes = base64.b64decode(image_data)
                            
                            # Ouvrir l'image avec PIL pour la compresser
                            img = PILImage.open(BytesIO(image_bytes))
                            
                            # Convertir en RGB si nécessaire
                            if img.mode in ('RGBA', 'LA', 'P'):
                                img = img.convert('RGB')
                            
                            # Compresser l'image (qualité optimisée 70-80%)
                            img_buffer = BytesIO()
                            img.save(img_buffer, format='JPEG', quality=75, optimize=True)
                            img_buffer.seek(0)
                            
                            # Créer l'image ReportLab avec une largeur maximale de 5 inches
                            rl_image = RLImage(img_buffer, width=5*inch, height=3.5*inch, kind='proportional')
                            elements.append(rl_image)
                    except Exception as img_error:
                        logger.error(f"Erreur chargement image {idx}: {img_error}")
                        elements.append(Paragraph(f"<i>Image non disponible</i>", normal_style))
                
                elements.append(Spacer(1, 0.4*inch))
                
                # Saut de page après 2 photos pour éviter la surcharge
                if idx % 2 == 0 and idx < len(photos):
                    elements.append(PageBreak())
                    
            except Exception as e:
                logger.error(f"Erreur traitement photo {idx}: {e}")
                elements.append(Paragraph(f"<i>Erreur lors du traitement de la photo {idx}</i>", normal_style))
                elements.append(Spacer(1, 0.2*inch))
    
    # Pied de page
    elements.append(Spacer(1, 0.5*inch))
    footer_style = ParagraphStyle(
        'Footer',
        parent=styles['Normal'],
        fontSize=8,
        textColor=colors.grey,
        alignment=TA_CENTER
    )
    elements.append(Paragraph(f"<i>Document généré le {datetime.now(timezone.utc).strftime('%d/%m/%Y à %H:%M')} - {tenant.nom}</i>", footer_style))
    
    # Construire le PDF
    doc.build(elements)
    
    # Retourner le PDF
    buffer.seek(0)
    
    # Générer un nom de fichier avec le nom du bâtiment ou l'adresse
    if batiment:
        adresse = batiment.get('adresse_civique') or batiment.get('adresse') or ''
        nom_etab = batiment.get('nom_etablissement') or batiment.get('nom') or ''
        ville = batiment.get('ville') or ''
        
        if adresse:
            batiment_info = f"{adresse}_{ville}" if ville else adresse
        elif nom_etab:
            batiment_info = f"{nom_etab}_{ville}" if ville else nom_etab
        else:
            batiment_info = 'batiment'
    else:
        batiment_info = 'batiment'
    
    # Nettoyer le nom pour le rendre compatible avec les noms de fichiers
    import unicodedata
    batiment_safe = unicodedata.normalize('NFKD', batiment_info).encode('ASCII', 'ignore').decode('ASCII')
    batiment_safe = batiment_safe.replace(' ', '_').replace('/', '-').replace('\\', '-').replace(',', '').replace("'", '').replace('"', '').lower()
    
    # Numéro du plan
    numero_plan = plan.get('numero_plan')
    if not numero_plan:
        created_at = plan.get('created_at')
        if created_at:
            if isinstance(created_at, str):
                numero_plan = created_at[:10].replace('-', '')
            else:
                numero_plan = created_at.strftime('%Y%m%d')
        else:
            numero_plan = 'plan'
    
    filename = f"plan_intervention_{numero_plan}_{batiment_safe}.pdf"
    
    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@router.get("/{tenant_slug}/prevention/plans-intervention/{plan_id}/versions")
async def get_versions_plan(
    tenant_slug: str,
    plan_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer l'historique des versions d'un plan"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    # Trouver toutes les versions liées
    versions = []
    
    # Chercher la version actuelle
    plan_actuel = await db.plans_intervention.find_one({"id": plan_id, "tenant_id": tenant.id})
    if not plan_actuel:
        raise HTTPException(status_code=404, detail="Plan non trouvé")
    
    versions.append(clean_mongo_doc(plan_actuel))
    
    # Chercher les versions précédentes
    version_precedente_id = plan_actuel.get("version_precedente_id")
    while version_precedente_id:
        plan_prec = await db.plans_intervention.find_one({"id": version_precedente_id, "tenant_id": tenant.id})
        if plan_prec:
            versions.append(clean_mongo_doc(plan_prec))
            version_precedente_id = plan_prec.get("version_precedente_id")
        else:
            break
    
    # Chercher les versions suivantes
    versions_suivantes = await db.plans_intervention.find({
        "version_precedente_id": plan_id,
        "tenant_id": tenant.id
    }).to_list(length=None)
    
    for v in versions_suivantes:
        versions.append(clean_mongo_doc(v))
    
    return sorted(versions, key=lambda x: x["version"], reverse=True)

@router.post("/{tenant_slug}/prevention/plans-intervention/{plan_id}/calculer-distance")
async def calculer_distance_caserne(
    tenant_slug: str,
    plan_id: str,
    caserne_lat: float = Body(...),
    caserne_lng: float = Body(...),
    current_user: User = Depends(get_current_user)
):
    """Calculer la distance entre la caserne et le bâtiment"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    plan = await db.plans_intervention.find_one({"id": plan_id, "tenant_id": tenant.id})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan non trouvé")
    
    # Calculer la distance en utilisant l'API Google Distance Matrix
    try:
        import requests
        import os
        
        api_key = os.getenv("GOOGLE_MAPS_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="Clé API Google Maps non configurée")
        
        url = "https://maps.googleapis.com/maps/api/distancematrix/json"
        params = {
            "origins": f"{caserne_lat},{caserne_lng}",
            "destinations": f"{plan['centre_lat']},{plan['centre_lng']}",
            "key": api_key,
            "mode": "driving"
        }
        
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        
        if data["status"] == "OK" and len(data["rows"]) > 0:
            element = data["rows"][0]["elements"][0]
            if element["status"] == "OK":
                distance_m = element["distance"]["value"]
                duree_s = element["duration"]["value"]
                
                distance_km = distance_m / 1000.0
                temps_minutes = duree_s // 60
                
                # Mettre à jour le plan
                await db.plans_intervention.update_one(
                    {"id": plan_id, "tenant_id": tenant.id},
                    {"$set": {
                        "distance_caserne_km": distance_km,
                        "distance_caserne_unite": "km",
                        "temps_acces_minutes": temps_minutes,
                        "updated_at": datetime.now(timezone.utc)
                    }}
                )
                
                return {
                    "distance_km": distance_km,
                    "distance_m": distance_m,
                    "temps_acces_minutes": temps_minutes,
                    "message": "Distance calculée avec succès"
                }
        
        raise HTTPException(status_code=404, detail="Impossible de calculer la distance")
    
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors du calcul de distance: {str(e)}")

@router.post("/{tenant_slug}/prevention/plans-intervention/{plan_id}/generer-pdf")
async def generer_pdf_plan(
    tenant_slug: str,
    plan_id: str,
    current_user: User = Depends(get_current_user)
):
    """Générer le PDF d'un plan d'intervention"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    plan = await db.plans_intervention.find_one({"id": plan_id, "tenant_id": tenant.id})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan non trouvé")
    
    # TODO: Implémenter la génération PDF complète avec ReportLab/WeasyPrint
    # Pour l'instant, retourner un placeholder
    
    pdf_url = f"/api/{tenant_slug}/prevention/plans-intervention/{plan_id}/pdf"
    
    await db.plans_intervention.update_one(
        {"id": plan_id, "tenant_id": tenant.id},
        {"$set": {
            "pdf_url": pdf_url,
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    return {
        "pdf_url": pdf_url,
        "message": "Génération PDF programmée (fonctionnalité à compléter)"
    }


# ==================== TEMPLATES PLANS D'INTERVENTION ====================

@router.get("/{tenant_slug}/prevention/plans-intervention/templates")
async def get_templates_plans(
    tenant_slug: str,
    type_batiment: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Récupérer les templates de plans d'intervention"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    query = {"tenant_id": tenant.id, "actif": True}
    
    if type_batiment:
        query["type_batiment"] = type_batiment
    
    templates = await db.templates_plans_intervention.find(query).to_list(length=None)
    
    return [clean_mongo_doc(t) for t in templates]

@router.post("/{tenant_slug}/prevention/plans-intervention/from-template/{template_id}")
async def creer_plan_depuis_template(
    tenant_slug: str,
    template_id: str,
    batiment_id: str = Body(...),
    current_user: User = Depends(get_current_user)
):
    """Créer un nouveau plan à partir d'un template"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    # Vérifier permission RBAC ou préventionniste
    can_create = await user_has_module_action(tenant.id, current_user, "prevention", "creer", "plans")
    if not can_create and current_user.type_emploi != "preventionniste":
        raise HTTPException(status_code=403, detail="Seuls les préventionnistes peuvent créer des plans")
    
    # Récupérer le template
    template = await db.templates_plans_intervention.find_one({"id": template_id, "tenant_id": tenant.id})
    if not template:
        raise HTTPException(status_code=404, detail="Template non trouvé")
    
    # Vérifier que le bâtiment existe
    batiment = await db.batiments.find_one({"id": batiment_id, "tenant_id": tenant.id})
    if not batiment:
        raise HTTPException(status_code=404, detail="Bâtiment non trouvé")
    
    # Créer le plan basé sur le template
    current_year = datetime.now().year
    count = await db.plans_intervention.count_documents({"tenant_id": tenant.id})
    numero_plan = f"PI-{current_year}-{str(count + 1).zfill(3)}"
    
    # Utiliser les coordonnées du bâtiment si disponibles
    centre_lat = batiment.get("latitude", 45.5017)  # Default Montreal
    centre_lng = batiment.get("longitude", -73.5673)
    
    nouveau_plan = PlanIntervention(
        tenant_id=tenant.id,
        batiment_id=batiment_id,
        numero_plan=numero_plan,
        nom=f"Plan {batiment.get('nom_etablissement', '')}",
        created_by_id=current_user.id,
        centre_lat=centre_lat,
        centre_lng=centre_lng,
        notes_generales=template.get("instructions_utilisation", "")
    )
    
    await db.plans_intervention.insert_one(nouveau_plan.dict())
    
    return clean_mongo_doc(nouveau_plan.dict())
