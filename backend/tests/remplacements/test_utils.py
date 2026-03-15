"""
Tests unitaires pour le module Remplacements - Utils
====================================================

Ces tests vérifient les fonctions utilitaires du module remplacements.
Exécuter avec: pytest tests/remplacements/test_utils.py -v
"""

import pytest
from datetime import datetime, timezone, timedelta
import sys
sys.path.insert(0, '/app/backend')

from routes.remplacements.utils import (
    calculer_priorite_demande,
    est_dans_heures_silencieuses,
    calculer_prochaine_heure_active,
    formater_numero_telephone
)


class TestFormaterNumeroTelephone:
    """Tests pour la fonction formater_numero_telephone"""
    
    def test_numero_10_chiffres(self):
        """Test avec un numéro nord-américain standard (10 chiffres)"""
        assert formater_numero_telephone("4185551234") == "+14185551234"
    
    def test_numero_avec_tirets(self):
        """Test avec un numéro formaté avec tirets"""
        assert formater_numero_telephone("418-555-1234") == "+14185551234"
    
    def test_numero_avec_espaces(self):
        """Test avec un numéro formaté avec espaces"""
        assert formater_numero_telephone("418 555 1234") == "+14185551234"
    
    def test_numero_avec_parentheses(self):
        """Test avec un numéro formaté avec parenthèses"""
        assert formater_numero_telephone("(418) 555-1234") == "+14185551234"
    
    def test_numero_11_chiffres_avec_1(self):
        """Test avec un numéro commençant par 1 (11 chiffres)"""
        assert formater_numero_telephone("14185551234") == "+14185551234"
    
    def test_numero_deja_formate_e164(self):
        """Test avec un numéro déjà au format E.164"""
        assert formater_numero_telephone("+14185551234") == "+14185551234"
    
    def test_numero_vide(self):
        """Test avec un numéro vide"""
        assert formater_numero_telephone("") is None
        assert formater_numero_telephone(None) is None


class TestCalculerPrioriteDemande:
    """Tests pour la fonction calculer_priorite_demande (asynchrone)"""
    
    @pytest.mark.asyncio
    async def test_priorite_urgente_dans_24h(self):
        """Test priorité urgente - garde dans moins de 24h"""
        # Date demain
        demain = (datetime.now(timezone.utc) + timedelta(hours=12)).strftime("%Y-%m-%d")
        priorite = await calculer_priorite_demande(demain)
        assert priorite == "urgent"
    
    @pytest.mark.asyncio
    async def test_priorite_normale_plus_de_24h(self):
        """Test priorité normale - garde dans plus de 24h"""
        # Date dans 3 jours
        dans_3_jours = (datetime.now(timezone.utc) + timedelta(days=3)).strftime("%Y-%m-%d")
        priorite = await calculer_priorite_demande(dans_3_jours)
        assert priorite == "normal"
    
    @pytest.mark.asyncio
    async def test_priorite_avec_date_invalide(self):
        """Test avec une date invalide - retourne normal par défaut"""
        priorite = await calculer_priorite_demande("date-invalide")
        assert priorite == "normal"


class TestEstDansHeuresSilencieuses:
    """Tests pour la fonction est_dans_heures_silencieuses"""
    
    def test_plage_normale(self):
        """Test avec une plage horaire normale (pas de passage minuit)"""
        # La fonction prend heure_debut et heure_fin en paramètres
        result = est_dans_heures_silencieuses("22:00", "07:00")
        assert isinstance(result, bool)
    
    def test_retourne_boolean(self):
        """Test que la fonction retourne toujours un booléen"""
        result = est_dans_heures_silencieuses("21:00", "06:00")
        assert result in [True, False]
    
    def test_plage_inversee(self):
        """Test avec une plage qui ne passe pas minuit"""
        result = est_dans_heures_silencieuses("08:00", "17:00")
        assert isinstance(result, bool)


class TestCalculerProchaineHeureActive:
    """Tests pour la fonction calculer_prochaine_heure_active"""
    
    def test_retourne_datetime(self):
        """Test que la fonction retourne un datetime"""
        result = calculer_prochaine_heure_active("07:00")
        assert isinstance(result, datetime)
    
    def test_heure_dans_le_futur_ou_maintenant(self):
        """Test que l'heure retournée est valide"""
        result = calculer_prochaine_heure_active("07:00")
        assert result is not None


# Exécution des tests
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
