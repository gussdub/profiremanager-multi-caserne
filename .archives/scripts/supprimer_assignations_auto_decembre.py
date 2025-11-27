#!/usr/bin/env python3
"""
Script de suppression des assignations automatiques - Décembre 2025
Base: Production (profiremanager)
Tenant: shefford

ATTENTION: Ce script supprime des données de PRODUCTION !
"""

from pymongo import MongoClient
from datetime import datetime
import sys

# Configuration
MONGO_URI = "mongodb+srv://profiremanager_admin:BsqKibVAy6FTiTxg@profiremanager-prod.crqjvsp.mongodb.net/?retryWrites=true&w=majority"
DB_NAME = "profiremanager"
TENANT_SLUG = "shefford"
DATE_DEBUT = "2025-12-01"
DATE_FIN = "2025-12-31"

def main():
    print("=" * 80)
    print("🗑️  SUPPRESSION ASSIGNATIONS AUTOMATIQUES - DÉCEMBRE 2025")
    print("=" * 80)
    print(f"Base de données : {DB_NAME} (PRODUCTION)")
    print(f"Tenant          : {TENANT_SLUG}")
    print(f"Période         : {DATE_DEBUT} à {DATE_FIN}")
    print(f"Type            : assignation_type='auto' uniquement")
    print("=" * 80)
    print()
    
    try:
        # Connexion à MongoDB
        print("📡 Connexion à MongoDB Atlas (Production)...")
        client = MongoClient(MONGO_URI)
        db = client[DB_NAME]
        
        # Test de connexion
        client.admin.command('ping')
        print("✅ Connexion réussie\n")
        
        # Récupérer le tenant
        print(f"🔍 Recherche du tenant '{TENANT_SLUG}'...")
        tenant = db.tenants.find_one({"slug": TENANT_SLUG})
        
        if not tenant:
            print(f"❌ ERREUR: Tenant '{TENANT_SLUG}' non trouvé !")
            sys.exit(1)
        
        tenant_id = tenant.get("id")
        tenant_nom = tenant.get("nom", "N/A")
        print(f"✅ Tenant trouvé: {tenant_nom} (ID: {tenant_id})\n")
        
        # Critères de recherche
        criteres = {
            "tenant_id": tenant_id,
            "date": {
                "$gte": DATE_DEBUT,
                "$lte": DATE_FIN
            },
            "assignation_type": "auto"
        }
        
        # Compter les assignations à supprimer
        print("🔍 Recherche des assignations automatiques de décembre 2025...")
        count = db.assignations.count_documents(criteres)
        
        if count == 0:
            print("✅ Aucune assignation automatique trouvée pour cette période.")
            print("Rien à supprimer !")
            client.close()
            return
        
        print(f"⚠️  {count} assignations automatiques trouvées\n")
        
        # Afficher quelques exemples
        print("📋 Aperçu des assignations qui seront supprimées:")
        print("-" * 80)
        
        exemples = list(db.assignations.find(criteres).limit(10))
        
        for i, ass in enumerate(exemples, 1):
            date = ass.get("date", "N/A")
            user_id = ass.get("user_id", "N/A")
            type_garde_id = ass.get("type_garde_id", "N/A")
            
            # Récupérer le nom de l'utilisateur
            user = db.users.find_one({"id": user_id})
            user_nom = f"{user.get('prenom', '')} {user.get('nom', '')}".strip() if user else "Utilisateur inconnu"
            
            # Récupérer le type de garde
            type_garde = db.types_garde.find_one({"id": type_garde_id})
            type_garde_nom = type_garde.get("nom", "Type inconnu") if type_garde else "Type inconnu"
            
            print(f"  {i}. {date} - {user_nom} - {type_garde_nom}")
        
        if count > 10:
            print(f"  ... et {count - 10} autres assignations")
        
        print("-" * 80)
        print()
        
        # Résumé par type de garde
        print("📊 Résumé par type de garde:")
        print("-" * 80)
        
        pipeline = [
            {"$match": criteres},
            {"$group": {
                "_id": "$type_garde_id",
                "count": {"$sum": 1}
            }}
        ]
        
        resume_types = list(db.assignations.aggregate(pipeline))
        
        for item in resume_types:
            type_garde_id = item["_id"]
            count_type = item["count"]
            
            type_garde = db.types_garde.find_one({"id": type_garde_id})
            type_garde_nom = type_garde.get("nom", "Type inconnu") if type_garde else "Type inconnu"
            
            print(f"  • {type_garde_nom}: {count_type} assignations")
        
        print("-" * 80)
        print()
        
        # Résumé par date
        print("📊 Résumé par date:")
        print("-" * 80)
        
        pipeline_dates = [
            {"$match": criteres},
            {"$group": {
                "_id": "$date",
                "count": {"$sum": 1}
            }},
            {"$sort": {"_id": 1}}
        ]
        
        resume_dates = list(db.assignations.aggregate(pipeline_dates))
        
        for item in resume_dates[:10]:  # Afficher les 10 premières dates
            date = item["_id"]
            count_date = item["count"]
            print(f"  • {date}: {count_date} assignations")
        
        if len(resume_dates) > 10:
            print(f"  ... et {len(resume_dates) - 10} autres dates")
        
        print("-" * 80)
        print()
        
        # Demander confirmation
        print("⚠️  ATTENTION: Cette opération va supprimer définitivement ces assignations !")
        print("⚠️  Cette action est IRRÉVERSIBLE !")
        print()
        
        confirmation = input("Tapez 'SUPPRIMER' en majuscules pour confirmer la suppression: ")
        
        if confirmation != "SUPPRIMER":
            print("\n❌ Suppression annulée par l'utilisateur.")
            print("Aucune donnée n'a été modifiée.")
            client.close()
            return
        
        # Suppression
        print("\n🗑️  Suppression en cours...")
        result = db.assignations.delete_many(criteres)
        
        print(f"\n✅ Suppression terminée !")
        print(f"📊 {result.deleted_count} assignations automatiques ont été supprimées.")
        print()
        
        # Vérification finale
        count_final = db.assignations.count_documents(criteres)
        if count_final == 0:
            print("✅ Vérification: Aucune assignation automatique restante pour décembre 2025.")
        else:
            print(f"⚠️  Attention: {count_final} assignations automatiques subsistent encore.")
        
        print("\n" + "=" * 80)
        print("✅ Opération terminée avec succès !")
        print("=" * 80)
        
        client.close()
        
    except Exception as e:
        print(f"\n❌ ERREUR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
