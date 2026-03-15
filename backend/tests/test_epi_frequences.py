"""
Tests unitaires pour la fonction frequence_to_jours (EPI)
=========================================================

Ce test vérifie la conversion des fréquences en jours pour les inspections EPI.
Exécuter avec: pytest tests/test_epi_frequences.py -v
"""

import pytest
import sys
sys.path.insert(0, '/app/backend')

from routes.epi import frequence_to_jours


class TestFrequenceToJours:
    """Tests pour la fonction frequence_to_jours"""
    
    def test_frequence_quotidienne(self):
        """Test fréquence quotidienne = 1 jour"""
        assert frequence_to_jours("quotidienne") == 1
    
    def test_frequence_hebdomadaire(self):
        """Test fréquence hebdomadaire = 7 jours"""
        assert frequence_to_jours("hebdomadaire") == 7
    
    def test_frequence_mensuelle(self):
        """Test fréquence mensuelle = 30 jours"""
        assert frequence_to_jours("mensuelle") == 30
    
    def test_frequence_trimestrielle(self):
        """Test fréquence trimestrielle = 90 jours"""
        assert frequence_to_jours("trimestrielle") == 90
    
    def test_frequence_semestrielle(self):
        """Test fréquence semestrielle = 180 jours"""
        assert frequence_to_jours("semestrielle") == 180
    
    def test_frequence_annuelle(self):
        """Test fréquence annuelle = 365 jours"""
        assert frequence_to_jours("annuelle") == 365
    
    def test_frequence_5_ans(self):
        """Test fréquence 5 ans = 1825 jours"""
        assert frequence_to_jours("5_ans") == 1825
    
    def test_frequence_apres_usage(self):
        """Test fréquence après usage = 0 (pas de délai automatique)"""
        assert frequence_to_jours("apres_usage") == 0
    
    def test_frequence_sur_demande(self):
        """Test fréquence sur demande = 0"""
        assert frequence_to_jours("sur_demande") == 0
    
    def test_frequence_inconnue(self):
        """Test fréquence inconnue retourne la valeur par défaut (annuelle)"""
        assert frequence_to_jours("frequence_inexistante") == 365
    
    def test_frequence_vide(self):
        """Test fréquence vide retourne la valeur par défaut"""
        assert frequence_to_jours("") == 365
    
    def test_toutes_frequences_valides(self):
        """Test que toutes les fréquences valides retournent une valeur positive ou zéro"""
        frequences_valides = [
            "quotidienne", "hebdomadaire", "mensuelle", 
            "trimestrielle", "semestrielle", "annuelle", 
            "5_ans", "apres_usage", "sur_demande"
        ]
        
        for freq in frequences_valides:
            jours = frequence_to_jours(freq)
            assert isinstance(jours, int)
            assert jours >= 0


# Exécution des tests
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
