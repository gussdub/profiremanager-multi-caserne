"""
Tests unitaires pour le module Remplacements - Notifications
============================================================

Ces tests vérifient les fonctions de notification (emails, SMS).
Exécuter avec: pytest tests/remplacements/test_notifications.py -v
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone
import sys
sys.path.insert(0, '/app/backend')

from routes.remplacements.notifications import (
    formater_numero_telephone,
    generer_token_remplacement,
    envoyer_email_remplacement,
    envoyer_email_remplacement_trouve,
    envoyer_email_remplacement_non_trouve,
    envoyer_sms_remplacement
)


class TestFormaterNumeroTelephone:
    """Tests pour formater_numero_telephone dans notifications.py"""
    
    def test_format_standard(self):
        """Numéro 10 chiffres → format E.164"""
        assert formater_numero_telephone("4185551234") == "+14185551234"
    
    def test_format_avec_separateurs(self):
        """Numéro avec tirets et espaces"""
        assert formater_numero_telephone("418-555-1234") == "+14185551234"
        assert formater_numero_telephone("418 555 1234") == "+14185551234"
    
    def test_deja_e164(self):
        """Numéro déjà au format E.164"""
        assert formater_numero_telephone("+14185551234") == "+14185551234"
    
    def test_numero_vide(self):
        """Numéro vide ou None"""
        assert formater_numero_telephone("") is None
        assert formater_numero_telephone(None) is None


class TestGenererTokenRemplacement:
    """Tests pour generer_token_remplacement"""
    
    @pytest.mark.asyncio
    async def test_genere_token_unique(self):
        """Vérifie qu'un token UUID unique est généré"""
        # Mock de la base de données
        mock_db = MagicMock()
        mock_db.tokens_remplacement = MagicMock()
        mock_db.tokens_remplacement.insert_one = AsyncMock()
        
        token = await generer_token_remplacement(
            db=mock_db,
            demande_id="demande-123",
            remplacant_id="user-456",
            tenant_id="tenant-789"
        )
        
        # Vérifie que le token est un UUID valide (36 caractères avec tirets)
        assert len(token) == 36
        assert token.count('-') == 4
    
    @pytest.mark.asyncio
    async def test_token_sauvegarde_en_db(self):
        """Vérifie que le token est sauvegardé en base de données"""
        mock_db = MagicMock()
        mock_db.tokens_remplacement = MagicMock()
        mock_db.tokens_remplacement.insert_one = AsyncMock()
        
        await generer_token_remplacement(
            db=mock_db,
            demande_id="demande-123",
            remplacant_id="user-456",
            tenant_id="tenant-789"
        )
        
        # Vérifie que insert_one a été appelé
        mock_db.tokens_remplacement.insert_one.assert_called_once()
        
        # Vérifie les données sauvegardées
        call_args = mock_db.tokens_remplacement.insert_one.call_args[0][0]
        assert call_args["demande_id"] == "demande-123"
        assert call_args["remplacant_id"] == "user-456"
        assert call_args["tenant_id"] == "tenant-789"
        assert call_args["utilise"] == False


class TestEnvoyerEmailRemplacement:
    """Tests pour envoyer_email_remplacement"""
    
    @pytest.mark.asyncio
    async def test_retourne_false_sans_api_key(self):
        """Sans RESEND_API_KEY, retourne False"""
        mock_db = MagicMock()
        mock_db.users = MagicMock()
        mock_db.users.find_one = AsyncMock(return_value={
            "id": "user-123",
            "email": "test@example.com",
            "prenom": "Jean"
        })
        
        with patch.dict('os.environ', {'RESEND_API_KEY': ''}):
            result = await envoyer_email_remplacement(
                db=mock_db,
                demande_data={"id": "demande-123", "date": "2026-03-20"},
                remplacant={"user_id": "user-123"},
                demandeur={"prenom": "Marie", "nom": "Dupont"},
                type_garde={"nom": "Jour", "heure_debut": "08:00", "heure_fin": "16:00"},
                tenant_id="tenant-123",
                token="token-abc"
            )
        
        assert result == False
    
    @pytest.mark.asyncio
    async def test_retourne_false_sans_email_remplacant(self):
        """Sans email pour le remplaçant, retourne False"""
        mock_db = MagicMock()
        mock_db.users = MagicMock()
        mock_db.users.find_one = AsyncMock(return_value=None)
        
        with patch.dict('os.environ', {'RESEND_API_KEY': 'test-key'}):
            result = await envoyer_email_remplacement(
                db=mock_db,
                demande_data={"id": "demande-123", "date": "2026-03-20"},
                remplacant={"user_id": "user-inexistant"},
                demandeur={"prenom": "Marie", "nom": "Dupont"},
                type_garde={"nom": "Jour", "heure_debut": "08:00", "heure_fin": "16:00"},
                tenant_id="tenant-123",
                token="token-abc"
            )
        
        assert result == False


class TestEnvoyerSmsRemplacement:
    """Tests pour envoyer_sms_remplacement"""
    
    @pytest.mark.asyncio
    async def test_retourne_false_sans_config_twilio(self):
        """Sans configuration Twilio complète, retourne False"""
        mock_db = MagicMock()
        
        with patch.dict('os.environ', {
            'TWILIO_ACCOUNT_SID': '',
            'TWILIO_AUTH_TOKEN': '',
            'TWILIO_PHONE_NUMBER': ''
        }):
            result = await envoyer_sms_remplacement(
                db=mock_db,
                remplacant={"user_id": "user-123"},
                demande_data={"date": "2026-03-20"},
                demandeur={"prenom": "Marie", "nom": "Dupont"},
                type_garde={"nom": "Jour", "heure_debut": "08:00", "heure_fin": "16:00"},
                tenant_id="tenant-123",
                token="token-abc"
            )
        
        assert result == False
    
    @pytest.mark.asyncio
    async def test_retourne_false_sans_telephone(self):
        """Sans téléphone pour le remplaçant, retourne False"""
        mock_db = MagicMock()
        mock_db.users = MagicMock()
        mock_db.users.find_one = AsyncMock(return_value={
            "id": "user-123",
            "prenom": "Jean",
            "telephone": ""  # Pas de téléphone
        })
        
        with patch.dict('os.environ', {
            'TWILIO_ACCOUNT_SID': 'test-sid',
            'TWILIO_AUTH_TOKEN': 'test-token',
            'TWILIO_PHONE_NUMBER': '+15551234567'
        }):
            result = await envoyer_sms_remplacement(
                db=mock_db,
                remplacant={"user_id": "user-123"},
                demande_data={"date": "2026-03-20"},
                demandeur={"prenom": "Marie", "nom": "Dupont"},
                type_garde={"nom": "Jour", "heure_debut": "08:00", "heure_fin": "16:00"},
                tenant_id="tenant-123",
                token="token-abc"
            )
        
        assert result == False


# Exécution des tests
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
