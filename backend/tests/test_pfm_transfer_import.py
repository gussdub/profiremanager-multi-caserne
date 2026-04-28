"""
Test suite for PFM Transfer Import functionality
Tests the import batch endpoint and related features:
- POST /api/demo/import/batch - Import intervention with complete data
- GET /api/demo/interventions/{id}/rcci - Lazy RCCI creation with normalized data
- GET /api/demo/interventions/detail/{id} - Protection incendie fields
- GET /api/demo/interventions/{id}/remises-propriete - Auto-created remise
- GET /api/demo/interventions/{id}/remise-propriete/{remise_id}/pdf - PDF generation
- POST /api/demo/import/fix-existing-interventions - Re-extraction for existing interventions
"""

import pytest
import requests
import os
import uuid
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://prevention-module-qa.preview.emergentagent.com')
TENANT = "demo"
API_URL = f"{BASE_URL}/api/{TENANT}"

# Test credentials
TEST_EMAIL = "gussdub@gmail.com"
TEST_PASSWORD = "230685Juin+"


class TestPFMTransferImport:
    """Test suite for PFM Transfer Import functionality"""
    
    token = None
    created_intervention_id = None
    created_remise_id = None
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get token"""
        if not TestPFMTransferImport.token:
            response = requests.post(
                f"{API_URL}/auth/login",
                json={"email": TEST_EMAIL, "mot_de_passe": TEST_PASSWORD}
            )
            assert response.status_code == 200, f"Login failed: {response.text}"
            data = response.json()
            TestPFMTransferImport.token = data.get("access_token")
            assert TestPFMTransferImport.token, "No access_token in response"
        yield
    
    def get_headers(self):
        return {"Authorization": f"Bearer {TestPFMTransferImport.token}"}
    
    # ==================== TEST 1: Import Batch - Create Intervention ====================
    def test_01_import_batch_intervention(self):
        """Test POST /api/demo/import/batch - Import intervention with complete PremLigne data"""
        unique_id = f"TEST-IMPORT-{uuid.uuid4().hex[:8].upper()}"
        
        # Complete PremLigne record with all nested data
        payload = {
            "entity_type": "Intervention",
            "source_system": "PremLigne",
            "record": {
                "num_activite": unique_id,
                "id_code_appel": "80 - Bâtiment",
                "id_dossier_adresse": "123 rue Test, Montréal",
                "id_responsable": "Capitaine Test",
                "id_caserne": "Caserne 1",
                "chronologie": {
                    "interv_chronologie": {
                        "appel": "2024-06-15 14:30:00",
                        "transmission": "2024-06-15 14:31:00",
                        "depart_premier_veh": "2024-06-15 14:32:00",
                        "arrivee_prem_vehicule": "2024-06-15 14:40:00",
                        "maitrise": "2024-06-15 15:00:00",
                        "retour": "2024-06-15 16:00:00",
                        "fin_interv": "2024-06-15 17:00:00"
                    }
                },
                "cause_incendie": {
                    "interv_cause_incendie": {
                        "cause_probable": "Accidentelle",
                        "source_chaleur": "Cuisinière",
                        "lieu_origine": "Cuisine",
                        "combustible": "Huile de cuisson",
                        "prem_mat_enflamme": "Graisse"
                    }
                },
                "desc_batiment": {
                    "interv_desc_batiment": {
                        "protection": {
                            "interv_protection": {
                                "id_avert_fonctionne": "11",  # 11 = Oui + Fonctionnel
                                "id_extinction_fonctionne": "88",  # 88 = Non
                                "id_syst_alarme_fonctionne": "11"
                            }
                        },
                        "perte": {
                            "interv_perte": {
                                "perte_batiment": "50000",
                                "perte_contenu": "25000",
                                "id_assurance": "1"  # 1 = Oui
                            }
                        }
                    }
                },
                "remise_prop": {
                    "interv_remise_prop": {
                        "date_libere": "2024-06-15 17:00:00",
                        "remis_a": "Jean Propriétaire"
                    }
                },
                "repondant": {
                    "interv_repondant": {
                        "nom": "Jean Propriétaire",
                        "adresse": {
                            "adresse": {
                                "rue": "123 rue Test",
                                "ville": "Montréal",
                                "telephone": "514-555-1234"
                            }
                        }
                    }
                },
                "intervenant": {
                    "interv_intervenant": {
                        "vect_interv_equipe": {
                            "interv_interv_equipe": [
                                {
                                    "id_vehicule": "Autopompe 101",
                                    "heure_appel": "14:31:00",
                                    "heure_en_route": "14:32:00",
                                    "heure_lieu": "14:40:00",
                                    "heure_retour": "16:00:00",
                                    "nbr_interv_dans_veh": "4"
                                }
                            ]
                        },
                        "info_interv_employe": {
                            "info_employe": [
                                {
                                    "id_employe": "Pompier Test 1",
                                    "id_vehicule": "Autopompe 101",
                                    "presence": "Présent"
                                }
                            ]
                        }
                    }
                },
                "equipement": {
                    "interv_equipement": {
                        "vect_interv_materiel": {
                            "interv_materiel": [
                                {
                                    "id_type_equipement": "Boyau 1.5 pouces",
                                    "quantite": "2"
                                }
                            ]
                        }
                    }
                },
                "enquete": {
                    "interv_enquete": {
                        "dossier_transmis_police": "Non",
                        "date_remis": "",
                        "num_dossier_police": ""
                    }
                }
            }
        }
        
        response = requests.post(
            f"{API_URL}/import/batch",
            json=payload,
            headers=self.get_headers()
        )
        
        print(f"Import batch response: {response.status_code}")
        print(f"Response body: {response.text[:500]}")
        
        assert response.status_code == 200, f"Import failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert data.get("status") in ("created", "pending_review"), f"Unexpected status: {data}"
        assert data.get("entity_type") == "Intervention"
        assert "id" in data
        
        # Store for subsequent tests
        TestPFMTransferImport.created_intervention_id = data["id"]
        print(f"Created intervention ID: {TestPFMTransferImport.created_intervention_id}")
    
    # ==================== TEST 2: Get Intervention Detail - Protection Fields ====================
    def test_02_get_intervention_detail_protection_fields(self):
        """Test GET /api/demo/interventions/detail/{id} - Verify protection incendie fields"""
        if not TestPFMTransferImport.created_intervention_id:
            pytest.skip("No intervention created in previous test")
        
        response = requests.get(
            f"{API_URL}/interventions/detail/{TestPFMTransferImport.created_intervention_id}",
            headers=self.get_headers()
        )
        
        print(f"Detail response: {response.status_code}")
        
        assert response.status_code == 200, f"Get detail failed: {response.text}"
        data = response.json()
        intervention = data.get("intervention", {})
        
        # Verify protection incendie fields are correctly mapped
        print(f"smoke_detector_presence: {intervention.get('smoke_detector_presence')}")
        print(f"smoke_detector_functional: {intervention.get('smoke_detector_functional')}")
        print(f"sprinkler_present: {intervention.get('sprinkler_present')}")
        print(f"alarm_system_presence: {intervention.get('alarm_system_presence')}")
        
        # id_avert_fonctionne=11 should map to presence=yes, functional=worked
        assert intervention.get("smoke_detector_presence") == "yes", \
            f"Expected smoke_detector_presence='yes', got '{intervention.get('smoke_detector_presence')}'"
        assert intervention.get("smoke_detector_functional") == "worked", \
            f"Expected smoke_detector_functional='worked', got '{intervention.get('smoke_detector_functional')}'"
        
        # id_extinction_fonctionne=88 should map to sprinkler_present=False
        assert intervention.get("sprinkler_present") == False, \
            f"Expected sprinkler_present=False, got '{intervention.get('sprinkler_present')}'"
        
        # Verify DSI fields
        print(f"owner_name: {intervention.get('owner_name')}")
        print(f"estimated_loss_building: {intervention.get('estimated_loss_building')}")
        print(f"has_insurance: {intervention.get('has_insurance')}")
        
        assert intervention.get("owner_name") == "Jean Propriétaire", \
            f"Expected owner_name='Jean Propriétaire', got '{intervention.get('owner_name')}'"
        assert intervention.get("estimated_loss_building") == "50000", \
            f"Expected estimated_loss_building='50000', got '{intervention.get('estimated_loss_building')}'"
        
        # Verify vehicles and personnel are populated
        vehicles = data.get("vehicles", [])
        resources = data.get("resources", [])
        print(f"Vehicles count: {len(vehicles)}")
        print(f"Resources count: {len(resources)}")
        
        # Vehicles should be populated from the import
        assert len(vehicles) >= 1 or len(intervention.get("vehicules", [])) >= 1, \
            "Expected at least 1 vehicle"
    
    # ==================== TEST 3: Get RCCI - Lazy Creation with Normalized Data ====================
    def test_03_get_rcci_lazy_creation(self):
        """Test GET /api/demo/interventions/{id}/rcci - Verify lazy RCCI creation with normalized data"""
        if not TestPFMTransferImport.created_intervention_id:
            pytest.skip("No intervention created in previous test")
        
        response = requests.get(
            f"{API_URL}/interventions/{TestPFMTransferImport.created_intervention_id}/rcci",
            headers=self.get_headers()
        )
        
        print(f"RCCI response: {response.status_code}")
        
        assert response.status_code == 200, f"Get RCCI failed: {response.text}"
        data = response.json()
        rcci = data.get("rcci")
        
        # RCCI should be created lazily from intervention data
        assert rcci is not None, "RCCI should be created lazily"
        
        print(f"RCCI probable_cause: {rcci.get('probable_cause')}")
        print(f"RCCI ignition_source: {rcci.get('ignition_source')}")
        print(f"RCCI origin_area: {rcci.get('origin_area')}")
        
        # Verify normalized probable_cause (Accidentelle -> accidentelle)
        assert rcci.get("probable_cause") == "accidentelle", \
            f"Expected probable_cause='accidentelle', got '{rcci.get('probable_cause')}'"
        
        # Verify normalized ignition_source (Cuisinière -> cuisson)
        assert rcci.get("ignition_source") == "cuisson", \
            f"Expected ignition_source='cuisson', got '{rcci.get('ignition_source')}'"
        
        # Verify origin_area is populated
        assert rcci.get("origin_area") == "Cuisine", \
            f"Expected origin_area='Cuisine', got '{rcci.get('origin_area')}'"
    
    # ==================== TEST 4: Get Remises Propriete - Auto Creation ====================
    def test_04_get_remises_propriete_auto_creation(self):
        """Test GET /api/demo/interventions/{id}/remises-propriete - Verify auto-created remise"""
        if not TestPFMTransferImport.created_intervention_id:
            pytest.skip("No intervention created in previous test")
        
        # First, call detail to trigger remise creation
        requests.get(
            f"{API_URL}/interventions/detail/{TestPFMTransferImport.created_intervention_id}",
            headers=self.get_headers()
        )
        
        # Now get remises
        response = requests.get(
            f"{API_URL}/interventions/{TestPFMTransferImport.created_intervention_id}/remises-propriete",
            headers=self.get_headers()
        )
        
        print(f"Remises response: {response.status_code}")
        
        assert response.status_code == 200, f"Get remises failed: {response.text}"
        data = response.json()
        remises = data.get("remises", [])
        
        print(f"Remises count: {len(remises)}")
        
        # Should have at least one remise created from import data
        assert len(remises) >= 1, "Expected at least 1 remise de propriété"
        
        remise = remises[0]
        print(f"Remise remis_a: {remise.get('remis_a')}")
        print(f"Remise date_libere: {remise.get('date_libere')}")
        
        assert remise.get("remis_a") == "Jean Propriétaire", \
            f"Expected remis_a='Jean Propriétaire', got '{remise.get('remis_a')}'"
        
        # Store remise ID for PDF test
        TestPFMTransferImport.created_remise_id = remise.get("id")
    
    # ==================== TEST 5: Get Remise PDF - On-the-fly Generation ====================
    def test_05_get_remise_pdf_generation(self):
        """Test GET /api/demo/interventions/{id}/remise-propriete/{remise_id}/pdf - Verify PDF generation"""
        if not TestPFMTransferImport.created_intervention_id:
            pytest.skip("No intervention created in previous test")
        if not TestPFMTransferImport.created_remise_id:
            pytest.skip("No remise created in previous test")
        
        response = requests.get(
            f"{API_URL}/interventions/{TestPFMTransferImport.created_intervention_id}/remise-propriete/{TestPFMTransferImport.created_remise_id}/pdf",
            headers=self.get_headers()
        )
        
        print(f"PDF response: {response.status_code}")
        print(f"Content-Type: {response.headers.get('Content-Type')}")
        
        # Should return 200 with PDF content (generated on-the-fly)
        assert response.status_code == 200, f"Get PDF failed: {response.status_code} - {response.text[:200]}"
        assert "application/pdf" in response.headers.get("Content-Type", ""), \
            f"Expected PDF content type, got {response.headers.get('Content-Type')}"
        
        # Verify PDF content starts with PDF magic bytes
        assert response.content[:4] == b'%PDF', "Response is not a valid PDF"
        print(f"PDF size: {len(response.content)} bytes")
    
    # ==================== TEST 6: Fix Existing Interventions ====================
    def test_06_fix_existing_interventions(self):
        """Test POST /api/demo/import/fix-existing-interventions - Re-extraction for existing interventions"""
        response = requests.post(
            f"{API_URL}/import/fix-existing-interventions",
            headers=self.get_headers()
        )
        
        print(f"Fix response: {response.status_code}")
        
        assert response.status_code == 200, f"Fix failed: {response.text}"
        data = response.json()
        
        print(f"Fixed count: {data.get('fixed')}")
        assert "fixed" in data, "Response should contain 'fixed' count"
        assert data.get("fixed") >= 0, "Fixed count should be non-negative"
    
    # ==================== TEST 7: Import with Different Cause Values ====================
    def test_07_import_intentionnelle_cause(self):
        """Test import with intentionnelle cause - verify normalization"""
        unique_id = f"TEST-INTENT-{uuid.uuid4().hex[:8].upper()}"
        
        payload = {
            "entity_type": "Intervention",
            "source_system": "PremLigne",
            "record": {
                "num_activite": unique_id,
                "id_code_appel": "80 - Bâtiment",
                "id_dossier_adresse": "456 rue Test, Montréal",
                "chronologie": {
                    "interv_chronologie": {
                        "appel": "2024-06-16 10:00:00"
                    }
                },
                "cause_incendie": {
                    "interv_cause_incendie": {
                        "cause_probable": "Intentionnelle (criminelle)",
                        "source_chaleur": "Allumette"
                    }
                }
            }
        }
        
        response = requests.post(
            f"{API_URL}/import/batch",
            json=payload,
            headers=self.get_headers()
        )
        
        assert response.status_code == 200, f"Import failed: {response.text}"
        data = response.json()
        intervention_id = data.get("id")
        
        # Get RCCI to verify normalization
        rcci_response = requests.get(
            f"{API_URL}/interventions/{intervention_id}/rcci",
            headers=self.get_headers()
        )
        
        assert rcci_response.status_code == 200
        rcci_data = rcci_response.json()
        rcci = rcci_data.get("rcci")
        
        if rcci:
            print(f"Intentionnelle RCCI probable_cause: {rcci.get('probable_cause')}")
            assert rcci.get("probable_cause") == "intentionnelle", \
                f"Expected 'intentionnelle', got '{rcci.get('probable_cause')}'"
    
    # ==================== TEST 8: Import with Naturelle Cause ====================
    def test_08_import_naturelle_cause(self):
        """Test import with naturelle cause (foudre) - verify normalization"""
        unique_id = f"TEST-NATUR-{uuid.uuid4().hex[:8].upper()}"
        
        payload = {
            "entity_type": "Intervention",
            "source_system": "PremLigne",
            "record": {
                "num_activite": unique_id,
                "id_code_appel": "80 - Bâtiment",
                "id_dossier_adresse": "789 rue Test, Montréal",
                "chronologie": {
                    "interv_chronologie": {
                        "appel": "2024-06-17 15:00:00"
                    }
                },
                "cause_incendie": {
                    "interv_cause_incendie": {
                        "cause_probable": "Naturelle (foudre)",
                        "source_chaleur": "Foudre"
                    }
                }
            }
        }
        
        response = requests.post(
            f"{API_URL}/import/batch",
            json=payload,
            headers=self.get_headers()
        )
        
        assert response.status_code == 200, f"Import failed: {response.text}"
        data = response.json()
        intervention_id = data.get("id")
        
        # Get RCCI to verify normalization
        rcci_response = requests.get(
            f"{API_URL}/interventions/{intervention_id}/rcci",
            headers=self.get_headers()
        )
        
        assert rcci_response.status_code == 200
        rcci_data = rcci_response.json()
        rcci = rcci_data.get("rcci")
        
        if rcci:
            print(f"Naturelle RCCI probable_cause: {rcci.get('probable_cause')}")
            print(f"Naturelle RCCI ignition_source: {rcci.get('ignition_source')}")
            assert rcci.get("probable_cause") == "naturelle", \
                f"Expected 'naturelle', got '{rcci.get('probable_cause')}'"
            assert rcci.get("ignition_source") == "foudre", \
                f"Expected 'foudre', got '{rcci.get('ignition_source')}'"
    
    # ==================== TEST 9: Import with Indeterminee Cause ====================
    def test_09_import_indeterminee_cause(self):
        """Test import with indeterminee cause - verify normalization"""
        unique_id = f"TEST-INDET-{uuid.uuid4().hex[:8].upper()}"
        
        payload = {
            "entity_type": "Intervention",
            "source_system": "PremLigne",
            "record": {
                "num_activite": unique_id,
                "id_code_appel": "80 - Bâtiment",
                "id_dossier_adresse": "999 rue Test, Montréal",
                "chronologie": {
                    "interv_chronologie": {
                        "appel": "2024-06-18 12:00:00"
                    }
                },
                "cause_incendie": {
                    "interv_cause_incendie": {
                        "cause_probable": "Indéterminée",
                        "source_chaleur": ""
                    }
                }
            }
        }
        
        response = requests.post(
            f"{API_URL}/import/batch",
            json=payload,
            headers=self.get_headers()
        )
        
        assert response.status_code == 200, f"Import failed: {response.text}"
        data = response.json()
        intervention_id = data.get("id")
        
        # Get RCCI to verify normalization
        rcci_response = requests.get(
            f"{API_URL}/interventions/{intervention_id}/rcci",
            headers=self.get_headers()
        )
        
        assert rcci_response.status_code == 200
        rcci_data = rcci_response.json()
        rcci = rcci_data.get("rcci")
        
        if rcci:
            print(f"Indeterminee RCCI probable_cause: {rcci.get('probable_cause')}")
            assert rcci.get("probable_cause") == "indeterminee", \
                f"Expected 'indeterminee', got '{rcci.get('probable_cause')}'"
    
    # ==================== TEST 10: Verify Code Feu 80 Triggers Fire Tabs ====================
    def test_10_code_feu_80_intervention(self):
        """Test that code_feu=80 is correctly extracted for fire incident detection"""
        if not TestPFMTransferImport.created_intervention_id:
            pytest.skip("No intervention created in previous test")
        
        response = requests.get(
            f"{API_URL}/interventions/detail/{TestPFMTransferImport.created_intervention_id}",
            headers=self.get_headers()
        )
        
        assert response.status_code == 200
        data = response.json()
        intervention = data.get("intervention", {})
        
        print(f"code_feu: {intervention.get('code_feu')}")
        print(f"type_intervention: {intervention.get('type_intervention')}")
        
        # Verify code_feu is extracted (80 from "80 - Bâtiment")
        assert intervention.get("code_feu") == "80", \
            f"Expected code_feu='80', got '{intervention.get('code_feu')}'"
    
    # ==================== TEST 11: Cleanup Test Data ====================
    def test_99_cleanup(self):
        """Cleanup: Delete test interventions"""
        # Get all test interventions
        response = requests.get(
            f"{API_URL}/interventions?limit=100",
            headers=self.get_headers()
        )
        
        if response.status_code == 200:
            data = response.json()
            interventions = data.get("interventions", [])
            
            deleted = 0
            for intv in interventions:
                ext_id = intv.get("external_call_id", "")
                if ext_id and ext_id.startswith("TEST-"):
                    del_response = requests.delete(
                        f"{API_URL}/interventions/{intv['id']}",
                        headers=self.get_headers()
                    )
                    if del_response.status_code in (200, 204):
                        deleted += 1
            
            print(f"Cleaned up {deleted} test interventions")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
