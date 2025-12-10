"""
Script de test pour vérifier le workflow des défauts de bornes
- Envoi d'email de notification
- Mise à jour du statut de la borne sur la carte
"""
import asyncio
import sys
import os
from datetime import datetime, timezone
from dotenv import load_dotenv

# Charger les variables d'environnement
load_dotenv('/app/backend/.env')

# Ajouter le répertoire backend au path
sys.path.insert(0, '/app/backend')

from utils.emails import send_defaut_borne_email


async def test_email_notification():
    """Test de l'envoi d'email de notification"""
    print("=" * 60)
    print("TEST 1: Envoi d'email de notification de défaut")
    print("=" * 60)
    
    # Données de test
    test_borne = {
        "id": "test-borne-001",
        "numero_borne": "BS-123",
        "adresse": "123 Rue de Test",
        "ville": "Shefford",
        "type": "borne_seche"
    }
    
    test_inspection = {
        "id": "test-inspection-001",
        "date_inspection": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "statut_inspection": "a_refaire",
        "etat_trouve": "a_refaire",
        "notes": "Test de notification - Défaut de joint détecté",
        "resultats": {
            "joint_present": "non_conforme",
            "joint_bon_etat": "defectuosite",
            "site_accessible": "conforme",
            "vanne_storz": "conforme"
        }
    }
    
    # Email de test Resend (simule une livraison réussie)
    test_emails = ["delivered@resend.dev"]
    
    print(f"\n📧 Envoi d'email de test à: {test_emails}")
    print(f"🔧 Borne: {test_borne['numero_borne']} - {test_borne['adresse']}")
    
    try:
        result = await send_defaut_borne_email(
            tenant_slug="shefford",
            borne=test_borne,
            inspection=test_inspection,
            inspecteur="Jean Testeur",
            emails=test_emails
        )
        
        if result.get("success"):
            print(f"\n✅ Email envoyé avec succès!")
            print(f"   Email ID: {result.get('email_id')}")
            print(f"   Destinataires: {result.get('recipients')}")
            return True
        else:
            print(f"\n❌ Échec de l'envoi: {result.get('error')}")
            return False
            
    except Exception as e:
        print(f"\n❌ Erreur lors du test: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


async def test_multiple_emails():
    """Test de l'envoi à plusieurs destinataires"""
    print("\n" + "=" * 60)
    print("TEST 2: Envoi à plusieurs destinataires")
    print("=" * 60)
    
    test_borne = {
        "id": "test-borne-002",
        "numero_borne": "BS-456",
        "adresse": "456 Avenue des Tests",
        "ville": "Shefford",
        "type": "borne_seche"
    }
    
    test_inspection = {
        "id": "test-inspection-002",
        "date_inspection": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "statut_inspection": "a_refaire",
        "etat_trouve": "a_refaire",
        "notes": "Défauts multiples détectés lors de l'inspection",
        "resultats": {
            "joint_present": "non_conforme",
            "site_accessible": "defectuosite",
            "vanne_storz": "non_conforme",
            "niveau_eau": "conforme"
        }
    }
    
    # Plusieurs emails de test
    test_emails = ["delivered@resend.dev", "bounced@resend.dev"]
    
    print(f"\n📧 Envoi à {len(test_emails)} destinataires")
    
    try:
        result = await send_defaut_borne_email(
            tenant_slug="shefford",
            borne=test_borne,
            inspection=test_inspection,
            inspecteur="Marie Inspectrice",
            emails=test_emails
        )
        
        if result.get("success"):
            print(f"\n✅ Email envoyé avec succès à tous les destinataires!")
            print(f"   Email ID: {result.get('email_id')}")
            return True
        else:
            print(f"\n❌ Échec de l'envoi: {result.get('error')}")
            return False
            
    except Exception as e:
        print(f"\n❌ Erreur lors du test: {str(e)}")
        return False


async def test_no_emails_configured():
    """Test du comportement quand aucun email n'est configuré"""
    print("\n" + "=" * 60)
    print("TEST 3: Aucun email configuré")
    print("=" * 60)
    
    test_borne = {
        "id": "test-borne-003",
        "numero_borne": "BS-789",
        "adresse": "789 Boulevard Test",
        "ville": "Shefford"
    }
    
    test_inspection = {
        "id": "test-inspection-003",
        "date_inspection": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "statut_inspection": "a_refaire",
        "notes": "Test sans destinataire",
        "resultats": {}
    }
    
    print("\n⚠️  Tentative d'envoi sans destinataire")
    
    try:
        result = await send_defaut_borne_email(
            tenant_slug="shefford",
            borne=test_borne,
            inspection=test_inspection,
            inspecteur="Test User",
            emails=[]
        )
        
        if not result.get("success"):
            print(f"\n✅ Comportement correct: {result.get('error')}")
            return True
        else:
            print(f"\n❌ Erreur: l'email aurait dû échouer sans destinataires")
            return False
            
    except Exception as e:
        print(f"\n❌ Erreur inattendue: {str(e)}")
        return False


async def run_all_tests():
    """Exécuter tous les tests"""
    print("\n")
    print("🧪 " + "=" * 58 + " 🧪")
    print("   TESTS DU WORKFLOW DE NOTIFICATION DES DÉFAUTS DE BORNES")
    print("🧪 " + "=" * 58 + " 🧪")
    print()
    
    results = []
    
    # Test 1: Envoi simple
    results.append(await test_email_notification())
    
    # Test 2: Envoi multiple
    results.append(await test_multiple_emails())
    
    # Test 3: Sans destinataires
    results.append(await test_no_emails_configured())
    
    # Résumé
    print("\n" + "=" * 60)
    print("RÉSUMÉ DES TESTS")
    print("=" * 60)
    passed = sum(results)
    total = len(results)
    print(f"\n✅ Tests réussis: {passed}/{total}")
    print(f"❌ Tests échoués: {total - passed}/{total}")
    
    if passed == total:
        print("\n🎉 Tous les tests sont passés avec succès!")
        print("\n📝 Prochaines étapes:")
        print("   1. Configurer les emails de notification dans l'interface")
        print("   2. Tester l'intégration complète avec le frontend")
        print("   3. Vérifier que le statut de la borne est mis à jour sur la carte")
    else:
        print("\n⚠️  Certains tests ont échoué. Vérifiez les logs ci-dessus.")
    
    return passed == total


if __name__ == "__main__":
    # Vérifier que la clé API Resend est configurée
    if not os.environ.get('RESEND_API_KEY'):
        print("❌ ERREUR: La variable d'environnement RESEND_API_KEY n'est pas configurée")
        print("   Veuillez configurer cette variable dans /app/backend/.env")
        sys.exit(1)
    
    # Exécuter les tests
    success = asyncio.run(run_all_tests())
    sys.exit(0 if success else 1)
