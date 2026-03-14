"""
Fonctions de notification pour le module Remplacements
- Emails (Resend)
- SMS (Twilio)
- Push notifications
"""

from datetime import datetime, timezone, timedelta
from typing import Dict, Any
import uuid
import logging
import os

logger = logging.getLogger(__name__)


async def generer_token_remplacement(db, demande_id: str, remplacant_id: str, tenant_id: str) -> str:
    """Génère un token unique et temporaire pour accepter/refuser un remplacement par email"""
    token = str(uuid.uuid4())
    expiration = datetime.now(timezone.utc) + timedelta(hours=48)
    
    await db.tokens_remplacement.insert_one({
        "token": token,
        "demande_id": demande_id,
        "remplacant_id": remplacant_id,
        "tenant_id": tenant_id,
        "expiration": expiration.isoformat(),
        "utilise": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return token


async def envoyer_email_remplacement(
    db,
    demande_data: dict,
    remplacant: dict,
    demandeur: dict,
    type_garde: dict,
    tenant_id: str,
    token: str
):
    """Envoie un email au remplaçant potentiel avec les boutons Accepter/Refuser"""
    try:
        import resend
        
        resend_api_key = os.environ.get('RESEND_API_KEY')
        if not resend_api_key:
            logger.warning(f"RESEND_API_KEY non configurée - Email non envoyé")
            return False
        
        resend.api_key = resend_api_key
        
        remplacant_user = await db.users.find_one({"id": remplacant["user_id"]})
        if not remplacant_user or not remplacant_user.get("email"):
            logger.warning(f"Email non trouvé pour remplaçant {remplacant['user_id']}")
            return False
        
        # Vérifier les préférences de notification
        preferences = remplacant_user.get("preferences_notifications", {})
        if not preferences.get("email_actif", True):
            logger.info(f"📧 Email désactivé pour {remplacant_user.get('prenom')} - préférences utilisateur")
            return False
        
        remplacant_email = remplacant_user["email"]
        remplacant_prenom = remplacant_user.get("prenom", "")
        
        frontend_url = os.environ.get('FRONTEND_URL', 'https://www.profiremanager.ca')
        backend_url = os.environ.get('REACT_APP_BACKEND_URL', frontend_url)
        
        lien_accepter = f"{backend_url}/api/remplacement-action/{token}/accepter"
        lien_refuser = f"{backend_url}/api/remplacement-action/{token}/refuser"
        
        demandeur_nom = f"{demandeur.get('prenom', '')} {demandeur.get('nom', '')}"
        type_garde_nom = type_garde.get("nom", "Garde")
        date_garde = demande_data.get("date", "")
        heure_debut = type_garde.get("heure_debut", "")
        heure_fin = type_garde.get("heure_fin", "")
        raison = demande_data.get("raison", "")
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
            <div style="background-color: white; border-radius: 12px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #dc2626; margin: 0;">🚨 Demande de Remplacement</h1>
                </div>
                
                <p style="font-size: 16px; color: #333;">Bonjour {remplacant_prenom},</p>
                
                <p style="font-size: 16px; color: #333;">
                    <strong>{demandeur_nom}</strong> recherche un remplaçant et vous avez été identifié comme disponible.
                </p>
                
                <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
                    <h3 style="margin-top: 0; color: #1e3a5f;">📋 Détails de la garde</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; color: #666; width: 40%;">Type de garde:</td>
                            <td style="padding: 8px 0; color: #333; font-weight: bold;">{type_garde_nom}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #666;">Date:</td>
                            <td style="padding: 8px 0; color: #333; font-weight: bold;">{date_garde}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #666;">Horaire:</td>
                            <td style="padding: 8px 0; color: #333; font-weight: bold;">{heure_debut} - {heure_fin}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #666;">Demandeur:</td>
                            <td style="padding: 8px 0; color: #333; font-weight: bold;">{demandeur_nom}</td>
                        </tr>
                        {f'<tr><td style="padding: 8px 0; color: #666;">Raison:</td><td style="padding: 8px 0; color: #333;">{raison}</td></tr>' if raison else ''}
                    </table>
                </div>
                
                <p style="font-size: 16px; color: #333; text-align: center; margin: 30px 0 20px;">
                    <strong>Pouvez-vous effectuer ce remplacement ?</strong>
                </p>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{lien_accepter}" 
                       style="display: inline-block; background-color: #22c55e; color: white; padding: 15px 40px; 
                              text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; 
                              margin: 0 10px; box-shadow: 0 2px 5px rgba(34,197,94,0.3);">
                        ✅ J'accepte
                    </a>
                    <a href="{lien_refuser}" 
                       style="display: inline-block; background-color: #ef4444; color: white; padding: 15px 40px; 
                              text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; 
                              margin: 0 10px; box-shadow: 0 2px 5px rgba(239,68,68,0.3);">
                        ❌ Je refuse
                    </a>
                </div>
                
                <p style="font-size: 14px; color: #666; text-align: center; margin-top: 30px;">
                    Vous pouvez également répondre directement dans l'application ProFireManager.
                </p>
                
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                
                <p style="font-size: 12px; color: #999; text-align: center;">
                    Ce lien est valide pendant 48 heures.<br>
                    Si vous n'êtes pas concerné par cette demande, veuillez ignorer cet email.
                </p>
            </div>
        </body>
        </html>
        """
        
        params = {
            "from": "ProFireManager <remplacement@profiremanager.ca>",
            "to": [remplacant_email],
            "subject": f"🚨 Demande de remplacement - {type_garde_nom} le {date_garde}",
            "html": html_content
        }
        
        response = resend.Emails.send(params)
        logger.info(f"✅ Email de remplacement envoyé à {remplacant_email} (ID: {response.get('id', 'N/A')})")
        return True
        
    except Exception as e:
        logger.error(f"❌ Erreur envoi email remplacement: {e}", exc_info=True)
        return False


async def envoyer_sms_remplacement(
    db,
    remplacant: Dict[str, Any],
    demande_data: Dict[str, Any],
    demandeur: Dict[str, Any],
    type_garde: Dict[str, Any],
    tenant_id: str,
    token: str,
    formater_numero_telephone
) -> bool:
    """Envoie un SMS au remplaçant potentiel avec un lien pour accepter/refuser"""
    try:
        from twilio.rest import Client
        
        # Récupérer les credentials Twilio depuis les variables d'environnement
        account_sid = os.environ.get('TWILIO_ACCOUNT_SID')
        auth_token = os.environ.get('TWILIO_AUTH_TOKEN')
        twilio_phone = os.environ.get('TWILIO_PHONE_NUMBER')
        
        if not all([account_sid, auth_token, twilio_phone]):
            logger.warning("⚠️ Configuration Twilio incomplète - SMS non envoyé")
            return False
        
        # Récupérer les infos du remplaçant
        remplacant_user = await db.users.find_one({"id": remplacant["user_id"]})
        if not remplacant_user:
            logger.warning(f"Utilisateur non trouvé: {remplacant['user_id']}")
            return False
        
        # Vérifier les préférences de notification
        preferences = remplacant_user.get("preferences_notifications", {})
        if not preferences.get("sms_actif", True):
            logger.info(f"📵 SMS désactivé pour {remplacant_user.get('prenom')} - préférences utilisateur")
            return False
        
        # Récupérer et formater le numéro de téléphone
        telephone = remplacant_user.get("telephone", "")
        if not telephone:
            logger.warning(f"Pas de téléphone pour {remplacant_user.get('prenom')} {remplacant_user.get('nom')}")
            return False
        
        # Formater le numéro au format E.164 si nécessaire
        telephone_formate = formater_numero_telephone(telephone)
        if not telephone_formate:
            logger.warning(f"Numéro de téléphone invalide: {telephone}")
            return False
        
        # Préparer le message
        demandeur_nom = f"{demandeur.get('prenom', '')} {demandeur.get('nom', '')}"
        type_garde_nom = type_garde.get("nom", "Garde")
        date_garde = demande_data.get("date", "")
        heure_debut = type_garde.get("heure_debut", "")
        heure_fin = type_garde.get("heure_fin", "")
        
        frontend_url = os.environ.get('FRONTEND_URL', 'https://www.profiremanager.ca')
        backend_url = os.environ.get('REACT_APP_BACKEND_URL', frontend_url)
        lien_reponse = f"{backend_url}/api/remplacement-action/{token}/choix"
        
        message = (
            f"🚨 ProFireManager: {demandeur_nom} cherche un remplaçant le {date_garde} "
            f"({type_garde_nom} {heure_debut}-{heure_fin}). "
            f"Répondez ici: {lien_reponse}"
        )
        
        # Envoyer le SMS via Twilio
        client = Client(account_sid, auth_token)
        
        sms = client.messages.create(
            body=message,
            from_=twilio_phone,
            to=telephone_formate
        )
        
        logger.info(f"✅ SMS envoyé à {telephone_formate} (SID: {sms.sid})")
        return True
        
    except Exception as e:
        logger.error(f"❌ Erreur envoi SMS remplacement: {e}", exc_info=True)
        return False
