"""
Fonctions de notification pour le module Remplacements
- Emails (Resend)
- SMS (Twilio)
- Push notifications

Ce module centralise toutes les fonctions d'envoi de notifications
pour les demandes de remplacement.
"""

from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional
import uuid
import logging
import os
import re

logger = logging.getLogger(__name__)


def formater_numero_telephone(numero: str) -> Optional[str]:
    """
    Formate un numéro de téléphone au format E.164 (ex: +14185551234)
    Accepte plusieurs formats d'entrée.
    """
    if not numero:
        return None
    
    # Retirer tous les caractères non numériques sauf le +
    numero_clean = re.sub(r'[^\d+]', '', numero)
    
    # Si le numéro commence déjà par +, le retourner tel quel
    if numero_clean.startswith('+'):
        return numero_clean if len(numero_clean) >= 11 else None
    
    # Ajouter le préfixe +1 pour les numéros nord-américains (10 chiffres)
    if len(numero_clean) == 10:
        return f"+1{numero_clean}"
    
    # Si 11 chiffres commençant par 1, ajouter juste le +
    if len(numero_clean) == 11 and numero_clean.startswith('1'):
        return f"+{numero_clean}"
    
    return None


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
) -> bool:
    """Envoie un email au remplaçant potentiel avec les boutons Accepter/Refuser"""
    try:
        import resend
        from routes.emails_history import log_email_sent
        
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
        
        # Récupérer le tenant pour le nom
        tenant = await db.tenants.find_one({"id": tenant_id})
        tenant_nom = tenant.get("nom", "ProFireManager") if tenant else "ProFireManager"
        
        remplacant_prenom = remplacant_user.get("prenom", "")
        demandeur_nom = f"{demandeur.get('prenom', '')} {demandeur.get('nom', '')}"
        type_garde_nom = type_garde.get("nom", "Garde") if type_garde else "Garde"
        date_garde = demande_data.get("date", "")
        heure_debut = type_garde.get("heure_debut", "") if type_garde else ""
        heure_fin = type_garde.get("heure_fin", "") if type_garde else ""
        raison = demande_data.get("raison", "Non spécifiée")
        
        sender_email = os.environ.get('SENDER_EMAIL', 'noreply@profiremanager.ca')
        backend_url = os.environ.get('REACT_APP_BACKEND_URL', 'https://www.profiremanager.ca')
        
        lien_accepter = f"{backend_url}/api/remplacement-action/{token}/accepter"
        lien_refuser = f"{backend_url}/api/remplacement-action/{token}/refuser"
        
        html_content = f"""
        <!DOCTYPE html>
        <html lang="fr">
        <head>
            <meta charset="utf-8">
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
                                    <img src="https://customer-assets.emergentagent.com/job_fireshift-manager/artifacts/6vh2i9cz_05_Icone_Flamme_Rouge_Bordure_D9072B_VISIBLE.png" alt="ProFireManager" width="52" height="52" style="width: 52px; height: 52px; margin-bottom: 12px; display: block; margin-left: auto; margin-right: auto;">
                                    <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700;">ProFireManager</h1>
                                    <p style="color: #94a3b8; margin: 4px 0 0; font-size: 13px;">Gestion des services d'incendie</p>
                                </td>
                            </tr>
                            
                            <!-- Body -->
                            <tr>
                                <td style="background-color: #ffffff; padding: 0;">
                                    <div style="height: 4px; background-color: #3B82F6;"></div>
                                    <div style="padding: 36px 40px;">
                                        
                                        <p style="color: #6b7280; font-size: 15px; margin: 0 0 8px;">Bonjour {remplacant_prenom},</p>
                                        <p style="color: #374151; font-size: 15px; margin: 0 0 24px;"><strong>{demandeur_nom}</strong> vous sollicite pour un remplacement.</p>
                                        
                                        <!-- Details Card -->
                                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden;">
                                            <tr>
                                                <td style="padding: 24px;">
                                                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                                        <tr>
                                                            <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">
                                                                <span style="color: #6b7280; font-size: 14px;">Date</span><br>
                                                                <span style="color: #111827; font-weight: 600; font-size: 15px;">{date_garde}</span>
                                                            </td>
                                                        </tr>
                                                        <tr>
                                                            <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">
                                                                <span style="color: #6b7280; font-size: 14px;">Horaire</span><br>
                                                                <span style="color: #111827; font-weight: 600; font-size: 15px;">{heure_debut} - {heure_fin}</span>
                                                            </td>
                                                        </tr>
                                                        <tr>
                                                            <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">
                                                                <span style="color: #6b7280; font-size: 14px;">Type de garde</span><br>
                                                                <span style="color: #111827; font-weight: 600; font-size: 15px;">{type_garde_nom}</span>
                                                            </td>
                                                        </tr>
                                                        <tr>
                                                            <td style="padding: 10px 0;">
                                                                <span style="color: #6b7280; font-size: 14px;">Raison</span><br>
                                                                <span style="color: #111827; font-weight: 600; font-size: 15px;">{raison}</span>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                        <!-- Action Buttons -->
                                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 32px 0 16px;">
                                            <tr>
                                                <td align="center">
                                                    <a href="{lien_accepter}" 
                                                       style="display: inline-block; background-color: #10B981; color: #ffffff; 
                                                              padding: 14px 36px; text-decoration: none; border-radius: 10px; 
                                                              font-weight: 600; font-size: 15px; margin-right: 12px;
                                                              box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3);">
                                                        Accepter
                                                    </a>
                                                    <a href="{lien_refuser}" 
                                                       style="display: inline-block; background-color: #EF4444; color: #ffffff; 
                                                              padding: 14px 36px; text-decoration: none; border-radius: 10px; 
                                                              font-weight: 600; font-size: 15px;
                                                              box-shadow: 0 4px 14px rgba(239, 68, 68, 0.3);">
                                                        Refuser
                                                    </a>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                        <p style="color: #9ca3af; font-size: 13px; text-align: center; margin: 0 0 24px;">Ce lien expire dans 48 heures.</p>
                                        
                                        <p style="color: #374151; font-size: 14px; margin: 0;">Cordialement,<br><strong>L'equipe {tenant_nom}</strong></p>
                                    </div>
                                </td>
                            </tr>
                            
                            <!-- Footer -->
                            <tr>
                                <td style="background-color: #f8fafc; border-radius: 0 0 16px 16px; border-top: 1px solid #e2e8f0; padding: 24px 40px; text-align: center;">
                                    <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                                        Ceci est un message automatique. Merci de ne pas y repondre.
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
        
        params = {
            "from": f"{tenant_nom} <{sender_email}>",
            "to": [remplacant_user["email"]],
            "subject": f"🚒 Demande de remplacement le {date_garde}",
            "html": html_content
        }
        
        response = resend.Emails.send(params)
        logger.info(f"✅ Email remplacement envoyé à {remplacant_user['email']} (ID: {response.get('id', 'N/A')})")
        
        # Logger l'email
        try:
            await log_email_sent(
                tenant_id=tenant_id,
                destinataire=remplacant_user["email"],
                sujet=f"🚒 Demande de remplacement le {date_garde}",
                type_email="demande_remplacement",
                statut="sent",
                metadata={
                    "demande_id": demande_data.get("id"),
                    "remplacant_id": remplacant.get("user_id"),
                    "token": token
                }
            )
        except Exception as log_error:
            logger.warning(f"⚠️ Erreur log email: {log_error}")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Erreur envoi email remplacement: {e}", exc_info=True)
        return False


async def envoyer_email_remplacement_trouve(
    db,
    demande_data: dict,
    remplacant: dict,
    demandeur: dict,
    type_garde: dict,
    tenant: dict
) -> bool:
    """Envoie un email au demandeur pour l'informer qu'un remplaçant a été trouvé"""
    try:
        import resend
        from routes.emails_history import log_email_sent
        
        resend_api_key = os.environ.get('RESEND_API_KEY')
        if not resend_api_key:
            logger.warning(f"RESEND_API_KEY non configurée - Email non envoyé")
            return False
        
        resend.api_key = resend_api_key
        
        demandeur_email = demandeur.get("email")
        if not demandeur_email:
            logger.warning(f"Email non trouvé pour demandeur {demandeur.get('id')}")
            return False
        
        # Vérifier les préférences de notification
        preferences = demandeur.get("preferences_notifications", {})
        if not preferences.get("email_actif", True):
            logger.info(f"📧 Email désactivé pour {demandeur.get('prenom')} - préférences utilisateur")
            return False
        
        demandeur_prenom = demandeur.get("prenom", "")
        remplacant_nom = f"{remplacant.get('prenom', '')} {remplacant.get('nom', '')}"
        type_garde_nom = type_garde.get("nom", "Garde") if type_garde else "Garde"
        date_garde = demande_data.get("date", "")
        tenant_nom = tenant.get("nom", "ProFireManager")
        
        sender_email = os.environ.get('SENDER_EMAIL', 'noreply@profiremanager.ca')
        frontend_url = os.environ.get('FRONTEND_URL', 'https://www.profiremanager.ca')
        
        html_content = f"""
        <!DOCTYPE html>
        <html lang="fr">
        <head>
            <meta charset="utf-8">
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
                                    <img src="https://customer-assets.emergentagent.com/job_fireshift-manager/artifacts/6vh2i9cz_05_Icone_Flamme_Rouge_Bordure_D9072B_VISIBLE.png" alt="ProFireManager" width="52" height="52" style="width: 52px; height: 52px; margin-bottom: 12px; display: block; margin-left: auto; margin-right: auto;">
                                    <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700;">ProFireManager</h1>
                                    <p style="color: #94a3b8; margin: 4px 0 0; font-size: 13px;">Gestion des services d'incendie</p>
                                </td>
                            </tr>
                            
                            <!-- Body -->
                            <tr>
                                <td style="background-color: #ffffff; padding: 0;">
                                    <div style="height: 4px; background-color: #10B981;"></div>
                                    <div style="padding: 36px 40px;">
                                        
                                        <p style="color: #6b7280; font-size: 15px; margin: 0 0 24px;">Bonjour {demandeur_prenom},</p>
                                        
                                        <!-- Success Card -->
                                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                            <tr>
                                                <td style="background-color: #ECFDF5; border-radius: 12px; border-left: 4px solid #10B981; padding: 24px 28px; text-align: center;">
                                                    <h2 style="color: #065F46; margin: 0 0 8px; font-size: 20px; font-weight: 700;">Remplacant trouve !</h2>
                                                    <p style="color: #047857; margin: 0; font-size: 15px;">
                                                        <strong>{remplacant_nom}</strong> a accepte de vous remplacer.
                                                    </p>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                        <!-- Details -->
                                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; margin: 24px 0;">
                                            <tr>
                                                <td style="padding: 24px;">
                                                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                                        <tr>
                                                            <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">
                                                                <span style="color: #6b7280; font-size: 14px;">Date</span><br>
                                                                <span style="color: #111827; font-weight: 600; font-size: 15px;">{date_garde}</span>
                                                            </td>
                                                        </tr>
                                                        <tr>
                                                            <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">
                                                                <span style="color: #6b7280; font-size: 14px;">Type de garde</span><br>
                                                                <span style="color: #111827; font-weight: 600; font-size: 15px;">{type_garde_nom}</span>
                                                            </td>
                                                        </tr>
                                                        <tr>
                                                            <td style="padding: 10px 0;">
                                                                <span style="color: #6b7280; font-size: 14px;">Remplacant</span><br>
                                                                <span style="color: #111827; font-weight: 600; font-size: 15px;">{remplacant_nom}</span>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                        <p style="color: #374151; font-size: 14px; margin: 0 0 24px;">Le planning a ete mis a jour automatiquement.</p>
                                        
                                        <!-- CTA -->
                                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                            <tr>
                                                <td align="center">
                                                    <a href="{frontend_url}/remplacements" 
                                                       style="display: inline-block; background-color: #10B981; color: #ffffff; 
                                                              padding: 14px 36px; text-decoration: none; border-radius: 10px; 
                                                              font-weight: 600; font-size: 15px;
                                                              box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3);">
                                                        Voir mes remplacements
                                                    </a>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                        <p style="color: #374151; font-size: 14px; margin: 32px 0 0;">Cordialement,<br><strong>L'equipe {tenant_nom}</strong></p>
                                    </div>
                                </td>
                            </tr>
                            
                            <!-- Footer -->
                            <tr>
                                <td style="background-color: #f8fafc; border-radius: 0 0 16px 16px; border-top: 1px solid #e2e8f0; padding: 24px 40px; text-align: center;">
                                    <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                                        Ceci est un message automatique. Merci de ne pas y repondre.
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
        
        params = {
            "from": f"{tenant_nom} <{sender_email}>",
            "to": [demandeur_email],
            "subject": f"✅ Remplaçant trouvé pour le {date_garde}",
            "html": html_content
        }
        
        response = resend.Emails.send(params)
        logger.info(f"✅ Email 'remplacement trouvé' envoyé à {demandeur_email} (ID: {response.get('id', 'N/A')})")
        
        # Logger l'email
        try:
            await log_email_sent(
                tenant_id=tenant.get("id"),
                destinataire=demandeur_email,
                sujet=f"✅ Remplaçant trouvé pour le {date_garde}",
                type_email="remplacement_trouve",
                statut="sent",
                metadata={
                    "demande_id": demande_data.get("id"),
                    "remplacant_id": remplacant.get("id"),
                    "demandeur_id": demandeur.get("id"),
                    "date_garde": date_garde
                }
            )
        except Exception as log_error:
            logger.warning(f"⚠️ Erreur log email: {log_error}")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Erreur envoi email 'remplacement trouvé': {e}", exc_info=True)
        return False


async def envoyer_email_remplacement_non_trouve(
    db,
    demande_data: dict,
    demandeur: dict,
    type_garde: dict,
    tenant: dict
) -> bool:
    """Envoie un email au demandeur pour l'informer qu'aucun remplaçant n'a été trouvé"""
    try:
        import resend
        from routes.emails_history import log_email_sent
        
        resend_api_key = os.environ.get('RESEND_API_KEY')
        if not resend_api_key:
            logger.warning(f"RESEND_API_KEY non configurée - Email non envoyé")
            return False
        
        resend.api_key = resend_api_key
        
        demandeur_email = demandeur.get("email")
        if not demandeur_email:
            logger.warning(f"Email non trouvé pour demandeur {demandeur.get('id')}")
            return False
        
        # Vérifier les préférences de notification
        preferences = demandeur.get("preferences_notifications", {})
        if not preferences.get("email_actif", True):
            logger.info(f"📧 Email désactivé pour {demandeur.get('prenom')} - préférences utilisateur")
            return False
        
        demandeur_prenom = demandeur.get("prenom", "")
        type_garde_nom = type_garde.get("nom", "Garde") if type_garde else "Garde"
        date_garde = demande_data.get("date", "")
        tenant_nom = tenant.get("nom", "ProFireManager")
        
        sender_email = os.environ.get('SENDER_EMAIL', 'noreply@profiremanager.ca')
        frontend_url = os.environ.get('FRONTEND_URL', 'https://www.profiremanager.ca')
        
        html_content = f"""
        <!DOCTYPE html>
        <html lang="fr">
        <head>
            <meta charset="utf-8">
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
                                    <img src="https://customer-assets.emergentagent.com/job_fireshift-manager/artifacts/6vh2i9cz_05_Icone_Flamme_Rouge_Bordure_D9072B_VISIBLE.png" alt="ProFireManager" width="52" height="52" style="width: 52px; height: 52px; margin-bottom: 12px; display: block; margin-left: auto; margin-right: auto;">
                                    <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700;">ProFireManager</h1>
                                    <p style="color: #94a3b8; margin: 4px 0 0; font-size: 13px;">Gestion des services d'incendie</p>
                                </td>
                            </tr>
                            
                            <!-- Body -->
                            <tr>
                                <td style="background-color: #ffffff; padding: 0;">
                                    <div style="height: 4px; background-color: #F59E0B;"></div>
                                    <div style="padding: 36px 40px;">
                                        
                                        <p style="color: #6b7280; font-size: 15px; margin: 0 0 24px;">Bonjour {demandeur_prenom},</p>
                                        
                                        <!-- Alert Card -->
                                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                            <tr>
                                                <td style="background-color: #FEF3C7; border-radius: 12px; border-left: 4px solid #F59E0B; padding: 24px 28px; text-align: center;">
                                                    <h2 style="color: #92400E; margin: 0 0 8px; font-size: 20px; font-weight: 700;">Quart ouvert a tous</h2>
                                                    <p style="color: #A16207; margin: 0; font-size: 15px;">
                                                        Aucun remplacant n'a ete trouve automatiquement. Votre quart est maintenant visible par tous les employes.
                                                    </p>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                        <!-- Details -->
                                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; margin: 24px 0;">
                                            <tr>
                                                <td style="padding: 24px;">
                                                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                                        <tr>
                                                            <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">
                                                                <span style="color: #6b7280; font-size: 14px;">Date</span><br>
                                                                <span style="color: #111827; font-weight: 600; font-size: 15px;">{date_garde}</span>
                                                            </td>
                                                        </tr>
                                                        <tr>
                                                            <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">
                                                                <span style="color: #6b7280; font-size: 14px;">Type de garde</span><br>
                                                                <span style="color: #111827; font-weight: 600; font-size: 15px;">{type_garde_nom}</span>
                                                            </td>
                                                        </tr>
                                                        <tr>
                                                            <td style="padding: 10px 0;">
                                                                <span style="color: #6b7280; font-size: 14px;">Statut</span><br>
                                                                <span style="color: #F59E0B; font-weight: 600; font-size: 15px;">Ouvert a tous les employes</span>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                        <p style="color: #374151; font-size: 14px; margin: 0 0 24px; line-height: 1.6;">
                                            Tous les employes ont ete notifies. Le premier volontaire prendra votre quart. Vous serez informe des que quelqu'un se porte volontaire.
                                        </p>
                                        
                                        <!-- CTA -->
                                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                            <tr>
                                                <td align="center">
                                                    <a href="{frontend_url}/remplacements" 
                                                       style="display: inline-block; background-color: #F59E0B; color: #ffffff; 
                                                              padding: 14px 36px; text-decoration: none; border-radius: 10px; 
                                                              font-weight: 600; font-size: 15px;
                                                              box-shadow: 0 4px 14px rgba(245, 158, 11, 0.3);">
                                                        Voir mes demandes
                                                    </a>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                        <p style="color: #374151; font-size: 14px; margin: 32px 0 0;">Cordialement,<br><strong>L'equipe {tenant_nom}</strong></p>
                                    </div>
                                </td>
                            </tr>
                            
                            <!-- Footer -->
                            <tr>
                                <td style="background-color: #f8fafc; border-radius: 0 0 16px 16px; border-top: 1px solid #e2e8f0; padding: 24px 40px; text-align: center;">
                                    <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                                        Ceci est un message automatique. Merci de ne pas y repondre.
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
        
        params = {
            "from": f"{tenant_nom} <{sender_email}>",
            "to": [demandeur_email],
            "subject": f"❌ Aucun remplaçant trouvé pour le {date_garde}",
            "html": html_content
        }
        
        response = resend.Emails.send(params)
        logger.info(f"✅ Email 'remplacement non trouvé' envoyé à {demandeur_email} (ID: {response.get('id', 'N/A')})")
        
        # Logger l'email
        try:
            await log_email_sent(
                tenant_id=tenant.get("id"),
                destinataire=demandeur_email,
                sujet=f"❌ Aucun remplaçant trouvé pour le {date_garde}",
                type_email="remplacement_non_trouve",
                statut="sent",
                metadata={
                    "demande_id": demande_data.get("id"),
                    "demandeur_id": demandeur.get("id"),
                    "date_garde": date_garde
                }
            )
        except Exception as log_error:
            logger.warning(f"⚠️ Erreur log email: {log_error}")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Erreur envoi email 'remplacement non trouvé': {e}", exc_info=True)
        return False


async def envoyer_sms_remplacement(
    db,
    remplacant: Dict[str, Any],
    demande_data: Dict[str, Any],
    demandeur: Dict[str, Any],
    type_garde: Dict[str, Any],
    tenant_id: str,
    token: str
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
        
        backend_url = os.environ.get('REACT_APP_BACKEND_URL', 'https://www.profiremanager.ca')
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
