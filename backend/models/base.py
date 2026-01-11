"""
Modèles de base Pydantic pour ProFireManager
Ce fichier expose les modèles définis dans server.py pour une transition graduelle
vers une architecture modulaire.

IMPORTANT: Ne pas dupliquer les définitions - importer depuis server.py
"""

# Pour l'instant, les modèles restent dans server.py
# Ce fichier servira de point d'entrée lors de la migration complète

# Imports communs pour les modèles
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid
