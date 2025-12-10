"""
Service d'envoi d'emails pour les notifications de défauts de bornes
Utilise Resend API pour l'envoi des emails
"""
import os
import logging
import resend
from typing import List, Dict

logger = logging.getLogger(__name__)

# Configuration de Resend API avec la clé d'environnement
RESEND_API_KEY = os.environ.get('RESEND_API_KEY')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'noreply@profiremanager.ca')
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'https://profiremanager.ca')

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
        date_inspection = inspection.get('date_inspection', 'N/A')
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
        
        # Créer le corps HTML de l'email
        html_body = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
            <div style="background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                
                <!-- En-tête -->
                <div style="background-color: #dc2626; color: #ffffff; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; margin: -30px -30px 20px -30px;">
                    <h1 style="margin: 0; font-size: 24px;">🚨 Alerte Défaut Détecté</h1>
                    <p style="margin: 10px 0 0 0; font-size: 14px;">Inspection de Borne Sèche</p>
                </div>
                
                <!-- Informations principales -->
                <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
                    <p style="margin: 0; color: #991b1b; font-weight: bold;">
                        Un défaut a été détecté lors de l'inspection d'une borne sèche. Action immédiate requise.
                    </p>
                </div>
                
                <!-- Détails de la borne -->
                <div style="background-color: #f3f4f6; padding: 20px; border-radius: 6px; margin-bottom: 20px;">
                    <h2 style="margin: 0 0 15px 0; font-size: 18px; color: #1f2937;">Informations sur la Borne</h2>
                    
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
                              text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                        Voir les Détails de la Borne
                    </a>
                </div>
                
                <!-- Pied de page -->
                <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 20px; text-align: center;">
                    <p style="color: #6b7280; font-size: 12px; margin: 5px 0;">
                        Ceci est une notification automatique du système ProFireManager.
                    </p>
                    <p style="color: #9ca3af; font-size: 11px; margin: 5px 0;">
                        Ne pas répondre à cet email. Pour toute assistance, contactez votre administrateur système.
                    </p>
                </div>
            </div>
        </div>
        """
        
        # Préparer les paramètres de l'email
        email_params = {
            "from": SENDER_EMAIL,
            "to": emails,
            "subject": f"🚨 Défaut Borne #{borne_id} - {borne_adresse}",
            "html": html_body
        }
        
        # Envoyer l'email via Resend
        logger.info(f"Envoi d'email de notification de défaut pour la borne {borne_id} à {len(emails)} destinataire(s)")
        response = resend.Emails.send(email_params)
        
        logger.info(f"Email envoyé avec succès. ID: {response.get('id')}")
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
        
        # Créer le corps HTML de l'email
        html_body = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
            <div style="background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                
                <!-- En-tête -->
                <div style="background-color: #dc2626; color: #ffffff; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; margin: -30px -30px 20px -30px;">
                    <h1 style="margin: 0; font-size: 24px;">🚨 Alerte Inventaire Véhicule</h1>
                    <p style="margin: 10px 0 0 0; font-size: 14px;">Items Manquants ou Défectueux Détectés</p>
                </div>
                
                <!-- Informations principales -->
                <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
                    <p style="margin: 0; color: #991b1b; font-weight: bold;">
                        Des items manquants ou défectueux ont été signalés lors de l'inventaire hebdomadaire. Action immédiate requise.
                    </p>
                </div>
                
                <!-- Détails du véhicule -->
                <div style="background-color: #f3f4f6; padding: 20px; border-radius: 6px; margin-bottom: 20px;">
                    <h2 style="margin: 0 0 15px 0; font-size: 18px; color: #1f2937;">Informations sur le Véhicule</h2>
                    
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
                              text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                        Voir le Véhicule et l'Inventaire
                    </a>
                </div>
                
                <!-- Pied de page -->
                <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 20px; text-align: center;">
                    <p style="color: #6b7280; font-size: 12px; margin: 5px 0;">
                        Ceci est une notification automatique du système ProFireManager.
                    </p>
                    <p style="color: #9ca3af; font-size: 11px; margin: 5px 0;">
                        Ne pas répondre à cet email. Pour toute assistance, contactez votre administrateur système.
                    </p>
                </div>
            </div>
        </div>
        """
        
        # Préparer les paramètres de l'email
        email_params = {
            "from": SENDER_EMAIL,
            "to": emails,
            "subject": f"🚨 Inventaire Véhicule - Items Manquants/Défectueux - {vehicule_nom}",
            "html": html_body
        }
        
        # Envoyer l'email via Resend
        logger.info(f"Envoi d'email de notification inventaire véhicule pour {vehicule_nom} à {len(emails)} destinataire(s)")
        response = resend.Emails.send(email_params)
        
        logger.info(f"Email inventaire véhicule envoyé avec succès. ID: {response.get('id')}")
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

