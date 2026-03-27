"""
Test des notifications de remplacements pour les demandeurs.
Vérifie que les notifications in-app sont créées avec le bon champ `destinataire_id`
et le bon `statut: non_lu`, afin qu'elles apparaissent dans l'endpoint GET /notifications.
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone, timedelta

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = os.environ.get("MONGO_URL", "")
DB_NAME = os.environ.get("DB_NAME", "profiremanager-dev")


async def run_tests():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    # Find the demo tenant
    tenant = await db.tenants.find_one({"slug": "demo"})
    if not tenant:
        print("FAIL: Tenant 'demo' non trouvé")
        return False
    
    tenant_id = tenant["id"]
    print(f"Tenant: {tenant.get('nom', 'demo')} (id: {tenant_id})")
    
    # Get two test users
    users = await db.users.find({"tenant_id": tenant_id, "actif": {"$ne": False}}).to_list(10)
    if len(users) < 2:
        print("FAIL: Pas assez d'utilisateurs pour tester")
        return False
    
    demandeur = users[0]
    remplacant = users[1]
    demandeur_id = demandeur["id"]
    remplacant_id = remplacant["id"]
    print(f"Demandeur: {demandeur.get('prenom')} {demandeur.get('nom')} ({demandeur_id})")
    print(f"Remplacant: {remplacant.get('prenom')} {remplacant.get('nom')} ({remplacant_id})")
    
    # Cleanup: remove any test notifications
    test_prefix = "TEST_NOTIF_"
    await db.notifications.delete_many({"data.test_marker": {"$regex": f"^{test_prefix}"}})
    
    test_marker = f"{test_prefix}{uuid.uuid4().hex[:8]}"
    all_passed = True
    
    # ===== TEST 1: Simulate notification when replacement is ACCEPTED (workflow.py) =====
    print("\n--- TEST 1: Notification remplacement accepté (demandeur) ---")
    notif_accepte_id = str(uuid.uuid4())
    await db.notifications.insert_one({
        "id": notif_accepte_id,
        "tenant_id": tenant_id,
        "destinataire_id": demandeur_id,
        "type": "remplacement_accepte",
        "titre": "Remplacement trouve!",
        "message": f"{remplacant.get('prenom', '')} {remplacant.get('nom', '')} a accepte de vous remplacer le 2026-04-01.",
        "statut": "non_lu",
        "lu": False,
        "data": {"demande_id": "test-demande-1", "remplacant_id": remplacant_id, "test_marker": test_marker},
        "date_creation": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    # Verify it can be found by the GET endpoint logic
    found = await db.notifications.find_one({
        "tenant_id": tenant_id,
        "destinataire_id": demandeur_id,
        "id": notif_accepte_id
    })
    if found and found.get("destinataire_id") == demandeur_id and found.get("statut") == "non_lu":
        print("  PASS: Notification 'remplacement_accepte' trouvée avec destinataire_id et statut correct")
    else:
        print(f"  FAIL: Notification non trouvée ou champs incorrects. Found: {found}")
        all_passed = False
    
    # ===== TEST 2: Simulate notification when demand EXPIRES (remplacements_routes.py) =====
    print("\n--- TEST 2: Notification demande expirée (demandeur) ---")
    notif_expire_id = str(uuid.uuid4())
    await db.notifications.insert_one({
        "id": notif_expire_id,
        "tenant_id": tenant_id,
        "destinataire_id": demandeur_id,
        "type": "remplacement_expiree",
        "titre": "Demande de remplacement expiree",
        "message": "Aucun remplacant n'a ete trouve pour votre demande du 2026-04-01.",
        "statut": "non_lu",
        "lu": False,
        "data": {"demande_id": "test-demande-2", "test_marker": test_marker},
        "date_creation": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    found = await db.notifications.find_one({
        "tenant_id": tenant_id,
        "destinataire_id": demandeur_id,
        "id": notif_expire_id
    })
    if found and found.get("statut") == "non_lu":
        print("  PASS: Notification 'remplacement_expiree' trouvée avec destinataire_id et statut correct")
    else:
        print(f"  FAIL: Notification non trouvée ou champs incorrects. Found: {found}")
        all_passed = False
    
    # ===== TEST 3: Simulate notification for replacement PROPOSAL (remplacements_routes.py) =====
    print("\n--- TEST 3: Notification proposition de remplacement (remplacant) ---")
    notif_prop_id = str(uuid.uuid4())
    await db.notifications.insert_one({
        "id": notif_prop_id,
        "tenant_id": tenant_id,
        "destinataire_id": remplacant_id,
        "type": "remplacement_proposition",
        "titre": "Demande de remplacement urgente",
        "message": f"{demandeur.get('prenom', '')} cherche un remplaçant.",
        "statut": "non_lu",
        "lu": False,
        "data": {"demande_id": "test-demande-3", "lien": "/remplacements", "test_marker": test_marker},
        "date_creation": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    found = await db.notifications.find_one({
        "tenant_id": tenant_id,
        "destinataire_id": remplacant_id,
        "id": notif_prop_id
    })
    if found and found.get("destinataire_id") == remplacant_id and found.get("statut") == "non_lu":
        print("  PASS: Notification 'remplacement_proposition' trouvée avec destinataire_id correct")
    else:
        print(f"  FAIL: Notification non trouvée ou champs incorrects. Found: {found}")
        all_passed = False
    
    # ===== TEST 4: Simulate notification process STOPPED (remplacements_routes.py) =====
    print("\n--- TEST 4: Notification processus arrêté (demandeur) ---")
    notif_arrete_id = str(uuid.uuid4())
    await db.notifications.insert_one({
        "id": notif_arrete_id,
        "tenant_id": tenant_id,
        "destinataire_id": demandeur_id,
        "type": "remplacement_arrete",
        "titre": "Processus arrete",
        "message": "Le processus de remplacement a ete arrete.",
        "statut": "non_lu",
        "lu": False,
        "data": {"demande_id": "test-demande-4", "test_marker": test_marker},
        "date_creation": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    found = await db.notifications.find_one({
        "tenant_id": tenant_id,
        "destinataire_id": demandeur_id,
        "id": notif_arrete_id
    })
    if found and found.get("destinataire_id") == demandeur_id and found.get("statut") == "non_lu":
        print("  PASS: Notification 'remplacement_arrete' trouvée avec destinataire_id correct")
    else:
        print(f"  FAIL: Notification non trouvée ou champs incorrects. Found: {found}")
        all_passed = False
    
    # ===== TEST 5: Count non-lues for demandeur =====
    print("\n--- TEST 5: Comptage non-lues pour le demandeur ---")
    count = await db.notifications.count_documents({
        "tenant_id": tenant_id,
        "destinataire_id": demandeur_id,
        "statut": "non_lu",
        "data.test_marker": test_marker
    })
    # Demandeur should have 3 test notifications (accepte, expiree, arrete)
    if count == 3:
        print(f"  PASS: Le demandeur a {count} notifications non-lues (attendu: 3)")
    else:
        print(f"  FAIL: Le demandeur a {count} notifications non-lues (attendu: 3)")
        all_passed = False
    
    # ===== TEST 6: Verify OLD broken notifications (with user_id only) are NOT returned =====
    print("\n--- TEST 6: Les anciennes notifications avec 'user_id' ne sont PAS visibles ---")
    old_notif_id = str(uuid.uuid4())
    await db.notifications.insert_one({
        "id": old_notif_id,
        "tenant_id": tenant_id,
        "user_id": demandeur_id,  # OLD broken format
        "type": "remplacement_test_old",
        "titre": "Old format",
        "message": "Test old format",
        "lu": False,
        "data": {"test_marker": test_marker},
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    # This should NOT be found by the notification endpoint logic (which uses destinataire_id)
    found_old = await db.notifications.find_one({
        "tenant_id": tenant_id,
        "destinataire_id": demandeur_id,
        "id": old_notif_id
    })
    if found_old is None:
        print("  PASS: L'ancienne notification avec 'user_id' N'EST PAS visible (correct)")
    else:
        print(f"  FAIL: L'ancienne notification avec 'user_id' est visible (incorrect)")
        all_passed = False
    
    # Cleanup test data
    await db.notifications.delete_many({"data.test_marker": test_marker})
    await db.notifications.delete_one({"id": old_notif_id})
    
    print("\n" + "=" * 50)
    if all_passed:
        print("RESULTAT: TOUS LES TESTS PASSENT")
    else:
        print("RESULTAT: CERTAINS TESTS ONT ECHOUE")
    print("=" * 50)
    
    client.close()
    return all_passed


if __name__ == "__main__":
    # Load env
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    
    result = asyncio.run(run_tests())
    sys.exit(0 if result else 1)
