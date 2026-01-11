"""
Services de base de données partagés
Ce fichier centralise la connexion MongoDB et les helpers communs
"""

from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

# Charger les variables d'environnement
load_dotenv()

# MongoDB connection avec configuration SSL pour production
mongo_url = os.environ.get('MONGO_URL', '')

# Initialisation conditionnelle (permet les tests unitaires)
client = None
db = None

if mongo_url:
    # Configuration SSL/TLS pour MongoDB Atlas et production
    if 'mongodb+srv' in mongo_url or 'ssl=true' in mongo_url.lower():
        if '?' in mongo_url:
            if 'ssl=' not in mongo_url.lower() and 'tls=' not in mongo_url.lower():
                mongo_url += '&tls=true&tlsAllowInvalidCertificates=false'
        else:
            mongo_url += '?tls=true&tlsAllowInvalidCertificates=false'

    client = AsyncIOMotorClient(
        mongo_url,
        serverSelectionTimeoutMS=30000,
        connectTimeoutMS=30000,
        socketTimeoutMS=60000,
        maxPoolSize=50,
        minPoolSize=10,
        maxIdleTimeMS=45000,
        retryWrites=True,
        retryReads=True
    )

    # Extraire le nom de la base de données
    db_name = os.environ.get('DB_NAME', 'profiremanager')
    db = client[db_name]


def is_temps_partiel(user: dict) -> bool:
    """Vérifie si un utilisateur est temps partiel ou temporaire"""
    return user.get("type_emploi") in ["temps_partiel", "temporaire"]


def is_temps_plein(user: dict) -> bool:
    """Vérifie si un utilisateur est temps plein"""
    return user.get("type_emploi") == "temps_plein"
