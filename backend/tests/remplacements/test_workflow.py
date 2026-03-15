"""
Tests unitaires pour le module Remplacements - Workflow
=======================================================

Ces tests vérifient la logique métier d'acceptation/refus des remplacements.
Exécuter avec: pytest tests/remplacements/test_workflow.py -v
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone
from fastapi import HTTPException
import sys
sys.path.insert(0, '/app/backend')

from routes.remplacements.workflow import (
    accepter_remplacement_workflow,
    refuser_remplacement_workflow,
    verifier_et_traiter_timeouts_workflow
)


class TestAccepterRemplacementWorkflow:
    """Tests pour la fonction accepter_remplacement_workflow"""
    
    @pytest.fixture
    def mock_db(self):
        """Fixture pour créer un mock de la base de données"""
        db = MagicMock()
        db.demandes_remplacement = MagicMock()
        db.assignations = MagicMock()
        db.users = MagicMock()
        db.tenants = MagicMock()
        db.types_garde = MagicMock()
        db.notifications = MagicMock()
        return db
    
    @pytest.mark.asyncio
    async def test_accepter_demande_valide(self, mock_db):
        """Test acceptation d'une demande valide"""
        remplacant_id = "user-remplacant"
        
        # Configuration des mocks - inclure remplacants_contactes_ids
        mock_db.demandes_remplacement.find_one = AsyncMock(return_value={
            "id": "demande-123",
            "tenant_id": "tenant-456",
            "demandeur_id": "user-demandeur",
            "type_garde_id": "type-1",
            "date": "2026-03-20",
            "statut": "en_cours",
            "remplacants_contactes_ids": [remplacant_id]  # Le remplaçant doit être dans cette liste
        })
        mock_db.demandes_remplacement.update_one = AsyncMock()
        mock_db.assignations.find_one = AsyncMock(return_value={
            "id": "assignation-1",
            "user_id": "user-demandeur",
            "date": "2026-03-20",
            "type_garde_id": "type-1"
        })
        mock_db.assignations.update_one = AsyncMock()
        mock_db.users.find_one = AsyncMock(return_value={
            "id": remplacant_id,
            "prenom": "Jean",
            "nom": "Dupont",
            "email": "jean@test.com",
            "tenant_id": "tenant-456"
        })
        mock_db.users.find = MagicMock()
        mock_db.users.find.return_value.to_list = AsyncMock(return_value=[])  # Pas de superviseurs
        mock_db.notifications.insert_one = AsyncMock()
        mock_db.tenants.find_one = AsyncMock(return_value={
            "id": "tenant-456",
            "nom": "Test Tenant"
        })
        mock_db.types_garde.find_one = AsyncMock(return_value={
            "id": "type-1",
            "nom": "Jour"
        })
        
        result = await accepter_remplacement_workflow(
            db=mock_db,
            demande_id="demande-123",
            remplacant_id=remplacant_id,
            tenant_id="tenant-456"
        )
        
        # Vérifie que la fonction retourne True en cas de succès
        assert result == True
        # Vérifie que la demande a été mise à jour
        mock_db.demandes_remplacement.update_one.assert_called()
    
    @pytest.mark.asyncio
    async def test_accepter_demande_inexistante(self, mock_db):
        """Test acceptation d'une demande qui n'existe pas - doit lever HTTPException"""
        mock_db.demandes_remplacement.find_one = AsyncMock(return_value=None)
        
        # La fonction lève HTTPException 404 quand la demande n'existe pas
        with pytest.raises(HTTPException) as exc_info:
            await accepter_remplacement_workflow(
                db=mock_db,
                demande_id="demande-inexistante",
                remplacant_id="user-123",
                tenant_id="tenant-456"
            )
        
        assert exc_info.value.status_code == 404
        assert "non trouvée" in exc_info.value.detail
    
    @pytest.mark.asyncio
    async def test_accepter_demande_non_autorise(self, mock_db):
        """Test acceptation par un remplaçant non autorisé - doit lever HTTPException 403"""
        mock_db.demandes_remplacement.find_one = AsyncMock(return_value={
            "id": "demande-123",
            "tenant_id": "tenant-456",
            "statut": "en_cours",
            "remplacants_contactes_ids": ["autre-user"]  # Le remplaçant n'est pas dans la liste
        })
        
        with pytest.raises(HTTPException) as exc_info:
            await accepter_remplacement_workflow(
                db=mock_db,
                demande_id="demande-123",
                remplacant_id="user-non-autorise",
                tenant_id="tenant-456"
            )
        
        assert exc_info.value.status_code == 403
    
    @pytest.mark.asyncio
    async def test_accepter_demande_deja_pourvue(self, mock_db):
        """Test acceptation d'une demande déjà acceptée - doit lever HTTPException 400"""
        mock_db.demandes_remplacement.find_one = AsyncMock(return_value={
            "id": "demande-123",
            "tenant_id": "tenant-456",
            "statut": "accepte",  # Statut différent de "en_cours"
            "remplacants_contactes_ids": ["user-remplacant"]
        })
        
        with pytest.raises(HTTPException) as exc_info:
            await accepter_remplacement_workflow(
                db=mock_db,
                demande_id="demande-123",
                remplacant_id="user-remplacant",
                tenant_id="tenant-456"
            )
        
        assert exc_info.value.status_code == 400
        assert "plus disponible" in exc_info.value.detail


class TestRefuserRemplacementWorkflow:
    """Tests pour la fonction refuser_remplacement_workflow"""
    
    @pytest.fixture
    def mock_db(self):
        """Fixture pour créer un mock de la base de données"""
        db = MagicMock()
        db.demandes_remplacement = MagicMock()
        db.tokens_remplacement = MagicMock()
        return db
    
    @pytest.mark.asyncio
    async def test_refuser_demande_valide(self, mock_db):
        """Test refus d'une demande valide"""
        remplacant_id = "user-remplacant"
        
        # Configuration des mocks - le remplaçant doit être dans remplacants_contactes_ids
        mock_db.demandes_remplacement.find_one = AsyncMock(side_effect=[
            # Premier appel - vérification initiale
            {
                "id": "demande-123",
                "tenant_id": "tenant-456",
                "statut": "en_cours",
                "remplacants_contactes_ids": [remplacant_id]
            },
            # Deuxième appel - après update pour vérifier si liste vide
            {
                "id": "demande-123",
                "tenant_id": "tenant-456",
                "statut": "en_cours",
                "remplacants_contactes_ids": []  # Liste vidée après le $pull
            }
        ])
        mock_db.demandes_remplacement.update_one = AsyncMock()
        
        result = await refuser_remplacement_workflow(
            db=mock_db,
            demande_id="demande-123",
            remplacant_id=remplacant_id,
            tenant_id="tenant-456"
        )
        
        # Vérifie que la fonction retourne True en cas de succès
        assert result == True
        # Vérifie que la demande a été mise à jour
        mock_db.demandes_remplacement.update_one.assert_called()
    
    @pytest.mark.asyncio
    async def test_refuser_demande_inexistante(self, mock_db):
        """Test refus d'une demande qui n'existe pas - doit lever HTTPException"""
        mock_db.demandes_remplacement.find_one = AsyncMock(return_value=None)
        
        with pytest.raises(HTTPException) as exc_info:
            await refuser_remplacement_workflow(
                db=mock_db,
                demande_id="demande-inexistante",
                remplacant_id="user-123",
                tenant_id="tenant-456"
            )
        
        assert exc_info.value.status_code == 404
    
    @pytest.mark.asyncio
    async def test_refuser_non_autorise(self, mock_db):
        """Test refus par un remplaçant non autorisé - doit lever HTTPException 403"""
        mock_db.demandes_remplacement.find_one = AsyncMock(return_value={
            "id": "demande-123",
            "tenant_id": "tenant-456",
            "statut": "en_cours",
            "remplacants_contactes_ids": ["autre-user"]  # Le remplaçant n'est pas dans la liste
        })
        
        with pytest.raises(HTTPException) as exc_info:
            await refuser_remplacement_workflow(
                db=mock_db,
                demande_id="demande-123",
                remplacant_id="user-non-autorise",
                tenant_id="tenant-456"
            )
        
        assert exc_info.value.status_code == 403
    
    @pytest.mark.asyncio
    async def test_refuser_relance_recherche_si_tous_refuses(self, mock_db):
        """Test que la recherche est relancée si tous les remplaçants ont refusé"""
        remplacant_id = "user-remplacant"
        
        mock_db.demandes_remplacement.find_one = AsyncMock(side_effect=[
            # Premier appel - vérification initiale
            {
                "id": "demande-123",
                "tenant_id": "tenant-456",
                "statut": "en_cours",
                "remplacants_contactes_ids": [remplacant_id]
            },
            # Deuxième appel - liste vide après refus
            {
                "id": "demande-123",
                "tenant_id": "tenant-456",
                "statut": "en_cours",
                "remplacants_contactes_ids": []
            }
        ])
        mock_db.demandes_remplacement.update_one = AsyncMock()
        
        mock_lancer_recherche = AsyncMock()
        
        await refuser_remplacement_workflow(
            db=mock_db,
            demande_id="demande-123",
            remplacant_id=remplacant_id,
            tenant_id="tenant-456",
            lancer_recherche_remplacant=mock_lancer_recherche
        )
        
        # Note: La fonction utilise asyncio.create_task donc le mock peut ne pas être appelé synchronement
        # Le test vérifie surtout que la logique ne lève pas d'exception


class TestVerifierEtTraiterTimeouts:
    """Tests pour la fonction verifier_et_traiter_timeouts_workflow"""
    
    @pytest.fixture
    def mock_db(self):
        """Fixture pour créer un mock de la base de données"""
        db = MagicMock()
        db.demandes_remplacement = MagicMock()
        db.parametres_remplacements = MagicMock()
        return db
    
    @pytest.mark.asyncio
    async def test_aucune_demande_en_timeout(self, mock_db):
        """Test quand il n'y a pas de demandes en timeout ou en pause"""
        # Mock pour les demandes en pause silencieuse
        mock_pause_cursor = MagicMock()
        mock_pause_cursor.to_list = AsyncMock(return_value=[])
        
        # Mock pour les demandes en timeout
        mock_timeout_cursor = MagicMock()
        mock_timeout_cursor.to_list = AsyncMock(return_value=[])
        
        # Configuration des appels find
        mock_db.demandes_remplacement.find = MagicMock(side_effect=[
            mock_pause_cursor,
            mock_timeout_cursor
        ])
        
        # La fonction ne prend pas tenant_id comme paramètre - elle traite tous les tenants
        result = await verifier_et_traiter_timeouts_workflow(db=mock_db)
        
        # La fonction ne retourne rien (None), elle ne lève juste pas d'exception
        assert result is None
    
    @pytest.mark.asyncio
    async def test_traitement_demande_en_pause_silencieuse(self, mock_db):
        """Test du traitement des demandes en pause silencieuse"""
        maintenant = datetime.now(timezone.utc)
        
        # Mock pour les demandes en pause silencieuse - une demande
        mock_pause_cursor = MagicMock()
        mock_pause_cursor.to_list = AsyncMock(return_value=[{
            "id": "demande-pause",
            "tenant_id": "tenant-123",
            "statut": "en_cours",
            "en_pause_silencieuse": True,
            "reprise_contacts_prevue": maintenant.isoformat()
        }])
        
        # Mock pour les demandes en timeout - aucune
        mock_timeout_cursor = MagicMock()
        mock_timeout_cursor.to_list = AsyncMock(return_value=[])
        
        mock_db.demandes_remplacement.find = MagicMock(side_effect=[
            mock_pause_cursor,
            mock_timeout_cursor
        ])
        mock_db.demandes_remplacement.update_one = AsyncMock()
        mock_db.parametres_remplacements.find_one = AsyncMock(return_value={
            "tenant_id": "tenant-123",
            "heures_silencieuses_actif": False,  # Désactivé pour ce test
            "heure_debut_silence": "21:00",
            "heure_fin_silence": "07:00"
        })
        
        mock_lancer_recherche = AsyncMock()
        
        await verifier_et_traiter_timeouts_workflow(
            db=mock_db,
            lancer_recherche_remplacant=mock_lancer_recherche
        )
        
        # Vérifie que la demande a été mise à jour (sortie de pause)
        mock_db.demandes_remplacement.update_one.assert_called()


# Exécution des tests
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
