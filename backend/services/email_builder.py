"""
Builder centralisé pour tous les templates emails de ProFireManager.
Design uniforme : header dark slate, barre accent colorée, cards structurées, CTA arrondi.
"""
from datetime import datetime

LOGO_URL = "https://customer-assets.emergentagent.com/job_fireshift-manager/artifacts/6vh2i9cz_05_Icone_Flamme_Rouge_Bordure_D9072B_VISIBLE.png"


def build_email(
    title: str,
    body_html: str,
    accent_color: str = "#dc2626",
    cta_text: str = None,
    cta_url: str = None,
    footer_text: str = None
) -> str:
    """
    Build a complete email HTML with the ProFireManager design system.
    
    Args:
        title: Email subject/title shown in header area
        body_html: Main content HTML (can contain cards, lists, etc.)
        accent_color: Color for accent bar and CTA button
        cta_text: Optional call-to-action button text
        cta_url: Optional call-to-action button URL
        footer_text: Optional custom footer text
    """
    cta_html = ""
    if cta_text and cta_url:
        cta_html = f"""
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 32px 0 16px;">
            <tr>
                <td align="center">
                    <a href="{cta_url}" 
                       style="display: inline-block; background-color: {accent_color}; color: #ffffff; 
                              padding: 14px 36px; text-decoration: none; border-radius: 10px; 
                              font-weight: 600; font-size: 15px;
                              box-shadow: 0 4px 14px rgba(0,0,0,0.12);">
                        {cta_text}
                    </a>
                </td>
            </tr>
        </table>
        """

    footer = footer_text or "Cet email a ete envoye automatiquement par ProFireManager."
    year = datetime.now().year

    return f"""<!DOCTYPE html>
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
                            <div style="height: 4px; background-color: {accent_color};"></div>
                            <div style="padding: 36px 40px;">
                                {body_html}
                                {cta_html}
                            </div>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f8fafc; border-radius: 0 0 16px 16px; border-top: 1px solid #e2e8f0; padding: 24px 40px; text-align: center;">
                            <p style="color: #9ca3af; font-size: 12px; margin: 0 0 4px; line-height: 1.5;">
                                &copy; {year} ProFireManager &mdash; Tous droits reserves
                            </p>
                            <p style="color: #d1d5db; font-size: 11px; margin: 0;">
                                {footer}
                            </p>
                        </td>
                    </tr>
                    
                </table>
            </td>
        </tr>
    </table>
</body>
</html>"""


def email_card(content: str, border_color: str = "#e2e8f0", bg_color: str = "#f8fafc") -> str:
    """Wrap content in a styled card."""
    return f"""
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 16px 0;">
        <tr>
            <td style="background-color: {bg_color}; border-radius: 12px; border: 1px solid {border_color}; padding: 24px;">
                {content}
            </td>
        </tr>
    </table>
    """


def email_alert_card(title: str, message: str, accent_color: str = "#F59E0B", bg_color: str = "#FEF3C7", text_color: str = "#92400E") -> str:
    """Alert card with left border accent."""
    return f"""
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0;">
        <tr>
            <td style="background-color: {bg_color}; border-radius: 12px; border-left: 4px solid {accent_color}; padding: 24px 28px;">
                <h3 style="color: {text_color}; margin: 0 0 8px; font-size: 16px; font-weight: 700;">{title}</h3>
                <p style="color: #4b5563; margin: 0; font-size: 14px; line-height: 1.5;">{message}</p>
            </td>
        </tr>
    </table>
    """


def email_detail_row(label: str, value: str) -> str:
    """Single detail row for info cards."""
    return f"""
    <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">
            <span style="color: #6b7280; font-size: 13px;">{label}</span><br>
            <span style="color: #111827; font-weight: 600; font-size: 15px;">{value}</span>
        </td>
    </tr>
    """
