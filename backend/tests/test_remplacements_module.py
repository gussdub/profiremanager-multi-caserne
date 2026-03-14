"""
Tests unitaires pour le module Remplacements
=============================================

Tests pour les fonctions utilitaires, modèles et logique métier.
"""

import pytest
from datetime import datetime, timezone, timedelta
import asyncio


class TestCalculerPriorite:
    """Tests pour la fonction calculer_priorite_demande"""
    
    @pytest.mark.asyncio
    async def test_priorite_urgent_si_moins_24h(self):
        """Une demande pour aujourd'hui doit être urgente"""
        from routes.remplacements.utils import calculer_priorite_demande
        
        aujourdhui = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        priorite = await calculer_priorite_demande(aujourdhui)
        assert priorite == "urgent", f"Attendu 'urgent' pour {aujourdhui}, obtenu '{priorite}'"
    
    @pytest.mark.asyncio
    async def test_priorite_normal_si_plus_24h(self):
        """Une demande pour dans 3 jours doit être normale"""
        from routes.remplacements.utils import calculer_priorite_demande
        
        dans_3_jours = (datetime.now(timezone.utc) + timedelta(days=3)).strftime("%Y-%m-%d")
        priorite = await calculer_priorite_demande(dans_3_jours)
        assert priorite == "normal", f"Attendu 'normal' pour {dans_3_jours}, obtenu '{priorite}'"
    
    @pytest.mark.asyncio
    async def test_priorite_date_invalide(self):
        """Une date invalide doit retourner 'normal' par défaut"""
        from routes.remplacements.utils import calculer_priorite_demande
        
        priorite = await calculer_priorite_demande("invalid-date")
        assert priorite == "normal", "Une date invalide devrait retourner 'normal'"


class TestHeuresSilencieuses:
    """Tests pour la fonction est_dans_heures_silencieuses"""
    
    def test_plage_nocturne_passe_minuit(self):
        """Test avec une plage qui passe minuit (21:00 - 07:00)"""
        from routes.remplacements.utils import est_dans_heures_silencieuses
        
        # Cette fonction dépend de l'heure actuelle à Montréal
        # On vérifie juste qu'elle ne crash pas
        result = est_dans_heures_silencieuses("21:00", "07:00")
        assert isinstance(result, bool), "Devrait retourner un booléen"
    
    def test_plage_normale(self):
        """Test avec une plage normale (01:00 - 05:00)"""
        from routes.remplacements.utils import est_dans_heures_silencieuses
        
        result = est_dans_heures_silencieuses("01:00", "05:00")
        assert isinstance(result, bool), "Devrait retourner un booléen"


class TestFormaterTelephone:
    """Tests pour la fonction formater_numero_telephone"""
    
    def test_format_10_chiffres(self):
        """Un numéro à 10 chiffres doit être formaté avec +1"""
        from routes.remplacements.utils import formater_numero_telephone
        
        result = formater_numero_telephone("5141234567")
        assert result == "+15141234567", f"Attendu '+15141234567', obtenu '{result}'"
    
    def test_format_avec_tirets(self):
        """Un numéro avec tirets doit être nettoyé"""
        from routes.remplacements.utils import formater_numero_telephone
        
        result = formater_numero_telephone("514-123-4567")
        assert result == "+15141234567", f"Attendu '+15141234567', obtenu '{result}'"
    
    def test_format_deja_e164(self):
        """Un numéro déjà au format E.164 doit rester inchangé"""
        from routes.remplacements.utils import formater_numero_telephone
        
        result = formater_numero_telephone("+15141234567")
        assert result == "+15141234567", f"Attendu '+15141234567', obtenu '{result}'"
    
    def test_format_11_chiffres_avec_1(self):
        """Un numéro à 11 chiffres commençant par 1"""
        from routes.remplacements.utils import formater_numero_telephone
        
        result = formater_numero_telephone("15141234567")
        assert result == "+15141234567", f"Attendu '+15141234567', obtenu '{result}'"
    
    def test_numero_vide(self):
        """Un numéro vide doit retourner None"""
        from routes.remplacements.utils import formater_numero_telephone
        
        result = formater_numero_telephone("")
        assert result is None, "Un numéro vide devrait retourner None"
    
    def test_numero_none(self):
        """None doit retourner None"""
        from routes.remplacements.utils import formater_numero_telephone
        
        result = formater_numero_telephone(None)
        assert result is None, "None devrait retourner None"


class TestModeles:
    """Tests pour les modèles Pydantic"""
    
    def test_demande_remplacement_creation(self):
        """Test de création d'une DemandeRemplacement"""
        from routes.remplacements.models import DemandeRemplacement
        
        demande = DemandeRemplacement(
            tenant_id="test-tenant",
            demandeur_id="user-123",
            type_garde_id="garde-456",
            date="2026-03-15",
            raison="Test"
        )
        
        assert demande.tenant_id == "test-tenant"
        assert demande.statut == "en_attente"
        assert demande.priorite == "normal"
        assert demande.id is not None  # UUID auto-généré
    
    def test_parametres_remplacements_defaults(self):
        """Test des valeurs par défaut de ParametresRemplacements"""
        from routes.remplacements.models import ParametresRemplacements
        
        params = ParametresRemplacements(tenant_id="test-tenant")
        
        assert params.mode_notification == "simultane"
        assert params.taille_groupe == 3
        assert params.max_contacts == 5
        assert params.heures_silencieuses_actif == True
        assert params.heure_debut_silence == "21:00"
        assert params.heure_fin_silence == "07:00"


class TestProchainheureActive:
    """Tests pour la fonction calculer_prochaine_heure_active"""
    
    def test_retourne_datetime(self):
        """Doit retourner un datetime en UTC"""
        from routes.remplacements.utils import calculer_prochaine_heure_active
        
        result = calculer_prochaine_heure_active("07:00")
        
        assert isinstance(result, datetime), "Devrait retourner un datetime"
        assert result.tzinfo is not None, "Devrait avoir un timezone"


# ==================== EXÉCUTION DES TESTS ====================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
