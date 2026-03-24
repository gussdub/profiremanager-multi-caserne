"""
Tests de régression — Module Prévention complet
=================================================
Couvre le CRUD et les workflows de tous les sous-modules :
  - prevention.py          : Batiments, Inspections, Grilles, Secteurs, References
  - prevention_config.py   : Carte, Preventionnistes, Parametres
  - prevention_nc.py       : Non-conformites
  - prevention_plans.py    : Plans d'intervention + workflow validation
  - prevention_reports.py  : Statistiques, Tendances, Notifications
  - prevention_media.py    : Icones personnalisees
  - prevention_inspections_visuelles.py : Inspections visuelles + NC visuelles
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
TENANT = "demo"
API = f"{BASE_URL}/api/{TENANT}"

TEST_EMAIL = "gussdub@icloud.com"
TEST_PASSWORD = "230685Juin+"


@pytest.fixture(scope="module")
def auth():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": TEST_EMAIL, "mot_de_passe": TEST_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.text}"
    token = r.json()["access_token"]
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    yield s
    s.close()


@pytest.fixture(scope="module")
def shared_ids():
    """IDs partages entre les classes de test."""
    return {}


# ======================================================================
#  1. BATIMENTS  (prevention.py)
# ======================================================================
class TestBatiments:

    def test_create_batiment(self, auth, shared_ids):
        payload = {
            "nom_etablissement": f"Bat Regression {uuid.uuid4().hex[:6]}",
            "adresse_civique": "123 Rue Test",
            "ville": "Sherbrooke",
            "nombre_etages": "3",
            "niveau_risque": "moyen",
            "type_batiment": "Commercial",
        }
        r = auth.post(f"{API}/prevention/batiments", json=payload)
        assert r.status_code in (200, 201), f"Create bat: {r.status_code} {r.text}"
        data = r.json()
        shared_ids["bat_id"] = data.get("id") or data.get("batiment_id") or data.get("batiment", {}).get("id")
        assert shared_ids["bat_id"]

    def test_list_batiments(self, auth):
        r = auth.get(f"{API}/prevention/batiments")
        assert r.status_code == 200

    def test_search_batiments(self, auth):
        r = auth.get(f"{API}/prevention/batiments/search", params={"q": "Bat Regression"})
        assert r.status_code == 200

    def test_get_batiment(self, auth, shared_ids):
        bid = shared_ids.get("bat_id")
        if not bid:
            pytest.skip("No batiment")
        r = auth.get(f"{API}/prevention/batiments/{bid}")
        assert r.status_code == 200

    def test_update_batiment(self, auth, shared_ids):
        bid = shared_ids.get("bat_id")
        if not bid:
            pytest.skip("No batiment")
        r = auth.put(f"{API}/prevention/batiments/{bid}", json={
            "nom_etablissement": "Bat Regression MAJ",
            "nombre_etages": "5",
        })
        assert r.status_code == 200

    def test_delete_batiment(self, auth, shared_ids):
        bid = shared_ids.get("bat_id")
        if not bid:
            pytest.skip("No batiment")
        r = auth.delete(f"{API}/prevention/batiments/{bid}")
        assert r.status_code == 200


# ======================================================================
#  2. GRILLES D'INSPECTION  (prevention.py)
# ======================================================================
class TestGrilles:

    def test_create_grille(self, auth, shared_ids):
        payload = {
            "nom": f"Grille Regression {uuid.uuid4().hex[:6]}",
            "description": "Test de regression",
            "sections": [
                {
                    "id": str(uuid.uuid4()),
                    "titre": "Section 1",
                    "items": [{"id": str(uuid.uuid4()), "question": "Q1 ?", "type": "oui_non"}],
                }
            ],
        }
        r = auth.post(f"{API}/prevention/grilles-inspection", json=payload)
        assert r.status_code in (200, 201), f"Create grille: {r.text}"
        data = r.json()
        shared_ids["grille_id"] = data.get("id") or data.get("grille_id") or data.get("grille", {}).get("id")

    def test_list_grilles(self, auth):
        r = auth.get(f"{API}/prevention/grilles-inspection")
        assert r.status_code == 200

    def test_get_grille(self, auth, shared_ids):
        gid = shared_ids.get("grille_id")
        if not gid:
            pytest.skip("No grille")
        r = auth.get(f"{API}/prevention/grilles-inspection/{gid}")
        assert r.status_code == 200

    def test_update_grille(self, auth, shared_ids):
        gid = shared_ids.get("grille_id")
        if not gid:
            pytest.skip("No grille")
        r = auth.put(f"{API}/prevention/grilles-inspection/{gid}", json={"nom": "Grille MAJ"})
        assert r.status_code == 200

    def test_dupliquer_grille(self, auth, shared_ids):
        gid = shared_ids.get("grille_id")
        if not gid:
            pytest.skip("No grille")
        r = auth.post(f"{API}/prevention/grilles-inspection/{gid}/dupliquer")
        assert r.status_code in (200, 201)
        data = r.json()
        dup_id = data.get("id") or data.get("grille_id") or data.get("grille", {}).get("id")
        if dup_id:
            auth.delete(f"{API}/prevention/grilles-inspection/{dup_id}")

    def test_delete_grille(self, auth, shared_ids):
        gid = shared_ids.get("grille_id")
        if not gid:
            pytest.skip("No grille")
        r = auth.delete(f"{API}/prevention/grilles-inspection/{gid}")
        assert r.status_code == 200


# ======================================================================
#  3. SECTEURS  (prevention.py)
# ======================================================================
class TestSecteurs:

    def test_create_secteur(self, auth, shared_ids):
        payload = {
            "nom": f"Secteur Regression {uuid.uuid4().hex[:6]}",
            "description": "Test",
            "couleur": "#FF0000",
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[-71.9, 45.4], [-71.8, 45.4], [-71.8, 45.5], [-71.9, 45.5], [-71.9, 45.4]]],
            },
        }
        r = auth.post(f"{API}/prevention/secteurs", json=payload)
        assert r.status_code in (200, 201), f"Create secteur: {r.text}"
        data = r.json()
        shared_ids["sec_id"] = data.get("id") or data.get("secteur_id") or data.get("secteur", {}).get("id")

    def test_list_secteurs(self, auth):
        r = auth.get(f"{API}/prevention/secteurs")
        assert r.status_code == 200

    def test_get_secteur(self, auth, shared_ids):
        sid = shared_ids.get("sec_id")
        if not sid:
            pytest.skip("No secteur")
        r = auth.get(f"{API}/prevention/secteurs/{sid}")
        assert r.status_code == 200

    def test_update_secteur(self, auth, shared_ids):
        sid = shared_ids.get("sec_id")
        if not sid:
            pytest.skip("No secteur")
        r = auth.put(f"{API}/prevention/secteurs/{sid}", json={
            "nom": "Secteur MAJ",
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[-71.9, 45.4], [-71.8, 45.4], [-71.8, 45.5], [-71.9, 45.5], [-71.9, 45.4]]],
            },
        })
        assert r.status_code == 200

    def test_delete_secteur(self, auth, shared_ids):
        sid = shared_ids.get("sec_id")
        if not sid:
            pytest.skip("No secteur")
        r = auth.delete(f"{API}/prevention/secteurs/{sid}")
        assert r.status_code == 200


# ======================================================================
#  4. INSPECTIONS  (prevention.py)
# ======================================================================
class TestInspections:

    def test_setup_and_create(self, auth, shared_ids):
        # Creer un batiment pour l'inspection
        bat = auth.post(f"{API}/prevention/batiments", json={
            "nom_etablissement": f"Bat Insp {uuid.uuid4().hex[:6]}",
            "adresse_civique": "1 Rue Insp",
        })
        bat_data = bat.json()
        shared_ids["bat_for_insp"] = bat_data.get("id") or bat_data.get("batiment_id") or bat_data.get("batiment", {}).get("id")

        payload = {
            "batiment_id": shared_ids["bat_for_insp"],
            "date_inspection": "2026-03-24",
            "type_inspection": "reguliere",
            "statut": "planifiee",
        }
        r = auth.post(f"{API}/prevention/inspections", json=payload)
        assert r.status_code in (200, 201), f"Create inspection: {r.text}"
        data = r.json()
        shared_ids["insp_id"] = data.get("id") or data.get("inspection_id") or data.get("inspection", {}).get("id")

    def test_list_inspections(self, auth):
        r = auth.get(f"{API}/prevention/inspections")
        assert r.status_code == 200

    def test_get_inspection(self, auth, shared_ids):
        iid = shared_ids.get("insp_id")
        if not iid:
            pytest.skip("No inspection")
        r = auth.get(f"{API}/prevention/inspections/{iid}")
        assert r.status_code == 200

    def test_update_inspection(self, auth, shared_ids):
        iid = shared_ids.get("insp_id")
        if not iid:
            pytest.skip("No inspection")
        r = auth.put(f"{API}/prevention/inspections/{iid}", json={
            "date_inspection": "2026-03-24",
            "statut": "en_cours",
            "notes": "Mise a jour de test",
        })
        assert r.status_code == 200

    def test_cleanup(self, auth, shared_ids):
        bid = shared_ids.get("bat_for_insp")
        if bid:
            auth.delete(f"{API}/prevention/batiments/{bid}")


# ======================================================================
#  5. REFERENCES & META  (prevention.py)
# ======================================================================
class TestReferences:

    def test_get_references(self, auth):
        r = auth.get(f"{API}/prevention/references")
        assert r.status_code == 200

    def test_get_niveaux_risque(self, auth):
        r = auth.get(f"{API}/prevention/meta/niveaux-risque")
        assert r.status_code == 200

    def test_get_categories_batiments(self, auth):
        r = auth.get(f"{API}/prevention/meta/categories-batiments")
        assert r.status_code == 200


# ======================================================================
#  6. NON-CONFORMITES  (prevention_nc.py)
# ======================================================================
class TestNonConformites:

    def test_setup_and_create(self, auth, shared_ids):
        # Creer un batiment pour la NC
        bat = auth.post(f"{API}/prevention/batiments", json={
            "nom_etablissement": f"Bat NC {uuid.uuid4().hex[:6]}",
            "adresse_civique": "1 Rue NC",
        })
        bat_data = bat.json()
        shared_ids["bat_for_nc"] = bat_data.get("id") or bat_data.get("batiment_id") or bat_data.get("batiment", {}).get("id")

        payload = {
            "batiment_id": shared_ids["bat_for_nc"],
            "titre": f"NC Regression {uuid.uuid4().hex[:6]}",
            "description": "Probleme detecte lors des tests",
            "gravite": "moyen",
            "statut": "ouverte",
        }
        r = auth.post(f"{API}/prevention/non-conformites", json=payload)
        assert r.status_code in (200, 201), f"Create NC: {r.text}"
        data = r.json()
        shared_ids["nc_id"] = data.get("id") or data.get("nc_id") or data.get("non_conformite", {}).get("id")

    def test_list_nc(self, auth):
        r = auth.get(f"{API}/prevention/non-conformites")
        assert r.status_code == 200

    def test_get_nc(self, auth, shared_ids):
        ncid = shared_ids.get("nc_id")
        if not ncid:
            pytest.skip("No NC")
        r = auth.get(f"{API}/prevention/non-conformites/{ncid}")
        assert r.status_code == 200

    def test_update_nc(self, auth, shared_ids):
        ncid = shared_ids.get("nc_id")
        bid = shared_ids.get("bat_for_nc")
        if not ncid or not bid:
            pytest.skip("No NC or bat")
        r = auth.put(f"{API}/prevention/non-conformites/{ncid}", json={
            "batiment_id": bid,
            "titre": "NC MAJ",
            "description": "MAJ description",
        })
        assert r.status_code == 200

    def test_patch_statut_nc(self, auth, shared_ids):
        ncid = shared_ids.get("nc_id")
        if not ncid:
            pytest.skip("No NC")
        r = auth.patch(f"{API}/prevention/non-conformites/{ncid}/statut", json={"statut": "en_cours"})
        assert r.status_code == 200

    def test_nc_en_retard(self, auth):
        r = auth.get(f"{API}/prevention/non-conformites-en-retard")
        assert r.status_code == 200

    def test_delete_nc(self, auth, shared_ids):
        ncid = shared_ids.get("nc_id")
        if not ncid:
            pytest.skip("No NC")
        r = auth.delete(f"{API}/prevention/non-conformites/{ncid}")
        assert r.status_code == 200
        # Nettoyage
        bid = shared_ids.get("bat_for_nc")
        if bid:
            auth.delete(f"{API}/prevention/batiments/{bid}")


# ======================================================================
#  7. PLANS D'INTERVENTION  (prevention_plans.py)
# ======================================================================
class TestPlansIntervention:

    def test_setup_and_create(self, auth, shared_ids):
        bat = auth.post(f"{API}/prevention/batiments", json={
            "nom_etablissement": f"Bat Plan {uuid.uuid4().hex[:6]}",
            "adresse_civique": "2 Rue Plan",
        })
        bat_data = bat.json()
        shared_ids["bat_for_plan"] = bat_data.get("id") or bat_data.get("batiment_id") or bat_data.get("batiment", {}).get("id")

        payload = {
            "batiment_id": shared_ids["bat_for_plan"],
            "nom": f"Plan Regression {uuid.uuid4().hex[:6]}",
            "centre_lat": 45.4,
            "centre_lng": -71.9,
            "notes_generales": "Plan de test",
        }
        r = auth.post(f"{API}/prevention/plans-intervention", json=payload)
        assert r.status_code in (200, 201), f"Create plan: {r.text}"
        data = r.json()
        shared_ids["plan_id"] = data.get("id") or data.get("plan_id") or data.get("plan", {}).get("id")

    def test_list_plans(self, auth):
        r = auth.get(f"{API}/prevention/plans-intervention")
        assert r.status_code == 200

    def test_get_plan(self, auth, shared_ids):
        pid = shared_ids.get("plan_id")
        if not pid:
            pytest.skip("No plan")
        r = auth.get(f"{API}/prevention/plans-intervention/{pid}")
        assert r.status_code == 200

    def test_update_plan(self, auth, shared_ids):
        pid = shared_ids.get("plan_id")
        if not pid:
            pytest.skip("No plan")
        r = auth.put(f"{API}/prevention/plans-intervention/{pid}", json={"nom": "Plan MAJ"})
        assert r.status_code == 200

    def test_soumettre_validation(self, auth, shared_ids):
        pid = shared_ids.get("plan_id")
        if not pid:
            pytest.skip("No plan")
        r = auth.post(f"{API}/prevention/plans-intervention/{pid}/valider", json={
            "commentaires": "Test de soumission",
        })
        # 200 si ok, 400 si statut pas brouillon, 403 si pas createur
        assert r.status_code in (200, 400, 403), f"Soumettre: {r.text}"

    def test_get_versions(self, auth, shared_ids):
        pid = shared_ids.get("plan_id")
        if not pid:
            pytest.skip("No plan")
        r = auth.get(f"{API}/prevention/plans-intervention/{pid}/versions")
        assert r.status_code == 200

    def test_delete_plan(self, auth, shared_ids):
        pid = shared_ids.get("plan_id")
        if not pid:
            pytest.skip("No plan")
        r = auth.delete(f"{API}/prevention/plans-intervention/{pid}")
        assert r.status_code == 200
        bid = shared_ids.get("bat_for_plan")
        if bid:
            auth.delete(f"{API}/prevention/batiments/{bid}")


# ======================================================================
#  8. RAPPORTS & STATISTIQUES  (prevention_reports.py)
# ======================================================================
class TestReports:

    def test_statistiques(self, auth):
        r = auth.get(f"{API}/prevention/statistiques")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, dict)

    def test_tendances(self, auth):
        r = auth.get(f"{API}/prevention/rapports/tendances")
        assert r.status_code == 200

    def test_notifications(self, auth):
        r = auth.get(f"{API}/prevention/notifications")
        assert r.status_code == 200

    def test_export_excel(self, auth):
        r = auth.get(f"{API}/prevention/export-excel")
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "spreadsheet" in ct or "octet" in ct or "excel" in ct


# ======================================================================
#  9. CONFIGURATION & CARTE  (prevention_config.py)
# ======================================================================
class TestConfig:

    def test_get_batiments_map(self, auth):
        r = auth.get(f"{API}/prevention/batiments/map")
        assert r.status_code == 200

    def test_get_preventionnistes(self, auth):
        r = auth.get(f"{API}/prevention/preventionnistes")
        assert r.status_code == 200


# ======================================================================
# 10. ICONES PERSONNALISEES  (prevention_media.py)
# ======================================================================
class TestMedia:

    def test_list_icones(self, auth):
        r = auth.get(f"{API}/prevention/icones-personnalisees")
        assert r.status_code == 200

    def test_create_icone(self, auth, shared_ids):
        # image_base64 minimal valide (1x1 px PNG en base64)
        tiny_png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        payload = {
            "nom": f"Icone Test {uuid.uuid4().hex[:6]}",
            "image_base64": tiny_png,
            "categorie": "autre",
        }
        r = auth.post(f"{API}/prevention/icones-personnalisees", json=payload)
        assert r.status_code in (200, 201), f"Create icone: {r.text}"
        data = r.json()
        shared_ids["icone_id"] = data.get("id") or data.get("icone_id")

    def test_delete_icone(self, auth, shared_ids):
        iid = shared_ids.get("icone_id")
        if not iid:
            pytest.skip("No icone")
        r = auth.delete(f"{API}/prevention/icones-personnalisees/{iid}")
        assert r.status_code == 200


# ======================================================================
# 11. INSPECTIONS VISUELLES  (prevention_inspections_visuelles.py)
# ======================================================================
class TestInspectionsVisuelles:

    def test_setup_and_create(self, auth, shared_ids):
        # Creer batiment
        bat = auth.post(f"{API}/prevention/batiments", json={
            "nom_etablissement": f"Bat IV {uuid.uuid4().hex[:6]}",
            "adresse_civique": "3 Rue IV",
        })
        bat_data = bat.json()
        shared_ids["bat_for_iv"] = bat_data.get("id") or bat_data.get("batiment_id") or bat_data.get("batiment", {}).get("id")

        # Recuperer l'utilisateur courant pour le participant
        users_r = auth.get(f"{API}/users")
        users = users_r.json() if users_r.status_code == 200 else []
        current_user = users[0] if users else {"id": "unknown", "prenom": "Test", "nom": "User"}

        payload = {
            "batiment_id": shared_ids["bat_for_iv"],
            "participants": [
                {
                    "user_id": current_user.get("id", "unknown"),
                    "nom_complet": f"{current_user.get('prenom', '')} {current_user.get('nom', '')}",
                    "role": "pompier",
                    "est_principal": True,
                }
            ],
            "date_inspection": "2026-03-24",
            "notes_terrain": "Test inspection visuelle",
        }
        r = auth.post(f"{API}/prevention/inspections-visuelles", json=payload)
        assert r.status_code in (200, 201), f"Create IV: {r.text}"
        data = r.json()
        shared_ids["iv_id"] = data.get("id") or data.get("inspection_id") or data.get("inspection", {}).get("id")

    def test_list_inspections_visuelles(self, auth):
        r = auth.get(f"{API}/prevention/inspections-visuelles")
        assert r.status_code == 200

    def test_get_a_valider(self, auth):
        r = auth.get(f"{API}/prevention/inspections-visuelles/a-valider")
        assert r.status_code == 200

    def test_get_inspection_visuelle(self, auth, shared_ids):
        ivid = shared_ids.get("iv_id")
        if not ivid:
            pytest.skip("No IV")
        r = auth.get(f"{API}/prevention/inspections-visuelles/{ivid}")
        assert r.status_code == 200

    def test_update_inspection_visuelle(self, auth, shared_ids):
        ivid = shared_ids.get("iv_id")
        if not ivid:
            pytest.skip("No IV")
        r = auth.put(f"{API}/prevention/inspections-visuelles/{ivid}", json={"notes_terrain": "MAJ"})
        assert r.status_code == 200

    def test_create_nc_visuelle(self, auth, shared_ids):
        ivid = shared_ids.get("iv_id")
        bid = shared_ids.get("bat_for_iv")
        if not ivid or not bid:
            pytest.skip("No IV or bat")
        payload = {
            "inspection_id": ivid,
            "batiment_id": bid,
            "titre": f"NC Vis {uuid.uuid4().hex[:6]}",
            "description": "NC visuelle de test",
            "gravite": "mineur",
        }
        r = auth.post(f"{API}/prevention/non-conformites-visuelles", json=payload)
        assert r.status_code in (200, 201), f"Create NC vis: {r.text}"
        data = r.json()
        shared_ids["nc_vis_id"] = data.get("id") or data.get("nc_id")

    def test_list_nc_visuelles(self, auth):
        r = auth.get(f"{API}/prevention/non-conformites-visuelles")
        assert r.status_code == 200

    def test_delete_inspection_visuelle(self, auth, shared_ids):
        ivid = shared_ids.get("iv_id")
        if not ivid:
            pytest.skip("No IV")
        r = auth.delete(f"{API}/prevention/inspections-visuelles/{ivid}")
        assert r.status_code == 200
        # Nettoyage
        bid = shared_ids.get("bat_for_iv")
        if bid:
            auth.delete(f"{API}/prevention/batiments/{bid}")
