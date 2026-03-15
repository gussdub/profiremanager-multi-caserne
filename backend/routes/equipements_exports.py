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
    User,
    require_permission
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
            index[normalize_string_for_matching(full_name)] = user
        if full_name_reverse:
            index[normalize_string_for_matching(full_name_reverse)] = user
        if nom:
            key_nom = normalize_string_for_matching(nom)
            if key_nom not in index:
                index[key_nom] = user
    
    return index


def calculate_name_similarity(str1: str, str2: str) -> float:
    """
    Calcule un score de similarité entre deux chaînes normalisées.
    Retourne un score entre 0 et 1.
    """
    words1 = set(str1.split())
    words2 = set(str2.split())
    
    if not words1 or not words2:
        return 0.0
    
    # Mots en commun
    common_words = words1.intersection(words2)
    
    # Score basé sur le ratio de mots en commun
    score = len(common_words) / max(len(words1), len(words2))
    
    # Bonus si tous les mots sont inclus
    if words1.issubset(words2) or words2.issubset(words1):
        score += 0.3
    
    return min(score, 1.0)


def find_user_intelligent(
    search_string: str, 
    users_by_name: dict, 
    users_by_num: dict = None,
    numero_field: str = "numero_employe"
) -> tuple:
    """
    Recherche intelligente d'un utilisateur avec matching flexible.
    
    Retourne: (user_object, match_type, confidence)
    - match_type: 'exact', 'numero', 'fuzzy', None
    - confidence: 0.0 à 1.0
    """
    if not search_string:
        return None, None, 0.0
    
    # Extraire le nom sans numéro entre parenthèses
    nom_complet = search_string.split("(")[0].strip()
    
    # Tentative 1: Par numéro d'employé
    if users_by_num and "(" in search_string and ")" in search_string:
        try:
            num = search_string.split("(")[1].split(")")[0].strip()
            if num and num in users_by_num:
                return users_by_num[num], 'numero', 1.0
        except:
            pass
    
    # Tentative 2: Matching exact par nom normalisé
    if nom_complet:
        normalized = normalize_string_for_matching(nom_complet)
        if normalized in users_by_name:
            return users_by_name[normalized], 'exact', 1.0
    
    # Tentative 3: Parsing de noms composés (toutes les combinaisons)
    if nom_complet:
        parts = nom_complet.split()
        if len(parts) >= 2:
            for i in range(len(parts)):
                possible_prenom = " ".join(parts[:i+1])
                possible_nom = " ".join(parts[i+1:])
                
                if possible_nom:
                    for test_name in [
                        f"{possible_prenom} {possible_nom}",
                        f"{possible_nom} {possible_prenom}"
                    ]:
                        test_key = normalize_string_for_matching(test_name)
                        if test_key in users_by_name:
                            return users_by_name[test_key], 'exact', 1.0
    
    # Tentative 4: Best fit par similarité
    normalized = normalize_string_for_matching(nom_complet)
    
    best_match = None
    best_score = 0.6  # Seuil minimum 60%
    
    for db_name_normalized, user in users_by_name.items():
        similarity = calculate_name_similarity(normalized, db_name_normalized)
        
        if similarity > best_score:
            best_score = similarity
            best_match = user
    
    if best_match:
        logger.info(f"✨ Best fit équipement pour '{nom_complet}': {best_match.get('prenom')} {best_match.get('nom')} (score: {best_score:.2f})")
        return best_match, 'fuzzy', best_score
    
    return None, None, 0.0


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
    Initialise les catégories d'équipements par défaut pour un service d'incendie.
    Admin uniquement. Ces catégories sont basées sur les normes NFPA et les pratiques
    courantes des services d'incendie.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "actifs", "creer", "categories")
    
    # Catégories par défaut pour services d'incendie
    categories_defaut = [
        {
            "nom": "APRIA",
            "description": "Appareils de protection respiratoire isolant autonome (SCBA)",
            "norme_reference": "NFPA 1852",
            "frequence_inspection": "annuelle",
            "icone": "🫁",
            "couleur": "#ef4444",
            "permet_assignation_employe": False,
            "champs_supplementaires": [
                {"nom": "numero_serie", "type": "text", "obligatoire": True},
                {"nom": "marque", "type": "text", "obligatoire": False},
                {"nom": "modele", "type": "text", "obligatoire": False},
                {"nom": "date_fabrication", "type": "date", "obligatoire": False},
                {"nom": "date_derniere_certification", "type": "date", "obligatoire": False}
            ]
        },
        {
            "nom": "Bouteilles APRIA",
            "description": "Bouteilles d'air comprimé pour APRIA - Test hydrostatique requis",
            "norme_reference": "DOT/TC",
            "frequence_inspection": "5 ans",
            "icone": "🧪",
            "couleur": "#3b82f6",
            "permet_assignation_employe": False,
            "champs_supplementaires": [
                {"nom": "numero_serie", "type": "text", "obligatoire": True},
                {"nom": "capacite_litres", "type": "number", "obligatoire": False},
                {"nom": "pression_bar", "type": "number", "obligatoire": False},
                {"nom": "date_test_hydro", "type": "date", "obligatoire": True},
                {"nom": "date_prochain_test_hydro", "type": "date", "obligatoire": False}
            ]
        },
        {
            "nom": "Détecteurs 4 gaz",
            "description": "Détecteurs multigaz portables (O2, CO, H2S, LEL)",
            "norme_reference": "",
            "frequence_inspection": "semestrielle",
            "icone": "📟",
            "couleur": "#f59e0b",
            "permet_assignation_employe": False,
            "champs_supplementaires": [
                {"nom": "numero_serie", "type": "text", "obligatoire": True},
                {"nom": "marque", "type": "text", "obligatoire": False},
                {"nom": "date_derniere_calibration", "type": "date", "obligatoire": True},
                {"nom": "date_prochaine_calibration", "type": "date", "obligatoire": False}
            ]
        },
        {
            "nom": "Détecteurs CO",
            "description": "Détecteurs de monoxyde de carbone personnels",
            "norme_reference": "",
            "frequence_inspection": "semestrielle",
            "icone": "⚠️",
            "couleur": "#f97316",
            "permet_assignation_employe": True,
            "champs_supplementaires": [
                {"nom": "numero_serie", "type": "text", "obligatoire": True},
                {"nom": "date_derniere_calibration", "type": "date", "obligatoire": False}
            ]
        },
        {
            "nom": "Extincteurs",
            "description": "Extincteurs portatifs (ABC, CO2, eau, mousse)",
            "norme_reference": "NFPA 10",
            "frequence_inspection": "annuelle",
            "icone": "🧯",
            "couleur": "#dc2626",
            "permet_assignation_employe": False,
            "champs_supplementaires": [
                {"nom": "numero_serie", "type": "text", "obligatoire": True},
                {"nom": "type_agent", "type": "select", "options": ["ABC", "CO2", "Eau", "Mousse", "Classe K"], "obligatoire": True},
                {"nom": "capacite", "type": "text", "obligatoire": False},
                {"nom": "date_derniere_verification", "type": "date", "obligatoire": False},
                {"nom": "date_test_hydro", "type": "date", "obligatoire": False}
            ]
        },
        {
            "nom": "Lances",
            "description": "Lances d'incendie et embouts (fog, jet, combinées)",
            "norme_reference": "",
            "frequence_inspection": "annuelle",
            "icone": "💧",
            "couleur": "#0ea5e9",
            "permet_assignation_employe": False,
            "champs_supplementaires": [
                {"nom": "type_lance", "type": "select", "options": ["Fog", "Jet", "Combinée", "Monitor"], "obligatoire": False},
                {"nom": "debit_gpm", "type": "number", "obligatoire": False}
            ]
        },
        {
            "nom": "Parties faciales",
            "description": "Masques APRIA assignés individuellement aux pompiers",
            "norme_reference": "NFPA 1852",
            "frequence_inspection": "annuelle",
            "icone": "😷",
            "couleur": "#8b5cf6",
            "permet_assignation_employe": True,
            "champs_supplementaires": [
                {"nom": "numero_serie", "type": "text", "obligatoire": True},
                {"nom": "taille", "type": "select", "options": ["S", "M", "L", "XL"], "obligatoire": False},
                {"nom": "marque", "type": "text", "obligatoire": False}
            ]
        },
        {
            "nom": "Radios portatives",
            "description": "Radios de communication portatives",
            "norme_reference": "",
            "frequence_inspection": "annuelle",
            "icone": "📻",
            "couleur": "#10b981",
            "permet_assignation_employe": True,
            "champs_supplementaires": [
                {"nom": "numero_serie", "type": "text", "obligatoire": True},
                {"nom": "marque", "type": "text", "obligatoire": False},
                {"nom": "modele", "type": "text", "obligatoire": False},
                {"nom": "frequence", "type": "text", "obligatoire": False}
            ]
        },
        {
            "nom": "Tuyaux",
            "description": "Tuyaux d'incendie (attaque, alimentation, aspiration)",
            "norme_reference": "NFPA 1962",
            "frequence_inspection": "annuelle",
            "icone": "🔴",
            "couleur": "#ef4444",
            "permet_assignation_employe": False,
            "champs_supplementaires": [
                {"nom": "type_tuyau", "type": "select", "options": ["Attaque 1.5\"", "Attaque 1.75\"", "Alimentation 2.5\"", "Alimentation 4\"", "Aspiration"], "obligatoire": False},
                {"nom": "longueur_pieds", "type": "number", "obligatoire": False},
                {"nom": "date_dernier_test", "type": "date", "obligatoire": False}
            ]
        },
        {
            "nom": "Échelles portatives",
            "description": "Échelles à main (coulissantes, à crochets, de toit)",
            "norme_reference": "NFPA 1932",
            "frequence_inspection": "annuelle",
            "icone": "🪜",
            "couleur": "#ca8a04",
            "permet_assignation_employe": False,
            "champs_supplementaires": [
                {"nom": "type_echelle", "type": "select", "options": ["Coulissante", "À crochets", "De toit", "Combinée", "Pliante"], "obligatoire": False},
                {"nom": "longueur_pieds", "type": "number", "obligatoire": False},
                {"nom": "materiau", "type": "select", "options": ["Aluminium", "Fibre de verre", "Bois"], "obligatoire": False}
            ]
        },
        {
            "nom": "Équipement médical",
            "description": "DEA, oxygène portable, trousses médicales",
            "norme_reference": "",
            "frequence_inspection": "semestrielle",
            "icone": "🏥",
            "couleur": "#ec4899",
            "permet_assignation_employe": False,
            "champs_supplementaires": [
                {"nom": "numero_serie", "type": "text", "obligatoire": False},
                {"nom": "type_equipement", "type": "select", "options": ["DEA", "Oxygène", "Trousse premiers soins", "Matériel de réanimation", "Autre"], "obligatoire": False},
                {"nom": "date_expiration_pads", "type": "date", "obligatoire": False},
                {"nom": "date_expiration_batterie", "type": "date", "obligatoire": False}
            ]
        },
        {
            "nom": "Outils hydrauliques",
            "description": "Équipement de désincarcération (écarteurs, cisailles, vérins)",
            "norme_reference": "",
            "frequence_inspection": "annuelle",
            "icone": "🔧",
            "couleur": "#6b7280",
            "permet_assignation_employe": False,
            "champs_supplementaires": [
                {"nom": "numero_serie", "type": "text", "obligatoire": True},
                {"nom": "type_outil", "type": "select", "options": ["Écarteur", "Cisaille", "Vérin", "Combiné", "Pompe"], "obligatoire": False},
                {"nom": "marque", "type": "text", "obligatoire": False}
            ]
        },
        {
            "nom": "Équipement de sauvetage",
            "description": "Cordes, harnais, mousquetons, planches dorsales",
            "norme_reference": "NFPA 1983",
            "frequence_inspection": "annuelle",
            "icone": "🪢",
            "couleur": "#14b8a6",
            "permet_assignation_employe": False,
            "champs_supplementaires": [
                {"nom": "type_equipement", "type": "select", "options": ["Corde", "Harnais", "Mousqueton", "Planche dorsale", "Civière", "Autre"], "obligatoire": False},
                {"nom": "longueur_metres", "type": "number", "obligatoire": False},
                {"nom": "charge_max_kg", "type": "number", "obligatoire": False}
            ]
        },
        {
            "nom": "Ventilateurs",
            "description": "Ventilateurs de désenfumage (PPV, extracteurs)",
            "norme_reference": "",
            "frequence_inspection": "annuelle",
            "icone": "💨",
            "couleur": "#64748b",
            "permet_assignation_employe": False,
            "champs_supplementaires": [
                {"nom": "numero_serie", "type": "text", "obligatoire": False},
                {"nom": "type_ventilateur", "type": "select", "options": ["PPV électrique", "PPV essence", "Extracteur", "Turbo"], "obligatoire": False},
                {"nom": "debit_cfm", "type": "number", "obligatoire": False}
            ]
        },
        {
            "nom": "Outils manuels",
            "description": "Haches, halligans, pieds-de-biche, masse",
            "norme_reference": "",
            "frequence_inspection": "annuelle",
            "icone": "🪓",
            "couleur": "#78716c",
            "permet_assignation_employe": False,
            "champs_supplementaires": [
                {"nom": "type_outil", "type": "select", "options": ["Hache", "Halligan", "Pied-de-biche", "Masse", "Pike pole", "Autre"], "obligatoire": False}
            ]
        }
    ]
    
    created_count = 0
    skipped_count = 0
    
    for cat_data in categories_defaut:
        # Vérifier si la catégorie existe déjà (par nom)
        existing = await db.categories_equipements.find_one({
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
            "description": cat_data.get("description", ""),
            "norme_reference": cat_data.get("norme_reference", ""),
            "frequence_inspection": cat_data.get("frequence_inspection", ""),
            "couleur": cat_data.get("couleur", "#6366F1"),
            "icone": cat_data.get("icone", "📦"),
            "permet_assignation_employe": cat_data.get("permet_assignation_employe", False),
            "champs_supplementaires": cat_data.get("champs_supplementaires", []),
            "personnes_ressources": [],
            "est_predefinit": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.categories_equipements.insert_one(categorie_obj)
        created_count += 1
    
    return {
        "message": f"{created_count} catégories créées, {skipped_count} déjà existantes",
        "created": created_count,
        "skipped": skipped_count,
        "categories": [c["nom"] for c in categories_defaut]
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
    await require_permission(tenant.id, current_user, "actifs", "creer", "materiel")
    
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
    categories = await db.categories_equipements.find({"tenant_id": tenant.id}, {"_id": 0}).to_list(1000)
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
            
            # 5. Mapper l'employé si fourni (avec matching intelligent)
            employe_id = None
            employe_nom_input = eq_data.get("employe", "").strip()
            if employe_nom_input:
                matched_user, match_type, confidence = find_user_intelligent(
                    employe_nom_input, 
                    users_by_name
                )
                if matched_user:
                    employe_id = matched_user.get("id")
                    if match_type == 'fuzzy':
                        logger.info(f"Ligne {index + 2}: '{employe_nom_input}' matché avec '{matched_user.get('prenom')} {matched_user.get('nom')}' (fuzzy: {confidence:.0%})")
            
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
