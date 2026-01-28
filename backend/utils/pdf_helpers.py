"""
Helpers PDF partagés pour la génération de documents PDF
"""
import base64
from io import BytesIO as IOBytesIO
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER


def create_pdf_header_elements(tenant, styles):
    """
    Crée les éléments de header personnalisés pour les PDFs
    Retourne une liste d'éléments à ajouter au document
    """
    elements = []
    
    # Logo (si présent)
    if hasattr(tenant, 'logo_url') and tenant.logo_url:
        try:
            if tenant.logo_url.startswith('data:image/'):
                # Extraire les données base64
                header, encoded = tenant.logo_url.split(',', 1)
                logo_data = base64.b64decode(encoded)
                logo_buffer = IOBytesIO(logo_data)
                
                # Utiliser PIL pour obtenir les dimensions de l'image
                from PIL import Image as PILImage
                pil_image = PILImage.open(logo_buffer)
                img_width, img_height = pil_image.size
                
                # Calculer les dimensions avec limites max pour éviter le dépassement
                max_width = 1.2 * inch
                max_height = 1.0 * inch  # Limite maximale de hauteur
                
                aspect_ratio = img_height / img_width
                
                # Calculer en fonction de la largeur
                target_width = max_width
                target_height = target_width * aspect_ratio
                
                # Si la hauteur dépasse la limite, recalculer en fonction de la hauteur
                if target_height > max_height:
                    target_height = max_height
                    target_width = target_height / aspect_ratio
                
                # Réinitialiser le buffer pour ReportLab
                logo_buffer.seek(0)
                
                # Ajouter le logo avec largeur et hauteur explicites
                logo = Image(logo_buffer, width=target_width, height=target_height)
                logo.hAlign = 'LEFT'
                elements.append(logo)
                elements.append(Spacer(1, 0.1 * inch))
        except Exception as e:
            print(f"Erreur chargement logo PDF: {e}")
    
    # Nom du service
    nom_service = tenant.nom_service if hasattr(tenant, 'nom_service') and tenant.nom_service else tenant.nom
    
    header_style = ParagraphStyle(
        'ServiceHeader',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.HexColor('#1f2937'),
        spaceAfter=10,
        alignment=TA_CENTER
    )
    
    elements.append(Paragraph(nom_service, header_style))
    elements.append(Spacer(1, 0.2 * inch))
    
    return elements


def create_pdf_footer_text(tenant):
    """
    Crée le texte du footer pour les PDFs
    """
    footer_parts = []
    
    # Toujours afficher ProFireManager (sauf si explicitement désactivé)
    if not hasattr(tenant, 'afficher_profiremanager') or tenant.afficher_profiremanager:
        footer_parts.append("Généré par ProFireManager • www.profiremanager.com")
    
    return " | ".join(footer_parts) if footer_parts else ""


class BrandedDocTemplate(SimpleDocTemplate):
    """
    Template de document PDF personnalisé avec branding tenant automatique
    Hérite de SimpleDocTemplate pour la simplicité
    """
    def __init__(self, filename, tenant=None, **kwargs):
        self.tenant = tenant
        # Appeler le constructeur de SimpleDocTemplate
        SimpleDocTemplate.__init__(self, filename, **kwargs)
    
    def afterPage(self, canvas=None, doc=None):
        """
        Méthode appelée après chaque page pour ajouter le branding
        Compatible avec ReportLab 4.x - peut être appelée avec ou sans arguments
        """
        pass


def create_branded_pdf(tenant, pagesize=A4, **kwargs):
    """
    Fonction helper pour créer un PDF brandé avec logo et footer
    
    Args:
        tenant: L'objet tenant
        pagesize: Taille de la page (A4, letter, etc.)
        **kwargs: Arguments additionnels pour SimpleDocTemplate
        
    Returns:
        tuple: (buffer, doc, elements_with_header)
        - buffer: BytesIO object
        - doc: SimpleDocTemplate instance avec branding
        - elements_with_header: Liste avec logo et header déjà ajoutés
    """
    buffer = IOBytesIO()
    
    # Utiliser les marges par défaut si non spécifiées
    if 'topMargin' not in kwargs:
        kwargs['topMargin'] = 0.75 * inch
    if 'bottomMargin' not in kwargs:
        kwargs['bottomMargin'] = 0.75 * inch
    
    # Utiliser SimpleDocTemplate directement pour la simplicité
    doc = SimpleDocTemplate(buffer, pagesize=pagesize, **kwargs)
    styles = getSampleStyleSheet()
    
    # Créer les éléments de base avec logo et header
    elements = create_pdf_header_elements(tenant, styles)
    
    return buffer, doc, elements


def get_modern_pdf_styles(styles):
    """
    Retourne les styles modernes standardisés pour tous les PDFs
    Basé sur le design du rapport d'inspection (Ronde de sécurité)
    """
    title_style = ParagraphStyle(
        'ModernTitle',
        parent=styles['Heading1'],
        fontSize=20,
        textColor=colors.HexColor('#1f2937'),
        spaceAfter=30,
        alignment=TA_CENTER
    )
    
    heading_style = ParagraphStyle(
        'ModernHeading',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.HexColor('#374151'),
        spaceAfter=12,
        spaceBefore=20
    )
    
    subheading_style = ParagraphStyle(
        'ModernSubheading',
        parent=styles['Normal'],
        fontSize=12,
        textColor=colors.HexColor('#374151'),
        spaceAfter=10,
        alignment=TA_CENTER
    )
    
    return {
        'title': title_style,
        'heading': heading_style,
        'subheading': subheading_style,
        'primary_color': colors.HexColor('#1f2937'),
        'secondary_color': colors.HexColor('#374151'),
        'bg_light': colors.HexColor('#f3f4f6'),
        'success': colors.HexColor('#10b981'),
        'error': colors.HexColor('#ef4444'),
        'grid': colors.HexColor('#e5e7eb'),
        'warning_bg': colors.HexColor('#fef2f2')
    }
