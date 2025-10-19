#!/usr/bin/env python3
"""
Test script specifically for the CORRECTED Réinitialiser functionality
"""

import requests
import json
import sys
from datetime import datetime, timedelta
import uuid

# Configuration
BASE_URL = "https://firefighter-hub-6.preview.emergentagent.com/api"

def test_corrected_reinitialiser():
    """Test CORRECTED Réinitialiser functionality with new type_entree filter"""
    try:
        tenant_slug = "shefford"
        
        # Login as Shefford admin using the correct credentials
        login_data = {
            "email": "admin@firemanager.ca",
            "mot_de_passe": "admin123"
        }
        
        response = requests.post(f"{BASE_URL}/{tenant_slug}/auth/login", json=login_data)
        if response.status_code != 200:
            # Try with legacy login
            response = requests.post(f"{BASE_URL}/auth/login", json=login_data)
            if response.status_code != 200:
                print(f"❌ Failed to login as Shefford admin: {response.status_code}")
                print(f"Response: {response.text}")
                return False

        login_result = response.json()
        admin_token = login_result["access_token"]
        
        # Create a new session with admin token
        admin_session = requests.Session()
        admin_session.headers.update({"Authorization": f"Bearer {admin_token}"})
        
        # Create a new part-time user for testing
        test_user = {
            "nom": "TestPompier",
            "prenom": "TempsPartiel",
            "email": f"test.corrected.{uuid.uuid4().hex[:8]}@shefford.ca",
            "telephone": "450-555-0123",
            "contact_urgence": "450-555-0124",
            "grade": "Pompier",
            "fonction_superieur": False,
            "type_emploi": "temps_partiel",
            "heures_max_semaine": 25,
            "role": "employe",
            "numero_employe": f"TP{uuid.uuid4().hex[:6].upper()}",
            "date_embauche": "2024-01-15",
            "formations": [],
            "mot_de_passe": "TestPass123!"
        }
        
        response = admin_session.post(f"{BASE_URL}/{tenant_slug}/users", json=test_user)
        if response.status_code != 200:
            print(f"❌ Failed to create part-time user: {response.status_code}")
            return False
        
        part_time_user = response.json()
        user_id = part_time_user["id"]
        
        print(f"✅ Created test user: {part_time_user['prenom']} {part_time_user['nom']} (ID: {user_id})")
        
        # Step 1: Create 1 MANUAL disponibilité for today
        today = datetime.now().date()
        
        manual_entry_today = {
            "user_id": user_id,
            "date": today.isoformat(),
            "heure_debut": "08:00",
            "heure_fin": "16:00",
            "statut": "disponible",
            "origine": "manuelle"
        }
        
        response = admin_session.post(f"{BASE_URL}/{tenant_slug}/disponibilites", json=manual_entry_today)
        if response.status_code == 200:
            print(f"✅ Created manual disponibilité for today: {today}")
        else:
            print(f"⚠️ Manual entry creation returned: {response.status_code} (might already exist)")
        
        # Step 2: Generate Montreal schedule (creates auto-generated entries)
        montreal_data = {
            "user_id": user_id,
            "horaire_type": "montreal",
            "equipe": "Rouge",
            "annee": 2025,
            "conserver_manuelles": True
        }
        
        response = admin_session.post(f"{BASE_URL}/{tenant_slug}/disponibilites/generer", json=montreal_data)
        if response.status_code != 200:
            print(f"❌ Failed to generate Montreal schedule: {response.status_code}")
            return False
        
        montreal_result = response.json()
        print(f"✅ Generated Montreal schedule: {montreal_result.get('nombre_indisponibilites', 0)} entries")
        
        # Step 3: Call reinitialiser with mode "generees_seulement" and type_entree "les_deux"
        reinit_data = {
            "user_id": user_id,
            "periode": "mois",
            "mode": "generees_seulement",
            "type_entree": "les_deux"
        }
        
        print(f"\n🔧 Testing CORRECTED reinitialiser with:")
        print(f"   - periode: {reinit_data['periode']}")
        print(f"   - mode: {reinit_data['mode']}")
        print(f"   - type_entree: {reinit_data['type_entree']}")
        
        response = admin_session.delete(f"{BASE_URL}/{tenant_slug}/disponibilites/reinitialiser", json=reinit_data)
        if response.status_code != 200:
            print(f"❌ Reinitialiser failed: {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        reinit_result = response.json()
        print(f"✅ Reinitialiser completed: {reinit_result.get('nombre_supprimees', 0)} entries deleted")
        
        # Step 4: Verify manual entry STILL EXISTS and auto-generated entries DELETED
        response = admin_session.get(f"{BASE_URL}/{tenant_slug}/disponibilites/{user_id}")
        if response.status_code != 200:
            print(f"❌ Failed to fetch disponibilites after reset: {response.status_code}")
            return False
        
        disponibilites = response.json()
        
        # Check if manual entry for today still exists
        manual_entry_exists = False
        auto_entries_exist = False
        
        for entry in disponibilites:
            if entry.get('date') == today.isoformat() and entry.get('origine') == 'manuelle':
                manual_entry_exists = True
                print(f"✅ Manual entry preserved: {entry['date']} (origine: {entry['origine']})")
            elif entry.get('origine') in ['montreal_7_24', 'quebec_10_14']:
                # Check if it's in current month
                entry_date = datetime.fromisoformat(entry.get('date', '')).date()
                if entry_date.year == today.year and entry_date.month == today.month:
                    auto_entries_exist = True
                    print(f"❌ Auto entry still exists: {entry['date']} (origine: {entry['origine']})")
        
        if not manual_entry_exists:
            print("❌ CRITICAL BUG: Manual entry was deleted but should have been preserved")
            return False
        
        if auto_entries_exist:
            print("❌ CRITICAL BUG: Auto-generated entries still exist but should have been deleted")
            return False
        
        print("✅ Mode 'generees_seulement' working correctly: Manual entries preserved, auto-generated deleted")
        
        # Step 5: Test type_entree filter
        print("\n🔧 Testing type_entree filter...")
        
        # Create manual disponibilité (statut: disponible)
        tomorrow = today + timedelta(days=1)
        manual_disponible = {
            "user_id": user_id,
            "date": tomorrow.isoformat(),
            "heure_debut": "08:00",
            "heure_fin": "16:00",
            "statut": "disponible",
            "origine": "manuelle"
        }
        
        response = admin_session.post(f"{BASE_URL}/{tenant_slug}/disponibilites", json=manual_disponible)
        print(f"✅ Created manual disponibilité for {tomorrow}")
        
        # Create manual indisponibilité (statut: indisponible)
        day_after_tomorrow = today + timedelta(days=2)
        manual_indisponible = {
            "user_id": user_id,
            "date": day_after_tomorrow.isoformat(),
            "heure_debut": "08:00",
            "heure_fin": "16:00",
            "statut": "indisponible",
            "origine": "manuelle"
        }
        
        response = admin_session.post(f"{BASE_URL}/{tenant_slug}/disponibilites", json=manual_indisponible)
        print(f"✅ Created manual indisponibilité for {day_after_tomorrow}")
        
        # Step 6: Reinitialiser with type_entree: "disponibilites"
        reinit_disponibilites_data = {
            "user_id": user_id,
            "periode": "mois",
            "mode": "tout",
            "type_entree": "disponibilites"
        }
        
        print(f"\n🔧 Testing type_entree filter with 'disponibilites' only...")
        
        response = admin_session.delete(f"{BASE_URL}/{tenant_slug}/disponibilites/reinitialiser", json=reinit_disponibilites_data)
        if response.status_code != 200:
            print(f"❌ Type_entree test failed: {response.status_code}")
            return False
        
        type_entree_result = response.json()
        print(f"✅ Type_entree reinitialiser completed: {type_entree_result.get('nombre_supprimees', 0)} entries deleted")
        
        # Step 7: Verify only disponibilité deleted, indisponibilité preserved
        response = admin_session.get(f"{BASE_URL}/{tenant_slug}/disponibilites/{user_id}")
        if response.status_code != 200:
            print(f"❌ Failed to fetch disponibilites: {response.status_code}")
            return False
        
        disponibilites = response.json()
        
        disponible_exists = False
        indisponible_exists = False
        
        for entry in disponibilites:
            if entry.get('date') == tomorrow.isoformat() and entry.get('statut') == 'disponible':
                disponible_exists = True
                print(f"❌ Disponibilité still exists: {entry['date']} (should have been deleted)")
            elif entry.get('date') == day_after_tomorrow.isoformat() and entry.get('statut') == 'indisponible':
                indisponible_exists = True
                print(f"✅ Indisponibilité preserved: {entry['date']} (correctly preserved)")
        
        if disponible_exists:
            print("❌ Type_entree filter failed: Disponibilité should have been deleted")
            return False
        
        if not indisponible_exists:
            print("❌ Type_entree filter failed: Indisponibilité should have been preserved")
            return False
        
        print("✅ Type_entree filter working correctly: Only disponibilités deleted, indisponibilités preserved")
        
        print("\n🎉 ALL TESTS PASSED!")
        print("✅ CORRECTED Réinitialiser functionality fully working:")
        print("   1) Manual entries preserved when mode='generees_seulement' ✅")
        print("   2) Auto-generated entries deleted ✅") 
        print("   3) type_entree filter working correctly ✅")
        print("   4) New type_entree field supported ✅")
        
        return True
        
    except Exception as e:
        print(f"❌ Test error: {str(e)}")
        return False

if __name__ == "__main__":
    success = test_corrected_reinitialiser()
    sys.exit(0 if success else 1)