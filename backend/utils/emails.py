"""
Service d'envoi d'emails pour les notifications de défauts de bornes
Utilise Resend API pour l'envoi des emails
"""
import os
import logging
import resend
from typing import List, Dict
from datetime import datetime

logger = logging.getLogger(__name__)

# Configuration de Resend API avec la clé d'environnement
RESEND_API_KEY = os.environ.get('RESEND_API_KEY')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'noreply@profiremanager.ca')
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'https://www.profiremanager.ca')

# Logo officiel ProFireManager
LOGO_URL = "https://customer-assets.emergentagent.com/job_fireshift-manager/artifacts/6vh2i9cz_05_Icone_Flamme_Rouge_Bordure_D9072B_VISIBLE.png"


def get_email_template(content: str, title: str = None) -> str:
    """
    Génère un template d'email uniforme avec le design ProFireManager.
    """
    title_html = f'<h2 style="color: #1e293b; margin: 0 0 20px; font-size: 20px; font-weight: 700;">{title}</h2>' if title else ''
    
    return f"""
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6;">
            <tr>
                <td align="center" style="padding: 40px 20px;">
                    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%;">
                        
                        <!-- Header -->
                        <tr>
                            <td style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%); border-radius: 16px 16px 0 0; padding: 32px 40px; text-align: center;">
                                <img src="{LOGO_URL}" alt="ProFireManager" width="52" height="52" style="width: 52px; height: 52px; margin-bottom: 12px; display: block; margin-left: auto; margin-right: auto;">
                                <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.3px;">ProFireManager</h1>
                                <p style="color: #94a3b8; margin: 4px 0 0; font-size: 13px;">Gestion des services d'incendie</p>
                            </td>
                        </tr>
                        
                        <!-- Body -->
                        <tr>
                            <td style="background-color: #ffffff; padding: 0;">
                                <div style="height: 4px; background-color: #dc2626;"></div>
                                <div style="padding: 36px 40px;">
                                    {title_html}
                                    {content}
                                </div>
                            </td>
                        </tr>
                        
                        <!-- Footer -->
                        <tr>
                            <td style="background-color: #f8fafc; border-radius: 0 0 16px 16px; border-top: 1px solid #e2e8f0; padding: 24px 40px; text-align: center;">
                                <p style="color: #9ca3af; font-size: 12px; margin: 0 0 4px; line-height: 1.5;">
                                    &copy; {datetime.now().year} ProFireManager &mdash; Tous droits reserves
                                </p>
                                <p style="color: #d1d5db; font-size: 11px; margin: 0;">
                                    Cet email a ete envoye automatiquement par ProFireManager.
                                </p>
                            </td>
                        </tr>
                        
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """


if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY
else:
    logger.warning("RESEND_API_KEY non configurée - les emails ne seront pas envoyés")


async def send_defaut_borne_email(
    tenant_slug: str,
    borne: Dict,
    inspection: Dict,
    inspecteur: str,
    emails: List[str]
) -> Dict:
    """
    Envoyer un email de notification lorsqu'un défaut est détecté sur une borne
    
    Args:
        tenant_slug: Identifiant du tenant
        borne: Informations sur la borne (point d'eau)
        inspection: Données de l'inspection
        inspecteur: Nom complet de l'inspecteur
        emails: Liste des emails destinataires
    
    Returns:
        Dict avec success (bool) et email_id ou error
    """
    if not RESEND_API_KEY:
        logger.error("Impossible d'envoyer l'email : RESEND_API_KEY non configurée")
        return {"success": False, "error": "API key not configured"}
    
    if not emails or len(emails) == 0:
        logger.warning("Aucun email destinataire configuré pour les notifications")
        return {"success": False, "error": "No recipient emails configured"}
    
    try:
        # Récupérer les informations pertinentes
        borne_id = borne.get('numero_borne', borne.get('id', 'N/A'))
        borne_adresse = borne.get('adresse', 'Adresse non spécifiée')
        borne_ville = borne.get('ville', '')
        
        # Formater la date en heure locale (Canada EST = UTC-5)
        date_inspection_raw = inspection.get('date_inspection', 'N/A')
        if date_inspection_raw != 'N/A':
            try:
                from datetime import datetime, timedelta
                # Parser la date ISO et convertir en heure locale Canada (UTC-5)
                dt = datetime.fromisoformat(date_inspection_raw.replace('Z', '+00:00'))
                # Convertir en heure locale du Canada (EST = UTC-5)
                dt_local = dt - timedelta(hours=5)
                date_inspection = dt_local.strftime('%Y-%m-%d')
            except Exception as e:
                date_inspection = date_inspection_raw[:10] if len(date_inspection_raw) >= 10 else date_inspection_raw
        else:
            date_inspection = 'N/A'
        
        notes = inspection.get('notes', 'Aucune note')
        statut = inspection.get('statut_inspection', 'à refaire')
        
        # Construire l'URL vers la borne dans l'application
        borne_url = f"{FRONTEND_URL}/{tenant_slug}/bornes-seches/{borne.get('id')}"
        
        # Déterminer les éléments non-conformes
        resultats = inspection.get('resultats', {})
        defauts_detectes = []
        
        # Vérifier chaque élément de l'inspection
        checklist_labels = {
            'site_accessible': 'Site accessible',
            'site_deneige': 'Site déneigé',
            'joint_present': 'Joint présent',
            'joint_bon_etat': 'Joint en bon état',
            'vanne_storz': 'Vanne Storz',
            'vanne_6_pouces': 'Vanne 6 pouces',
            'vanne_4_pouces': 'Vanne 4 pouces',
            'niveau_eau': 'Niveau d\'eau',
            'pompage_continu': 'Pompage continu',
            'cavitation': 'Cavitation'
        }
        
        for key, label in checklist_labels.items():
            valeur = resultats.get(key, 'conforme')
            if valeur in ['non_conforme', 'defectuosite', 'à refaire']:
                defauts_detectes.append(f"❌ {label}")
        
        # Vérifier aussi les accessibilités
        accessibilites = resultats.get('accessibilite_borne', [])
        if accessibilites and len(accessibilites) > 0:
            acc_text = ', '.join(accessibilites)
            defauts_detectes.append(f"⚠️ Accessibilité: {acc_text}")
        
        defauts_html = '<br>'.join(defauts_detectes) if defauts_detectes else 'Défauts non spécifiés'
        
        # Créer le contenu de l'email
        content = f"""
            <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
                <p style="margin: 0; color: #991b1b; font-weight: bold;">
                    Un défaut a été détecté lors de l'inspection d'une borne sèche. Action immédiate requise.
                </p>
            </div>
            
            <!-- Détails de la borne -->
            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 6px; margin-bottom: 20px;">
                <h3 style="margin: 0 0 15px 0; font-size: 18px; color: #1f2937;">Informations sur la Borne</h3>
                
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-weight: bold; width: 40%;">Numéro de borne:</td>
                        <td style="padding: 8px 0; color: #1f2937;">{borne_id}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-weight: bold;">Adresse:</td>
                        <td style="padding: 8px 0; color: #1f2937;">{borne_adresse}</td>
                    </tr>
                    {f'<tr><td style="padding: 8px 0; color: #6b7280; font-weight: bold;">Ville:</td><td style="padding: 8px 0; color: #1f2937;">{borne_ville}</td></tr>' if borne_ville else ''}
                    <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-weight: bold;">Date d'inspection:</td>
                        <td style="padding: 8px 0; color: #1f2937;">{date_inspection}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-weight: bold;">Inspecteur:</td>
                        <td style="padding: 8px 0; color: #1f2937;">{inspecteur}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-weight: bold;">Statut:</td>
                        <td style="padding: 8px 0; color: #dc2626; font-weight: bold; text-transform: uppercase;">{statut}</td>
                    </tr>
                </table>
            </div>
            
            <!-- Défauts détectés -->
            <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
                <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #92400e;">Défauts Détectés:</h3>
                <div style="color: #78350f; line-height: 1.8;">
                    {defauts_html}
                </div>
            </div>
            
            <!-- Notes -->
            {f'''<div style="background-color: #f9fafb; padding: 15px; border-radius: 4px; margin-bottom: 20px;">
                <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #374151;">Notes de l'inspecteur:</h3>
                <p style="margin: 0; color: #4b5563; font-style: italic;">{notes}</p>
            </div>''' if notes and notes != 'Aucune note' else ''}
            
            <!-- Bouton d'action -->
            <div style="text-align: center; margin: 30px 0;">
                <a href="{borne_url}" 
                   style="display: inline-block; background-color: #dc2626; color: #ffffff; padding: 14px 30px; 
                          text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                    Voir les Détails de la Borne
                </a>
            </div>
        """
        
        html_body = get_email_template(content, "Alerte Défaut Détecté - Inspection de Borne Sèche")
        
        # Préparer les paramètres de l'email
        email_params = {
            "from": SENDER_EMAIL,
            "to": emails,
            "subject": f"[Défaut] Borne #{borne_id} - {borne_adresse}",
            "html": html_body
        }
        
        # Envoyer l'email via Resend
        logger.info(f"Envoi d'email de notification de défaut pour la borne {borne_id} à {len(emails)} destinataire(s)")
        response = resend.Emails.send(email_params)
        
        logger.info(f"Email envoyé avec succès. ID: {response.get('id')}")
        
        # Log email pour chaque destinataire
        try:
            from routes.emails_history import log_email_sent
            for email in emails:
                await log_email_sent(
                    type_email="defaut_borne",
                    destinataire_email=email,
                    sujet=f"[Défaut] Borne #{borne_id} - {borne_adresse}",
                    tenant_slug=tenant_slug,
                    metadata={"borne_id": borne_id, "type_defaut": type_defaut}
                )
        except Exception as log_err:
            logger.warning(f"Erreur log email: {log_err}")
        
        return {
            "success": True,
            "email_id": response.get("id"),
            "recipients": emails
        }
        
    except Exception as e:
        logger.error(f"Erreur lors de l'envoi de l'email de notification: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }



async def send_inventaire_vehicule_defaut_email(
    tenant_slug: str,
    vehicule: Dict,
    inventaire: Dict,
    items_problemes: List[Dict],
    emails: List[str]
) -> Dict:
    """
    Envoyer un email de notification lorsque des items sont manquants/défectueux lors d'un inventaire véhicule
    
    Args:
        tenant_slug: Identifiant du tenant
        vehicule: Informations sur le véhicule
        inventaire: Données de l'inventaire
        items_problemes: Liste des items manquants/défectueux
        emails: Liste des emails destinataires
    
    Returns:
        Dict avec success (bool) et email_id ou error
    """
    if not RESEND_API_KEY:
        logger.error("Impossible d'envoyer l'email : RESEND_API_KEY non configurée")
        return {"success": False, "error": "API key not configured"}
    
    if not emails or len(emails) == 0:
        logger.warning("Aucun email destinataire configuré pour les notifications inventaires véhicules")
        return {"success": False, "error": "No recipient emails configured"}
    
    try:
        # Récupérer les informations pertinentes
        vehicule_nom = vehicule.get('nom', 'N/A')
        vehicule_immatriculation = vehicule.get('immatriculation', 'N/A')
        date_inventaire = inventaire.get('date_inventaire', 'N/A')
        effectue_par = inventaire.get('effectue_par', 'N/A')
        notes = inventaire.get('notes_generales', '')
        items_manquants = inventaire.get('items_manquants', 0)
        items_defectueux = inventaire.get('items_defectueux', 0)
        
        # Construire l'URL vers le véhicule
        vehicule_url = f"{FRONTEND_URL}/{tenant_slug}/vehicules/{vehicule.get('id')}"
        
        # Créer la liste HTML des items à problèmes
        problemes_html = ""
        for item in items_problemes:
            statut_label = "❌ MANQUANT" if item['statut'] == 'absent' else "⚠️ DÉFECTUEUX"
            statut_color = "#dc2626" if item['statut'] == 'absent' else "#f59e0b"
            
            problemes_html += f'''
            <div style="padding: 10px; margin: 5px 0; background-color: #fef2f2; border-left: 3px solid {statut_color}; border-radius: 4px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 600; color: #1f2937;">{item['nom']}</span>
                    <span style="color: {statut_color}; font-weight: bold; font-size: 12px;">{statut_label}</span>
                </div>
                {f'<div style="color: #6b7280; font-size: 14px; margin-top: 5px;">{item.get("notes", "")}</div>' if item.get('notes') else ''}
            </div>
            '''
        
        # Créer le contenu de l'email
        content = f"""
            <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
                <p style="margin: 0; color: #991b1b; font-weight: bold;">
                    Des items manquants ou défectueux ont été signalés lors de l'inventaire hebdomadaire. Action immédiate requise.
                </p>
            </div>
            
            <!-- Détails du véhicule -->
            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 6px; margin-bottom: 20px;">
                <h3 style="margin: 0 0 15px 0; font-size: 18px; color: #1f2937;">Informations sur le Véhicule</h3>
                
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-weight: bold; width: 40%;">Véhicule:</td>
                        <td style="padding: 8px 0; color: #1f2937;">{vehicule_nom}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-weight: bold;">Immatriculation:</td>
                        <td style="padding: 8px 0; color: #1f2937;">{vehicule_immatriculation}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-weight: bold;">Date d'inventaire:</td>
                        <td style="padding: 8px 0; color: #1f2937;">{date_inventaire}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-weight: bold;">Effectué par:</td>
                        <td style="padding: 8px 0; color: #1f2937;">{effectue_par}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-weight: bold;">Items manquants:</td>
                        <td style="padding: 8px 0; color: #dc2626; font-weight: bold;">{items_manquants}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-weight: bold;">Items défectueux:</td>
                        <td style="padding: 8px 0; color: #f59e0b; font-weight: bold;">{items_defectueux}</td>
                    </tr>
                </table>
            </div>
            
            <!-- Items à problèmes -->
            <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
                <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #92400e;">Items Nécessitant Attention:</h3>
                <div style="margin-top: 10px;">
                    {problemes_html}
                </div>
            </div>
            
            <!-- Notes -->
            {f'''<div style="background-color: #f9fafb; padding: 15px; border-radius: 4px; margin-bottom: 20px;">
                <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #374151;">Notes:</h3>
                <p style="margin: 0; color: #4b5563; font-style: italic;">{notes}</p>
            </div>''' if notes else ''}
            
            <!-- Bouton d'action -->
            <div style="text-align: center; margin: 30px 0;">
                <a href="{vehicule_url}" 
                   style="display: inline-block; background-color: #dc2626; color: #ffffff; padding: 14px 30px; 
                          text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                    Voir le Véhicule et l'Inventaire
                </a>
            </div>
        """
        
        html_body = get_email_template(content, "Alerte Inventaire Véhicule - Items Manquants/Défectueux")
        
        # Préparer les paramètres de l'email
        email_params = {
            "from": SENDER_EMAIL,
            "to": emails,
            "subject": f"[Inventaire Véhicule] Items Manquants/Défectueux - {vehicule_nom}",
            "html": html_body
        }
        
        # Envoyer l'email via Resend
        logger.info(f"Envoi d'email de notification inventaire véhicule pour {vehicule_nom} à {len(emails)} destinataire(s)")
        response = resend.Emails.send(email_params)
        
        logger.info(f"Email inventaire véhicule envoyé avec succès. ID: {response.get('id')}")
        
        # Log email pour chaque destinataire
        try:
            from routes.emails_history import log_email_sent
            for email in emails:
                await log_email_sent(
                    type_email="inventaire_vehicule_defaut",
                    destinataire_email=email,
                    sujet=f"[Inventaire Véhicule] Items Manquants/Défectueux - {vehicule_nom}",
                    tenant_slug=tenant_slug,
                    metadata={"vehicule_nom": vehicule_nom, "nb_problemes": len(items_problemes)}
                )
        except Exception as log_err:
            logger.warning(f"Erreur log email: {log_err}")
        
        return {
            "success": True,
            "email_id": response.get("id"),
            "recipients": emails
        }
        
    except Exception as e:
        logger.error(f"Erreur lors de l'envoi de l'email de notification inventaire véhicule: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }



async def send_inventaire_vehicule_alertes_email(
    tenant_slug: str,
    vehicule: Dict,
    inventaire: Dict,
    alertes: List[Dict],
    emails: List[str]
) -> Dict:
    """
    Envoyer un email groupé avec toutes les alertes d'inventaire véhicule (avec photos)
    
    Args:
        tenant_slug: Identifiant du tenant
        vehicule: Informations sur le véhicule
        inventaire: Données de l'inventaire
        alertes: Liste des alertes [{section, item, valeur, notes, photo}]
        emails: Liste des emails destinataires
    
    Returns:
        Dict avec success (bool) et email_id ou error
    """
    if not RESEND_API_KEY:
        logger.error("Impossible d'envoyer l'email : RESEND_API_KEY non configurée")
        return {"success": False, "error": "API key not configured"}
    
    if not emails or len(emails) == 0:
        logger.warning("Aucun email destinataire configuré pour les notifications inventaires véhicules")
        return {"success": False, "error": "No recipient emails configured"}
    
    if not alertes or len(alertes) == 0:
        logger.info("Aucune alerte à envoyer pour cet inventaire")
        return {"success": True, "skipped": "No alerts"}
    
    try:
        # Récupérer les informations pertinentes
        vehicule_nom = vehicule.get('nom', 'N/A')
        vehicule_immatriculation = vehicule.get('immatriculation', 'N/A')
        vehicule_type = vehicule.get('type', 'N/A')
        
        # Formater la date en heure locale (Canada EST/EDT = UTC-5)
        date_inventaire_raw = inventaire.get('date_inventaire', 'N/A')
        if date_inventaire_raw != 'N/A':
            try:
                from datetime import datetime, timedelta
                # Parser la date ISO et convertir en heure locale Canada (UTC-5)
                dt = datetime.fromisoformat(date_inventaire_raw.replace('Z', '+00:00'))
                # Convertir en heure locale du Canada (EST = UTC-5)
                dt_local = dt - timedelta(hours=5)
                date_inventaire = dt_local.strftime('%Y-%m-%d')
            except Exception as e:
                date_inventaire = date_inventaire_raw[:10] if len(date_inventaire_raw) >= 10 else date_inventaire_raw
        else:
            date_inventaire = 'N/A'
        
        effectue_par = inventaire.get('effectue_par', 'N/A')
        notes_generales = inventaire.get('notes_generales', '')
        
        # Construire l'URL vers la page de gestion des actifs avec paramètre de page
        vehicule_url = f"{FRONTEND_URL}/{tenant_slug}?page=actifs&vehicule_id={vehicule.get('id')}"
        
        # Créer la liste HTML des alertes groupées par section
        alertes_par_section = {}
        for alerte in alertes:
            section = alerte.get('section', 'Autre')
            if section not in alertes_par_section:
                alertes_par_section[section] = []
            alertes_par_section[section].append(alerte)
        
        alertes_html = ""
        for section, items in alertes_par_section.items():
            alertes_html += f'''
            <div style="margin-bottom: 25px;">
                <h3 style="color: #8e44ad; font-size: 18px; margin-bottom: 15px; border-bottom: 2px solid #8e44ad; padding-bottom: 8px;">
                    📋 {section}
                </h3>
            '''
            
            for alerte in items:
                item_nom = alerte.get('item', 'N/A')
                valeur = alerte.get('valeur', 'N/A')
                notes = alerte.get('notes', '')
                photo_url = alerte.get('photo', '')
                
                # Couleur selon la valeur
                if 'absent' in valeur.lower() or 'manquant' in valeur.lower():
                    statut_color = "#dc2626"
                    statut_icon = "❌"
                elif 'défectueux' in valeur.lower() or 'defectueux' in valeur.lower():
                    statut_color = "#f59e0b"
                    statut_icon = "⚠️"
                else:
                    statut_color = "#ef4444"
                    statut_icon = "⚠️"
                
                alertes_html += f'''
                <div style="padding: 15px; margin: 10px 0; background-color: #fef2f2; border-left: 4px solid {statut_color}; border-radius: 6px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-weight: 600; color: #1f2937; font-size: 15px;">{item_nom}</span>
                        <span style="color: {statut_color}; font-weight: bold; font-size: 13px;">{statut_icon} {valeur.upper()}</span>
                    </div>
                '''
                
                # Ajouter les notes si présentes
                if notes:
                    alertes_html += f'''
                    <div style="color: #6b7280; font-size: 14px; margin-top: 8px; padding: 8px; background-color: #ffffff; border-radius: 4px;">
                        <strong>Notes :</strong> {notes}
                    </div>
                    '''
                
                # Ajouter la photo si présente
                if photo_url:
                    alertes_html += f'''
                    <div style="margin-top: 10px;">
                        <img src="{photo_url}" alt="Photo de {item_nom}" style="max-width: 100%; height: auto; border-radius: 6px; border: 2px solid {statut_color};" />
                    </div>
                    '''
                
                alertes_html += '</div>'
            
            alertes_html += '</div>'
        
        # Créer le contenu de l'email
        content = f"""
            <div style="background-color: #fef2f2; border-left: 5px solid #dc2626; padding: 18px; margin-bottom: 25px; border-radius: 6px;">
                <p style="margin: 0; color: #991b1b; font-weight: 600; font-size: 15px;">
                    ⚠️ {len(alertes)} item(s) nécessitent votre attention. Veuillez prendre les mesures nécessaires.
                </p>
            </div>
            
            <!-- Informations du véhicule -->
            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
                <h3 style="margin: 0 0 15px 0; color: #1f2937; font-size: 18px; font-weight: 600;">Informations du Véhicule</h3>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr style="border-bottom: 1px solid #e5e7eb;">
                        <td style="padding: 10px 0; color: #6b7280; font-size: 14px; width: 40%;"><strong>Véhicule :</strong></td>
                        <td style="padding: 10px 0; color: #1f2937; font-size: 14px; font-weight: 600;">{vehicule_nom}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #e5e7eb;">
                        <td style="padding: 10px 0; color: #6b7280; font-size: 14px;"><strong>Type :</strong></td>
                        <td style="padding: 10px 0; color: #1f2937; font-size: 14px;">{vehicule_type}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #e5e7eb;">
                        <td style="padding: 10px 0; color: #6b7280; font-size: 14px;"><strong>Immatriculation :</strong></td>
                        <td style="padding: 10px 0; color: #1f2937; font-size: 14px;">{vehicule_immatriculation}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #e5e7eb;">
                        <td style="padding: 10px 0; color: #6b7280; font-size: 14px;"><strong>Date :</strong></td>
                        <td style="padding: 10px 0; color: #1f2937; font-size: 14px;">{date_inventaire}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px 0; color: #6b7280; font-size: 14px;"><strong>Effectué par :</strong></td>
                        <td style="padding: 10px 0; color: #1f2937; font-size: 14px;">{effectue_par}</td>
                    </tr>
                </table>
            </div>
            
            <!-- Alertes groupées par section -->
            <div style="margin-bottom: 25px;">
                <h3 style="margin: 0 0 20px 0; color: #1f2937; font-size: 20px; font-weight: 600;">Détails des Alertes</h3>
                {alertes_html}
            </div>
            
            <!-- Notes générales -->
            {f'''
            <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 15px; margin-bottom: 25px; border-radius: 6px;">
                <h3 style="margin: 0 0 10px 0; color: #92400e; font-size: 15px; font-weight: 600;">📝 Notes Générales</h3>
                <p style="margin: 0; color: #78350f; font-size: 14px; line-height: 1.6;">{notes_generales}</p>
            </div>
            ''' if notes_generales else ''}
            
            <!-- Bouton d'action -->
            <div style="text-align: center; margin: 30px 0;">
                <a href="{vehicule_url}" 
                   style="display: inline-block; background-color: #dc2626; color: #ffffff; 
                          padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                    Accéder à la Gestion des Actifs
                </a>
            </div>
            
            <!-- Instructions pour voir l'historique -->
            <div style="background-color: #f0f0f0; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center;">
                <p style="margin: 0; color: #555; font-size: 14px;">
                    💡 <strong>Pour consulter l'historique complet des inventaires :</strong><br/>
                    Cliquez sur le bouton ci-dessus, puis sélectionnez le véhicule <strong>{vehicule_nom}</strong> et cliquez sur <strong>"📋 Historique inventaires"</strong>
                </p>
            </div>
        """
        
        html_body = get_email_template(content, "Alerte Inventaire Véhicule")
        
        # Préparer les paramètres de l'email
        email_params = {
            "from": SENDER_EMAIL,
            "to": emails,
            "subject": f"[Inventaire Véhicule] {len(alertes)} Alerte(s) - {vehicule_nom}",
            "html": html_body
        }
        
        # Envoyer l'email via Resend
        logger.info(f"Envoi d'email d'alertes inventaire véhicule pour {vehicule_nom} à {len(emails)} destinataire(s) ({len(alertes)} alertes)")
        response = resend.Emails.send(email_params)
        
        logger.info(f"Email d'alertes inventaire véhicule envoyé avec succès. ID: {response.get('id')}")
        
        # Log email pour chaque destinataire
        try:
            from routes.emails_history import log_email_sent
            for email in emails:
                await log_email_sent(
                    type_email="inventaire_vehicule_alertes",
                    destinataire_email=email,
                    sujet=f"[Inventaire Véhicule] {len(alertes)} Alerte(s) - {vehicule_nom}",
                    tenant_slug=tenant_slug,
                    metadata={"vehicule_nom": vehicule_nom, "nb_alertes": len(alertes)}
                )
        except Exception as log_err:
            logger.warning(f"Erreur log email: {log_err}")
        
        return {
            "success": True,
            "email_id": response.get("id"),
            "recipients": emails,
            "alertes_count": len(alertes)
        }
        
    except Exception as e:
        logger.error(f"Erreur lors de l'envoi de l'email d'alertes inventaire véhicule: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }

