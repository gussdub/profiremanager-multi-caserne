"""
Routes API pour le module Équipements (NFPA) - Exports & Imports
================================================================

STATUT: ACTIF
Ce module gère les exports (CSV, PDF) et imports (CSV) d'équipements.
Les routes CRUD de base sont dans routes/equipements.py

Routes principales:
- GET    /{tenant_slug}/equipements/export-csv            - Export CSV
- GET    /{tenant_slug}/equipements/export-pdf            - Export PDF
- POST   /{tenant_slug}/equipements/import-csv            - Import CSV
- POST   /{tenant_slug}/equipements/categories/initialiser - Initialiser catégories par défaut
"""

from fastapi import APIRouter, Depends, HTTPException, Body
from fastapi.responses import Response, StreamingResponse
from typing import Optional
from datetime import datetime, timezone
import uuid
import logging
import io
import csv
from io import StringIO, BytesIO

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    User
)

router = APIRouter(tags=["Équipements Exports/Imports"])
logger = logging.getLogger(__name__)


# ==================== FONCTIONS HELPER ====================

def normalize_string_for_matching(s: str) -> str:
    """Normalise une chaîne pour la comparaison (minuscules, sans accents, sans espaces superflus)"""
    import unicodedata
    if not s:
        return ""
    # Normaliser les accents
    s = unicodedata.normalize('NFKD', s).encode('ASCII', 'ignore').decode('ASCII')
    # Minuscules et trim
    return s.lower().strip()


def create_user_matching_index(users: list) -> dict:
    """Crée un index pour matcher les utilisateurs par nom/prénom"""
    index = {}
    for user in users:
        nom = user.get("nom", "").lower().strip()
        prenom = user.get("prenom", "").lower().strip()
        full_name = f"{prenom} {nom}".strip()
        full_name_reverse = f"{nom} {prenom}".strip()
        
        if full_name:
            index[full_name] = user
        if full_name_reverse:
            index[full_name_reverse] = user
        if nom:
            index[nom] = user
    
    return index


# ==================== ROUTES EXPORTS ====================

@router.get("/{tenant_slug}/equipements/export-csv")
async def export_equipements_csv(
    tenant_slug: str,
    categorie_id: Optional[str] = None,
    etat: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Export CSV de tous les équipements avec filtres optionnels"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Construire les filtres
    filters = {"tenant_id": tenant.id}
    if categorie_id:
        filters["categorie_id"] = categorie_id
    if etat:
        filters["etat"] = etat
    
    # Récupérer les équipements
    equipements = await db.equipements.find(filters, {"_id": 0}).to_list(10000)
    
    if not equipements:
        raise HTTPException(status_code=404, detail="Aucun équipement trouvé")
    
    output = StringIO()
    
    # En-têtes
    fieldnames = [
        "nom", "code_unique", "categorie_nom", "etat", "emplacement", 
        "quantite", "quantite_minimum", "vehicule_id", "employe_id",
        "date_acquisition", "date_fin_vie", "date_prochaine_maintenance",
        "valeur_achat", "notes", "champs_personnalises", "created_at"
    ]
    
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    
    import json as json_lib
    for eq in equipements:
        row = {
            "nom": eq.get("nom", ""),
            "code_unique": eq.get("code_unique", ""),
            "categorie_nom": eq.get("categorie_nom", ""),
            "etat": eq.get("etat", ""),
            "emplacement": eq.get("emplacement", ""),
            "quantite": eq.get("quantite", 1),
            "quantite_minimum": eq.get("quantite_minimum", 0),
            "vehicule_id": eq.get("vehicule_id", ""),
            "employe_id": eq.get("employe_id", ""),
            "date_acquisition": eq.get("date_acquisition", ""),
            "date_fin_vie": eq.get("date_fin_vie", ""),
            "date_prochaine_maintenance": eq.get("date_prochaine_maintenance", ""),
            "valeur_achat": eq.get("valeur_achat", 0),
            "notes": eq.get("notes", ""),
            "champs_personnalises": json_lib.dumps(eq.get("champs_personnalises", {})),
            "created_at": eq.get("created_at", "")
        }
        writer.writerow(row)
    
    csv_content = output.getvalue()
    
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=equipements_{tenant_slug}_{datetime.now().strftime('%Y%m%d')}.csv"
        }
    )


@router.get("/{tenant_slug}/equipements/export-pdf")
async def export_equipements_pdf(
    tenant_slug: str,
    categorie_id: Optional[str] = None,
    etat: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Export PDF de tous les équipements avec filtres optionnels - Design unifié avec logo"""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER
    
    # Import des helpers PDF depuis server
    import server
    get_modern_pdf_styles = server.get_modern_pdf_styles
    create_pdf_header_elements = server.create_pdf_header_elements
    create_pdf_footer_text = server.create_pdf_footer_text
    BrandedDocTemplate = server.BrandedDocTemplate
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Construire les filtres
    filters = {"tenant_id": tenant.id}
    if categorie_id:
        filters["categorie_id"] = categorie_id
    if etat:
        filters["etat"] = etat
    
    # Récupérer les équipements
    equipements = await db.equipements.find(filters, {"_id": 0}).to_list(10000)
    
    if not equipements:
        raise HTTPException(status_code=404, detail="Aucun équipement trouvé")
    
    # Générer le PDF avec le design unifié (logo, header, styles modernes)
    buffer = BytesIO()
    doc = BrandedDocTemplate(buffer, tenant=tenant, pagesize=A4, topMargin=0.5*inch, bottomMargin=0.5*inch)
    
    story = []
    styles = getSampleStyleSheet()
    modern_styles = get_modern_pdf_styles(styles)
    
    # Header personnalisé (logo + nom service)
    header_elements = create_pdf_header_elements(tenant, styles)
    story.extend(header_elements)
    
    # Titre
    story.append(Paragraph("Inventaire des Équipements", modern_styles['title']))
    
    # Sous-titre avec filtres
    subtitle_text = f"Généré le {datetime.now().strftime('%d/%m/%Y à %H:%M')}"
    if categorie_id or etat:
        filters_text = []
        if categorie_id:
            cat = await db.equipement_categories.find_one({"id": categorie_id}, {"_id": 0})
            if cat:
                filters_text.append(f"Catégorie: {cat.get('nom', 'Inconnue')}")
            else:
                filters_text.append("Catégorie filtrée")
        if etat:
            etat_labels = {
                'neuf': 'Neuf', 'bon': 'Bon', 'a_reparer': 'À réparer',
                'en_reparation': 'En réparation', 'hors_service': 'Hors service'
            }
            filters_text.append(f"État: {etat_labels.get(etat, etat)}")
        subtitle_text += f" | Filtres: {', '.join(filters_text)}"
    
    story.append(Paragraph(subtitle_text, modern_styles['subheading']))
    story.append(Spacer(1, 0.3*inch))
    
    # Statistiques par état
    stats_by_etat = {}
    for eq in equipements:
        e = eq.get("etat", "inconnu")
        stats_by_etat[e] = stats_by_etat.get(e, 0) + 1
    
    etat_labels = {
        'neuf': 'Neuf', 'bon': 'Bon', 'a_reparer': 'À réparer',
        'en_reparation': 'En réparation', 'hors_service': 'Hors service'
    }
    
    stats_data = [["Statistiques", ""]]
    stats_data.append(["Total équipements", str(len(equipements))])
    for etat_key, count in stats_by_etat.items():
        stats_data.append([etat_labels.get(etat_key, etat_key), str(count)])
    
    stats_table = Table(stats_data, colWidths=[2.5*inch, 2*inch])
    stats_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), modern_styles['primary_color']),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
        ('TOPPADDING', (0, 0), (-1, 0), 10),
        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.5, modern_styles['grid']),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, modern_styles['bg_light']])
    ]))
    
    story.append(stats_table)
    story.append(Spacer(1, 0.3*inch))
    
    # Tableau des équipements
    table_data = [['Code', 'Nom', 'Catégorie', 'État', 'Emplacement', 'Qté']]
    
    for eq in equipements:
        etat_val = eq.get("etat", "")
        table_data.append([
            eq.get("code_unique", "")[:15],
            eq.get("nom", "")[:30],
            eq.get("categorie_nom", "")[:20],
            etat_labels.get(etat_val, etat_val.capitalize()),
            eq.get("emplacement", "")[:20],
            str(eq.get("quantite", 1))
        ])
    
    detail_table = Table(table_data, colWidths=[1.2*inch, 2.2*inch, 1.5*inch, 1*inch, 1.5*inch, 0.6*inch])
    detail_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), modern_styles['primary_color']),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('ALIGN', (-1, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
        ('TOPPADDING', (0, 0), (-1, 0), 10),
        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.5, modern_styles['grid']),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, modern_styles['bg_light']])
    ]))
    
    story.append(detail_table)
    story.append(Spacer(1, 0.3*inch))
    
    # Footer avec ProFireManager
    footer_text = create_pdf_footer_text(tenant)
    if footer_text:
        from reportlab.lib.styles import ParagraphStyle
        footer_style = ParagraphStyle(
            'Footer',
            parent=styles['Normal'],
            fontSize=8,
            textColor=colors.grey,
            alignment=TA_CENTER,
            spaceBefore=20
        )
        story.append(Paragraph(footer_text, footer_style))
    
    # Construire le PDF
    doc.build(story)
    
    pdf_content = buffer.getvalue()
    buffer.close()
    
    return Response(
        content=pdf_content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=equipements_{tenant_slug}_{datetime.now().strftime('%Y%m%d')}.pdf"
        }
    )


# ==================== ROUTES IMPORTS ====================

@router.post("/{tenant_slug}/equipements/categories/initialiser")
async def initialiser_categories_equipements(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """
    Initialise les catégories d'équipements par défaut (selon NFPA)
    Admin uniquement
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Permission refusée - Admin requis")
    
    # Catégories par défaut selon NFPA
    categories_defaut = [
        {"nom": "Appareil respiratoire isolant (ARI)", "description": "SCBA et équipements respiratoires"},
        {"nom": "Vêtements de protection", "description": "Bunker gear, casques, gants, bottes"},
        {"nom": "Équipement de sauvetage", "description": "Cordes, harnais, planches dorsales"},
        {"nom": "Équipement de désincarcération", "description": "Outils hydrauliques, écarteurs, cisailles"},
        {"nom": "Équipement de ventilation", "description": "Ventilateurs, extracteurs de fumée"},
        {"nom": "Équipement d'éclairage", "description": "Projecteurs, lampes, tours d'éclairage"},
        {"nom": "Équipement de communication", "description": "Radios, interphones"},
        {"nom": "Équipement médical", "description": "DEA, trousses de premiers soins"},
        {"nom": "Matériel d'extinction", "description": "Extincteurs, lances, boyaux"},
        {"nom": "Équipement HAZMAT", "description": "Combinaisons, détecteurs, contenants"},
        {"nom": "Équipement de protection contre les chutes", "description": "Harnais, longes, ancrages"},
        {"nom": "Outils manuels", "description": "Haches, halligan, pieds-de-biche"},
        {"nom": "Échelles", "description": "Échelles portables et fixes"},
        {"nom": "Équipement aquatique", "description": "Gilets, combinaisons, embarcations"},
        {"nom": "Autre équipement", "description": "Équipement divers non catégorisé"}
    ]
    
    created_count = 0
    skipped_count = 0
    
    for cat_data in categories_defaut:
        # Vérifier si la catégorie existe déjà
        existing = await db.categories_equipement.find_one({
            "tenant_id": tenant.id,
            "nom": cat_data["nom"]
        })
        
        if existing:
            skipped_count += 1
            continue
        
        categorie_obj = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant.id,
            "nom": cat_data["nom"],
            "description": cat_data["description"],
            "est_predefinit": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.categories_equipement.insert_one(categorie_obj)
        created_count += 1
    
    return {
        "message": f"{created_count} catégories créées, {skipped_count} déjà existantes",
        "created": created_count,
        "skipped": skipped_count
    }


@router.post("/{tenant_slug}/equipements/import-csv")
async def import_equipements_csv(
    tenant_slug: str,
    data: dict = Body(...),
    current_user: User = Depends(get_current_user)
):
    """
    Import en masse d'équipements depuis CSV/Excel
    Format attendu: nom, code_unique, categorie_nom, etat, emplacement, date_acquisition, vehicule, employe, champs_personnalises (JSON)
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Permission refusée - Admin requis")
    
    equipements_data = data.get("equipements", [])
    
    if not equipements_data:
        raise HTTPException(status_code=400, detail="Aucun équipement fourni")
    
    results = {
        "created": 0,
        "updated": 0,
        "errors": [],
        "skipped": 0
    }
    
    # Charger toutes les catégories du tenant
    categories = await db.categories_equipement.find({"tenant_id": tenant.id}, {"_id": 0}).to_list(1000)
    categories_by_nom = {normalize_string_for_matching(cat["nom"]): cat for cat in categories}
    
    # Charger tous les véhicules et utilisateurs pour les assignations
    vehicules = await db.vehicules.find({"tenant_id": tenant.id}, {"_id": 0}).to_list(1000)
    vehicules_by_nom = {normalize_string_for_matching(v["nom"]): v for v in vehicules}
    
    users = await db.users.find({"tenant_id": tenant.id}, {"_id": 0}).to_list(1000)
    users_by_name = create_user_matching_index(users)
    
    for index, eq_data in enumerate(equipements_data):
        try:
            # 1. Trouver la catégorie
            categorie_nom = eq_data.get("categorie_nom", eq_data.get("categorie", "")).strip()
            if not categorie_nom:
                results["errors"].append({
                    "ligne": index + 2,
                    "erreur": "Catégorie manquante"
                })
                continue
            
            categorie_normalized = normalize_string_for_matching(categorie_nom)
            categorie = categories_by_nom.get(categorie_normalized)
            
            if not categorie:
                results["errors"].append({
                    "ligne": index + 2,
                    "erreur": f"Catégorie non trouvée: {categorie_nom}"
                })
                continue
            
            # 2. Données de base
            nom = eq_data.get("nom", "").strip()
            code_unique = eq_data.get("code_unique", "").strip()
            
            if not nom:
                results["errors"].append({
                    "ligne": index + 2,
                    "erreur": "Nom manquant"
                })
                continue
            
            # 3. Générer code unique si manquant
            if not code_unique:
                prefix = categorie.get("prefixe_code", "EQ")
                count = await db.equipements.count_documents({"tenant_id": tenant.id})
                code_unique = f"{prefix}-{str(count + 1).zfill(4)}"
            
            # 4. Mapper le véhicule si fourni
            vehicule_id = None
            vehicule_nom_input = eq_data.get("vehicule", "").strip()
            if vehicule_nom_input:
                vehicule_normalized = normalize_string_for_matching(vehicule_nom_input)
                vehicule = vehicules_by_nom.get(vehicule_normalized)
                if vehicule:
                    vehicule_id = vehicule.get("id")
            
            # 5. Mapper l'employé si fourni
            employe_id = None
            employe_nom_input = eq_data.get("employe", "").strip()
            if employe_nom_input:
                employe_normalized = employe_nom_input.lower().strip()
                employe = users_by_name.get(employe_normalized)
                if employe:
                    employe_id = employe.get("id")
            
            # 6. Vérifier si l'équipement existe déjà (par code_unique)
            existing = await db.equipements.find_one({
                "tenant_id": tenant.id,
                "code_unique": code_unique
            })
            
            # 7. Préparer les données
            etat = eq_data.get("etat", "bon").lower().strip()
            if etat not in ["neuf", "bon", "a_reparer", "en_reparation", "hors_service"]:
                etat = "bon"
            
            equipement_doc = {
                "nom": nom,
                "code_unique": code_unique,
                "categorie_id": categorie.get("id"),
                "categorie_nom": categorie.get("nom"),
                "etat": etat,
                "emplacement": eq_data.get("emplacement", "").strip(),
                "quantite": int(eq_data.get("quantite", 1)),
                "quantite_minimum": int(eq_data.get("quantite_minimum", 0)),
                "vehicule_id": vehicule_id,
                "employe_id": employe_id,
                "date_acquisition": eq_data.get("date_acquisition", ""),
                "date_fin_vie": eq_data.get("date_fin_vie", ""),
                "date_prochaine_maintenance": eq_data.get("date_prochaine_maintenance", ""),
                "valeur_achat": float(eq_data.get("valeur_achat", 0) or 0),
                "notes": eq_data.get("notes", ""),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            
            # Champs personnalisés (JSON)
            champs_perso = eq_data.get("champs_personnalises", {})
            if isinstance(champs_perso, str):
                import json as json_lib
                try:
                    champs_perso = json_lib.loads(champs_perso) if champs_perso else {}
                except:
                    champs_perso = {}
            equipement_doc["champs_personnalises"] = champs_perso
            
            if existing:
                # Mise à jour
                await db.equipements.update_one(
                    {"id": existing["id"]},
                    {"$set": equipement_doc}
                )
                results["updated"] += 1
            else:
                # Création
                equipement_doc["id"] = str(uuid.uuid4())
                equipement_doc["tenant_id"] = tenant.id
                equipement_doc["created_at"] = datetime.now(timezone.utc).isoformat()
                equipement_doc["created_by"] = current_user.id
                
                await db.equipements.insert_one(equipement_doc)
                results["created"] += 1
                
        except Exception as e:
            results["errors"].append({
                "ligne": index + 2,
                "erreur": str(e)
            })
    
    return results
