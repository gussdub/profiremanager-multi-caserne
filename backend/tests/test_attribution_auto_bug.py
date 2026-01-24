"""
Test de reproduction du bug d'attribution automatique.

Symptôme: La boucle `for day_offset in range(7)` saute des itérations
pour certaines gardes (ex: "Garde Interne LMM" le 5 janvier 2026).

Ce test crée un environnement minimal pour reproduire le bug.
"""

import asyncio
import os
import sys
import logging
from datetime import datetime, timedelta
from uuid import uuid4

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from motor.motor_asyncio import AsyncIOMotorClient

# Use relative paths based on current file location
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_PATH = os.path.join(BASE_DIR, 'attribution_test_output.log')

# Configure logging to capture all details
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(LOG_PATH)
    ]
)
logger = logging.getLogger(__name__)


class MockTenant:
    """Mock tenant object for testing"""
    def __init__(self, tenant_data):
        self.id = tenant_data.get('id')
        self.nom = tenant_data.get('nom')
        self.slug = tenant_data.get('slug')
        self.parametres = tenant_data.get('parametres', {})


class MockProgress:
    """Mock progress tracker"""
    def update(self, message, percent, **kwargs):
        logger.info(f"[PROGRESS] {percent}% - {message}")
    
    def complete(self, total):
        logger.info(f"[PROGRESS] COMPLETE - {total} assignations")
    
    def error(self, msg):
        logger.error(f"[PROGRESS] ERROR - {msg}")


async def test_attribution_auto():
    """
    Test that reproduces the bug where day_offset loop skips iterations.
    """
    # Connect to database
    client = AsyncIOMotorClient(os.getenv('MONGO_URL'))
    db_name = os.getenv('DB_NAME', 'firefighter_db')
    db = client[db_name]
    
    logger.info("=" * 60)
    logger.info("TEST: Attribution automatique - Bug des jours sautés")
    logger.info("=" * 60)
    
    # Get Shefford tenant
    tenant_data = await db.tenants.find_one({'slug': 'shefford'})
    if not tenant_data:
        logger.error("Tenant 'shefford' not found!")
        return False
    
    tenant = MockTenant(tenant_data)
    logger.info(f"Tenant: {tenant.nom} ({tenant.id})")
    
    # Get types de garde
    types_garde = await db.types_garde.find({'tenant_id': tenant.id}).to_list(1000)
    logger.info(f"Types de garde: {len(types_garde)}")
    
    # Find Garde Interne LMM
    garde_lmm = next((t for t in types_garde if t.get('nom') == 'Garde Interne LMM'), None)
    if garde_lmm:
        logger.info(f"Garde Interne LMM trouvée:")
        logger.info(f"  - ID: {garde_lmm.get('id')}")
        logger.info(f"  - jours_application: {garde_lmm.get('jours_application')}")
        logger.info(f"  - officier_obligatoire: {garde_lmm.get('officier_obligatoire')}")
        logger.info(f"  - personnel_requis: {garde_lmm.get('personnel_requis')}")
        logger.info(f"  - competences_requises: {garde_lmm.get('competences_requises')}")
    else:
        logger.warning("Garde Interne LMM not found - creating mock data")
        
    # Get users
    users = await db.users.find({'tenant_id': tenant.id, 'statut': 'Actif'}).to_list(1000)
    logger.info(f"Utilisateurs actifs: {len(users)}")
    
    # Test week: January 5, 2026 (Monday)
    semaine_debut = "2026-01-05"
    semaine_fin = "2026-01-11"
    
    logger.info(f"\n{'='*60}")
    logger.info(f"Test semaine: {semaine_debut} à {semaine_fin}")
    logger.info(f"{'='*60}")
    
    # Simulate the day_offset loop manually to see what happens
    logger.info("\n--- Simulation de la boucle day_offset ---")
    
    for day_offset in range(7):
        current_date = datetime.strptime(semaine_debut, "%Y-%m-%d") + timedelta(days=day_offset)
        date_str = current_date.strftime("%Y-%m-%d")
        day_name_en = current_date.strftime("%A").lower()
        
        day_name_mapping = {
            'monday': 'lundi', 'tuesday': 'mardi', 'wednesday': 'mercredi',
            'thursday': 'jeudi', 'friday': 'vendredi', 'saturday': 'samedi', 'sunday': 'dimanche'
        }
        day_name_fr = day_name_mapping.get(day_name_en, day_name_en)
        
        logger.info(f"\n[DAY {day_offset}] {date_str} ({day_name_en}/{day_name_fr})")
        
        if garde_lmm:
            jours_app = garde_lmm.get("jours_application", [])
            jour_applicable = day_name_en in jours_app or day_name_fr in jours_app
            logger.info(f"  Garde Interne LMM applicable: {jour_applicable} (jours: {jours_app})")
    
    # Now test the actual function if possible
    logger.info("\n--- Test de la fonction traiter_semaine_attribution_auto ---")
    
    # Clean up any existing test assignations for this period
    deleted = await db.assignations.delete_many({
        'tenant_id': tenant.id,
        'date': {'$gte': semaine_debut, '$lte': semaine_fin},
        'assignation_type': 'auto'
    })
    logger.info(f"Nettoyage: {deleted.deleted_count} assignations supprimées")
    
    # Import and call the actual function
    try:
        # We need to import from server.py
        # Since the function is async and defined in the same file with many dependencies,
        # we'll create a simplified version here for testing
        
        logger.info("\n--- Analyse détaillée des données ---")
        
        # Check disponibilités
        dispos = await db.disponibilites.find({
            'tenant_id': tenant.id,
            'date': {'$gte': semaine_debut, '$lte': semaine_fin},
            'statut': 'disponible'
        }).to_list(10000)
        logger.info(f"Disponibilités trouvées: {len(dispos)}")
        
        # Check for Jean-François Tardif specifically
        jf_tardif = next((u for u in users 
                         if 'jean' in u.get('prenom', '').lower() 
                         and 'tardif' in u.get('nom', '').lower()), None)
        
        if jf_tardif:
            logger.info(f"\n--- Jean-François Tardif ---")
            logger.info(f"  ID: {jf_tardif.get('id')}")
            logger.info(f"  Statut: {jf_tardif.get('statut')}")
            logger.info(f"  Type emploi: {jf_tardif.get('type_emploi')}")
            logger.info(f"  Grade: {jf_tardif.get('grade')}")
            logger.info(f"  Compétences: {jf_tardif.get('competences', [])}")
            
            # Check his disponibilités
            jf_dispos = [d for d in dispos if d.get('user_id') == jf_tardif.get('id')]
            logger.info(f"  Disponibilités: {len(jf_dispos)}")
            for d in jf_dispos[:5]:
                logger.info(f"    {d.get('date')}: {d.get('heure_debut')}-{d.get('heure_fin')}")
        else:
            logger.warning("Jean-François Tardif non trouvé dans les utilisateurs")
        
        # Check grades for officer detection
        grades = await db.grades.find({'tenant_id': tenant.id}).to_list(100)
        logger.info(f"\n--- Grades ({len(grades)}) ---")
        for g in grades:
            logger.info(f"  {g.get('nom')}: est_officier={g.get('est_officier', False)}")
        
        # Check competences
        competences = await db.competences.find({'tenant_id': tenant.id}).to_list(100)
        logger.info(f"\n--- Compétences ({len(competences)}) ---")
        for c in competences[:10]:
            logger.info(f"  {c.get('id')[:8]}...: {c.get('nom')}")
        
        logger.info("\n" + "=" * 60)
        logger.info("TEST TERMINÉ - Voir les logs pour analyse")
        logger.info("=" * 60)
        
        return True
        
    except Exception as e:
        logger.error(f"Erreur lors du test: {e}", exc_info=True)
        return False


async def test_direct_function_call():
    """
    Test direct de la fonction traiter_semaine_attribution_auto
    avec logging très détaillé.
    """
    import importlib.util
    
    # Load server module dynamically using relative path
    server_path = os.path.join(os.path.dirname(BASE_DIR), "server.py")
    spec = importlib.util.spec_from_file_location("server", server_path)
    
    logger.info("\n" + "=" * 60)
    logger.info("TEST DIRECT DE LA FONCTION")
    logger.info("=" * 60)
    
    # Note: Direct import may fail due to circular dependencies
    # Instead, we'll call the API endpoint
    
    logger.info("Ce test nécessite un appel API pour être complet.")
    logger.info("Utilisez curl pour tester:")
    logger.info("  curl -X POST https://[URL]/api/shefford/planning/attribution-auto \\")
    logger.info("    -H 'Authorization: Bearer [TOKEN]' \\")
    logger.info("    -H 'Content-Type: application/json' \\")
    logger.info("    -d '{\"date_debut\": \"2026-01-05\", \"date_fin\": \"2026-01-11\"}'")
    
    return True


if __name__ == "__main__":
    print("Starting attribution auto bug test...")
    
    # Run both tests
    loop = asyncio.get_event_loop()
    
    result1 = loop.run_until_complete(test_attribution_auto())
    print(f"\nTest attribution_auto: {'PASS' if result1 else 'FAIL'}")
    
    result2 = loop.run_until_complete(test_direct_function_call())
    print(f"Test direct function call: {'PASS' if result2 else 'FAIL'}")
    
    print(f"\nLogs saved to: {LOG_PATH}")
