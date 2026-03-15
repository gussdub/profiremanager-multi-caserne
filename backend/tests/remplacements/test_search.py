"""
Tests unitaires pour le module Remplacements - Search
=====================================================

Ces tests vérifient la logique de recherche de remplaçants.
Exécuter avec: pytest tests/remplacements/test_search.py -v
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime
import sys
sys.path.insert(0, '/app/backend')

from routes.remplacements.search import trouver_remplacants_potentiels


class TestTrouverRemplacantsPotentiels:
    """Tests pour la fonction trouver_remplacants_potentiels"""
    
    @pytest.fixture
    def mock_db(self):
        """Fixture pour créer un mock de la base de données"""
        db = MagicMock()
        
        # Mock des collections
        db.users = MagicMock()
        db.demandes_conge = MagicMock()
        db.assignations = MagicMock()
        db.demandes_remplacement = MagicMock()
        db.types_garde = MagicMock()
        
        return db
    
    @pytest.fixture
    def users_actifs(self):
        """Liste d'utilisateurs actifs pour les tests"""
        return [
            {
                "id": "user-1",
                "prenom": "Jean",
                "nom": "Dupont",
                "email": "jean@test.com",
                "telephone": "4185551234",
                "actif": True,
                "role": "pompier",
                "competences": ["premiers_secours", "conduite"],
                "grade": "pompier"
            },
            {
                "id": "user-2",
                "prenom": "Marie",
                "nom": "Martin",
                "email": "marie@test.com",
                "telephone": "4185555678",
                "actif": True,
                "role": "pompier",
                "competences": ["premiers_secours"],
                "grade": "lieutenant"
            },
            {
                "id": "user-3",
                "prenom": "Pierre",
                "nom": "Bernard",
                "email": "pierre@test.com",
                "telephone": "4185559999",
                "actif": True,
                "role": "pompier",
                "competences": [],
                "grade": "pompier"
            }
        ]
    
    @pytest.mark.asyncio
    async def test_exclut_demandeur(self, mock_db, users_actifs):
        """Vérifie que le demandeur est exclu des résultats"""
        demandeur_id = "user-1"
        
        # Configuration des mocks
        mock_db.users.find.return_value.to_list = AsyncMock(return_value=users_actifs)
        mock_db.demandes_conge.find.return_value.to_list = AsyncMock(return_value=[])
        mock_db.assignations.find.return_value.to_list = AsyncMock(return_value=[])
        mock_db.demandes_remplacement.find_one = AsyncMock(return_value=None)
        mock_db.types_garde.find_one = AsyncMock(return_value={
            "id": "type-1",
            "nom": "Jour",
            "heure_debut": "08:00",
            "heure_fin": "16:00",
            "competences_requises": []
        })
        
        result = await trouver_remplacants_potentiels(
            db=mock_db,
            tenant_id="tenant-123",
            demandeur_id=demandeur_id,
            type_garde_id="type-1",
            date_garde="2026-03-20",
            exclus_ids=[]
        )
        
        # Vérifie que le demandeur n'est pas dans les résultats
        remplacant_ids = [r["user_id"] for r in result]
        assert demandeur_id not in remplacant_ids
    
    @pytest.mark.asyncio
    async def test_exclut_personnes_en_conge(self, mock_db, users_actifs):
        """Vérifie que les personnes en congé sont exclues"""
        # Configuration des mocks
        mock_db.users.find.return_value.to_list = AsyncMock(return_value=users_actifs)
        mock_db.demandes_conge.find.return_value.to_list = AsyncMock(return_value=[
            {"demandeur_id": "user-2", "statut": "approuve"}  # Marie en congé
        ])
        mock_db.assignations.find.return_value.to_list = AsyncMock(return_value=[])
        mock_db.demandes_remplacement.find_one = AsyncMock(return_value=None)
        mock_db.types_garde.find_one = AsyncMock(return_value={
            "id": "type-1",
            "nom": "Jour",
            "heure_debut": "08:00",
            "heure_fin": "16:00",
            "competences_requises": []
        })
        
        result = await trouver_remplacants_potentiels(
            db=mock_db,
            tenant_id="tenant-123",
            demandeur_id="user-999",  # Quelqu'un d'autre
            type_garde_id="type-1",
            date_garde="2026-03-20",
            exclus_ids=[]
        )
        
        # Vérifie que Marie (en congé) n'est pas dans les résultats
        remplacant_ids = [r["user_id"] for r in result]
        assert "user-2" not in remplacant_ids
    
    @pytest.mark.asyncio
    async def test_exclut_personnes_deja_contactees(self, mock_db, users_actifs):
        """Vérifie que les personnes déjà contactées sont exclues"""
        # Configuration des mocks
        mock_db.users.find.return_value.to_list = AsyncMock(return_value=users_actifs)
        mock_db.demandes_conge.find.return_value.to_list = AsyncMock(return_value=[])
        mock_db.assignations.find.return_value.to_list = AsyncMock(return_value=[])
        mock_db.demandes_remplacement.find_one = AsyncMock(return_value=None)
        mock_db.types_garde.find_one = AsyncMock(return_value={
            "id": "type-1",
            "nom": "Jour",
            "heure_debut": "08:00",
            "heure_fin": "16:00",
            "competences_requises": []
        })
        
        exclus = ["user-1", "user-3"]  # Jean et Pierre déjà contactés
        
        result = await trouver_remplacants_potentiels(
            db=mock_db,
            tenant_id="tenant-123",
            demandeur_id="user-999",
            type_garde_id="type-1",
            date_garde="2026-03-20",
            exclus_ids=exclus
        )
        
        # Vérifie que les exclus ne sont pas dans les résultats
        remplacant_ids = [r["user_id"] for r in result]
        for exclu in exclus:
            assert exclu not in remplacant_ids
    
    @pytest.mark.asyncio
    async def test_retourne_liste_vide_si_aucun_eligible(self, mock_db):
        """Vérifie qu'une liste vide est retournée si personne n'est éligible"""
        # Configuration des mocks - aucun utilisateur
        mock_db.users.find.return_value.to_list = AsyncMock(return_value=[])
        mock_db.demandes_conge.find.return_value.to_list = AsyncMock(return_value=[])
        mock_db.assignations.find.return_value.to_list = AsyncMock(return_value=[])
        mock_db.demandes_remplacement.find_one = AsyncMock(return_value=None)
        mock_db.types_garde.find_one = AsyncMock(return_value={
            "id": "type-1",
            "nom": "Jour",
            "heure_debut": "08:00",
            "heure_fin": "16:00",
            "competences_requises": []
        })
        
        result = await trouver_remplacants_potentiels(
            db=mock_db,
            tenant_id="tenant-123",
            demandeur_id="user-999",
            type_garde_id="type-1",
            date_garde="2026-03-20",
            exclus_ids=[]
        )
        
        assert result == []


# Exécution des tests
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
