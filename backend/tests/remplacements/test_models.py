"""
Tests unitaires pour le module Remplacements - Models
=====================================================

Ces tests vérifient les modèles Pydantic du module remplacements.
Exécuter avec: pytest tests/remplacements/test_models.py -v
"""

import pytest
from datetime import datetime, timezone
from pydantic import ValidationError
import sys
sys.path.insert(0, '/app/backend')

from routes.remplacements.models import (
    DemandeRemplacement,
    DemandeRemplacementCreate,
    ParametresRemplacements,
    TentativeRemplacement,
    NotificationRemplacement
)


class TestDemandeRemplacementCreate:
    """Tests pour le modèle DemandeRemplacementCreate"""
    
    def test_creation_valide(self):
        """Test création avec données valides"""
        demande = DemandeRemplacementCreate(
            type_garde_id="type-123",
            date="2026-03-20",
            raison="Maladie"
        )
        assert demande.type_garde_id == "type-123"
        assert demande.date == "2026-03-20"
        assert demande.raison == "Maladie"
    
    def test_champs_requis(self):
        """Test que tous les champs requis sont validés"""
        with pytest.raises(ValidationError):
            DemandeRemplacementCreate(type_garde_id="type-123")  # manque date et raison


class TestDemandeRemplacement:
    """Tests pour le modèle DemandeRemplacement complet"""
    
    def test_creation_complete(self):
        """Test création avec toutes les données"""
        demande = DemandeRemplacement(
            tenant_id="tenant-456",
            demandeur_id="user-789",
            type_garde_id="type-abc",
            date="2026-03-20",
            raison="Congé médical",
            statut="en_cours",
            priorite="haute"
        )
        assert demande.tenant_id == "tenant-456"
        assert demande.statut == "en_cours"
        assert demande.priorite == "haute"
    
    def test_id_genere_automatiquement(self):
        """Test que l'ID est généré automatiquement"""
        demande = DemandeRemplacement(
            tenant_id="tenant-456",
            demandeur_id="user-789",
            type_garde_id="type-abc",
            date="2026-03-20",
            raison="Test"
        )
        assert demande.id is not None
        assert len(demande.id) == 36  # UUID format
    
    def test_statut_defaut(self):
        """Test que le statut par défaut est 'en_attente'"""
        demande = DemandeRemplacement(
            tenant_id="tenant-456",
            demandeur_id="user-789",
            type_garde_id="type-abc",
            date="2026-03-20",
            raison="Test"
        )
        assert demande.statut == "en_attente"
    
    def test_priorite_defaut(self):
        """Test que la priorité par défaut est 'normal'"""
        demande = DemandeRemplacement(
            tenant_id="tenant-456",
            demandeur_id="user-789",
            type_garde_id="type-abc",
            date="2026-03-20",
            raison="Test"
        )
        assert demande.priorite == "normal"
    
    def test_listes_vides_par_defaut(self):
        """Test que les listes sont vides par défaut"""
        demande = DemandeRemplacement(
            tenant_id="tenant-456",
            demandeur_id="user-789",
            type_garde_id="type-abc",
            date="2026-03-20",
            raison="Test"
        )
        assert demande.remplacants_contactes_ids == []
        assert demande.tentatives_historique == []


class TestParametresRemplacements:
    """Tests pour le modèle ParametresRemplacements"""
    
    def test_valeurs_par_defaut(self):
        """Test les valeurs par défaut des paramètres"""
        params = ParametresRemplacements(tenant_id="tenant-123")
        
        assert params.tenant_id == "tenant-123"
        assert params.mode_notification == "simultane"
        assert params.max_contacts == 5
        assert params.heure_debut_silence == "21:00"
        assert params.heure_fin_silence == "07:00"
    
    def test_delais_par_priorite(self):
        """Test les délais d'attente par niveau de priorité"""
        params = ParametresRemplacements(tenant_id="tenant-123")
        
        assert params.delai_attente_urgente == 5
        assert params.delai_attente_haute == 15
        assert params.delai_attente_normale == 60
        assert params.delai_attente_faible == 120
    
    def test_valeurs_personnalisees(self):
        """Test avec des valeurs personnalisées"""
        params = ParametresRemplacements(
            tenant_id="tenant-123",
            max_contacts=10,
            heure_debut_silence="23:00",
            heure_fin_silence="06:00"
        )
        
        assert params.max_contacts == 10
        assert params.heure_debut_silence == "23:00"
        assert params.heure_fin_silence == "06:00"
    
    def test_archivage_par_defaut(self):
        """Test les paramètres d'archivage par défaut"""
        params = ParametresRemplacements(tenant_id="tenant-123")
        
        assert params.archivage_auto_actif == True
        assert params.delai_archivage_jours == 365


class TestTentativeRemplacement:
    """Tests pour le modèle TentativeRemplacement"""
    
    def test_creation_tentative(self):
        """Test création d'une tentative avec tous les champs requis"""
        tentative = TentativeRemplacement(
            user_id="user-123",
            nom_complet="Jean Dupont",
            date_contact=datetime.now(timezone.utc),
            statut="contacted"
        )
        
        assert tentative.user_id == "user-123"
        assert tentative.nom_complet == "Jean Dupont"
        assert tentative.statut == "contacted"
        assert tentative.date_reponse is None
    
    def test_tentative_avec_reponse(self):
        """Test tentative avec une réponse"""
        now = datetime.now(timezone.utc)
        tentative = TentativeRemplacement(
            user_id="user-123",
            nom_complet="Marie Martin",
            date_contact=now,
            statut="accepted",
            date_reponse=now
        )
        
        assert tentative.statut == "accepted"
        assert tentative.date_reponse is not None


class TestNotificationRemplacement:
    """Tests pour le modèle NotificationRemplacement"""
    
    def test_creation_notification(self):
        """Test création d'une notification"""
        notif = NotificationRemplacement(
            tenant_id="tenant-123",
            demande_remplacement_id="demande-456",
            destinataire_id="user-789",
            message="Demande de remplacement disponible"
        )
        
        assert notif.tenant_id == "tenant-123"
        assert notif.type_notification == "remplacement_disponible"
        assert notif.statut == "envoye"
    
    def test_id_genere_automatiquement(self):
        """Test que l'ID est généré automatiquement"""
        notif = NotificationRemplacement(
            tenant_id="tenant-123",
            demande_remplacement_id="demande-456",
            destinataire_id="user-789",
            message="Test"
        )
        
        assert notif.id is not None
        assert len(notif.id) == 36  # UUID format


# Exécution des tests
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
