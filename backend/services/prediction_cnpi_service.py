"""
Service de prédiction d'articles CNPI basé sur TF-IDF + Similarité Cosinus
==========================================================================

Ce service utilise le Machine Learning (TF-IDF) pour améliorer la prédiction
des articles CNPI pertinents basée sur une description de non-conformité.

Avantages par rapport à l'algorithme par mots-clés:
- Prend en compte la fréquence des termes dans le corpus
- Comprend la similarité sémantique entre descriptions
- S'améliore automatiquement avec plus de données
- Moins sensible aux fautes de frappe et variations
"""

import re
import unicodedata
from typing import List, Dict, Optional, Tuple
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np


class PredicteurCNPI:
    """
    Prédicteur d'articles CNPI utilisant TF-IDF et similarité cosinus.
    """
    
    def __init__(self):
        self.vectorizer = None
        self.tfidf_matrix = None
        self.articles = []
        self.is_fitted = False
        
        # Stopwords français courants (mots sans valeur sémantique)
        self.stopwords_fr = {
            'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'au', 'aux',
            'et', 'ou', 'mais', 'donc', 'car', 'ni', 'que', 'qui', 'quoi',
            'ce', 'cette', 'ces', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes',
            'son', 'sa', 'ses', 'notre', 'nos', 'votre', 'vos', 'leur', 'leurs',
            'je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles', 'on',
            'être', 'avoir', 'faire', 'est', 'sont', 'a', 'ont', 'fait',
            'dans', 'sur', 'sous', 'avec', 'sans', 'pour', 'par', 'en',
            'ne', 'pas', 'plus', 'moins', 'très', 'bien', 'mal',
            'tout', 'tous', 'toute', 'toutes', 'autre', 'autres',
            'même', 'aussi', 'comme', 'si', 'alors', 'donc',
        }
        
        # Synonymes et termes équivalents pour enrichir la recherche
        self.synonymes = {
            'extincteur': ['extincteurs', 'appareil extincteur', 'ext'],
            'detecteur': ['détecteur', 'détecteurs', 'detecteurs', 'avertisseur', 'avertisseurs'],
            'fumee': ['fumée', 'fumer'],
            'alarme': ['alarmes', 'alerte', 'alertes'],
            'sortie': ['sorties', 'issue', 'issues', 'exit'],
            'eclairage': ['éclairage', 'eclairages', 'éclairages', 'lumiere', 'lumière'],
            'urgence': ['urgences', 'emergency'],
            'gicleur': ['gicleurs', 'sprinkler', 'sprinkleur', 'sprinklers'],
            'coupe-feu': ['coupe feu', 'coupefeu', 'pare-feu', 'parefeu'],
            'porte': ['portes', 'ouverture', 'ouvertures'],
            'escalier': ['escaliers', 'marche', 'marches'],
            'electrique': ['électrique', 'électriques', 'electriques'],
            'propane': ['gaz', 'bonbonne', 'bonbonnes', 'cylindre'],
            'manquant': ['manquante', 'manquants', 'manquantes', 'absent', 'absente', 'absents'],
            'defectueux': ['défectueux', 'défectueuse', 'defectueuse', 'brisé', 'brisée', 'cassé'],
            'obstrue': ['obstrué', 'obstruée', 'bloqué', 'bloquée', 'encombré'],
            'expire': ['expiré', 'expirée', 'périmé', 'périmée'],
        }
    
    def _normalize_text(self, text: str) -> str:
        """
        Normalise le texte pour la vectorisation:
        - Minuscules
        - Suppression des accents (optionnel pour TF-IDF)
        - Suppression de la ponctuation
        """
        if not text:
            return ""
        
        # Minuscules
        text = text.lower()
        
        # Garder les accents mais normaliser
        # text = unicodedata.normalize('NFKD', text).encode('ASCII', 'ignore').decode('utf-8')
        
        # Supprimer la ponctuation sauf les tirets (importants pour "coupe-feu")
        text = re.sub(r'[^\w\s\-]', ' ', text)
        
        # Normaliser les espaces multiples
        text = re.sub(r'\s+', ' ', text).strip()
        
        return text
    
    def _expand_synonymes(self, text: str) -> str:
        """
        Enrichit le texte avec les synonymes connus pour améliorer le matching.
        """
        text_lower = text.lower()
        expansions = []
        
        for terme_principal, variantes in self.synonymes.items():
            # Si le terme principal ou une variante est présent, ajouter toutes les variantes
            if terme_principal in text_lower:
                expansions.extend(variantes)
            else:
                for variante in variantes:
                    if variante in text_lower:
                        expansions.append(terme_principal)
                        expansions.extend([v for v in variantes if v != variante])
                        break
        
        if expansions:
            return text + " " + " ".join(set(expansions))
        return text
    
    def _build_article_text(self, article: dict) -> str:
        """
        Construit le texte représentatif d'un article pour la vectorisation.
        Combine le code, la description, la catégorie et les mots-clés.
        """
        parts = []
        
        # Code de l'article (ex: CNPI 6.2.1.1)
        if article.get("code_article"):
            parts.append(article["code_article"])
        
        # Catégorie (répétée pour plus de poids)
        if article.get("categorie"):
            parts.append(article["categorie"])
            parts.append(article["categorie"])  # Double poids pour la catégorie
        
        # Description standard (la partie la plus importante)
        if article.get("description_standard"):
            parts.append(article["description_standard"])
            parts.append(article["description_standard"])  # Double poids
        
        # Mots-clés additionnels si disponibles
        if article.get("mots_cles"):
            if isinstance(article["mots_cles"], list):
                parts.extend(article["mots_cles"])
            else:
                parts.append(str(article["mots_cles"]))
        
        # Actions correctives (contient souvent des mots-clés utiles)
        if article.get("actions_correctives"):
            if isinstance(article["actions_correctives"], list):
                parts.extend(article["actions_correctives"])
            else:
                parts.append(str(article["actions_correctives"]))
        
        text = " ".join(parts)
        text = self._expand_synonymes(text)
        return self._normalize_text(text)
    
    def fit(self, articles: List[dict]) -> None:
        """
        Entraîne le modèle TF-IDF sur les articles fournis.
        
        Args:
            articles: Liste des articles CNPI avec leurs métadonnées
        """
        if not articles:
            self.is_fitted = False
            return
        
        self.articles = articles
        
        # Construire les textes pour chaque article
        corpus = [self._build_article_text(article) for article in articles]
        
        # Créer le vectoriseur TF-IDF avec configuration optimisée
        self.vectorizer = TfidfVectorizer(
            analyzer='word',
            ngram_range=(1, 3),  # Unigrammes, bigrammes et trigrammes
            min_df=1,  # Minimum 1 document
            max_df=0.95,  # Maximum 95% des documents
            sublinear_tf=True,  # Appliquer log(1 + tf) pour atténuer les fréquences élevées
            strip_accents=None,  # Garder les accents
            lowercase=True,
        )
        
        # Vectoriser le corpus
        self.tfidf_matrix = self.vectorizer.fit_transform(corpus)
        self.is_fitted = True
    
    def predict(self, texte: str, limite: int = 10, seuil_confiance: float = 15.0) -> List[dict]:
        """
        Prédit les articles les plus pertinents pour le texte donné.
        
        Args:
            texte: Description de la non-conformité
            limite: Nombre maximum de résultats à retourner
            seuil_confiance: Score minimum pour inclure un résultat (0-100)
        
        Returns:
            Liste de dicts avec l'article, le score et la confiance
        """
        if not self.is_fitted or not texte or len(texte.strip()) < 3:
            return []
        
        # Normaliser et enrichir le texte d'entrée
        texte_enrichi = self._expand_synonymes(texte)
        texte_normalise = self._normalize_text(texte_enrichi)
        
        # Vectoriser le texte d'entrée
        query_vector = self.vectorizer.transform([texte_normalise])
        
        # Calculer la similarité cosinus avec tous les articles
        similarites = cosine_similarity(query_vector, self.tfidf_matrix).flatten()
        
        # Créer les résultats avec scores
        resultats = []
        for idx, score in enumerate(similarites):
            # Convertir en pourcentage (0-100)
            confiance = round(score * 100, 1)
            
            if confiance >= seuil_confiance:
                article = self.articles[idx]
                resultats.append({
                    "article": article,
                    "score": round(score * 100, 2),
                    "confiance": int(min(100, confiance)),
                    "methode": "ml_tfidf"
                })
        
        # Trier par score décroissant
        resultats.sort(key=lambda x: x["score"], reverse=True)
        
        return resultats[:limite]
    
    def predict_hybride(
        self, 
        texte: str, 
        resultats_keywords: List[dict],
        limite: int = 10,
        poids_ml: float = 0.6,
        poids_keywords: float = 0.4
    ) -> List[dict]:
        """
        Combine les résultats ML et mots-clés pour une prédiction hybride.
        
        Args:
            texte: Description de la non-conformité
            resultats_keywords: Résultats de l'algorithme par mots-clés
            limite: Nombre maximum de résultats
            poids_ml: Poids du score ML (0-1)
            poids_keywords: Poids du score mots-clés (0-1)
        
        Returns:
            Liste combinée et triée par score hybride
        """
        # Obtenir les résultats ML
        resultats_ml = self.predict(texte, limite=50, seuil_confiance=5.0)
        
        # Créer un dictionnaire pour combiner les scores
        scores_combines = {}
        
        # Ajouter les scores ML
        for r in resultats_ml:
            article_id = r["article"].get("id") or r["article"].get("code_article")
            scores_combines[article_id] = {
                "article": r["article"],
                "score_ml": r["score"],
                "score_keywords": 0,
                "mots_cles_trouves": []
            }
        
        # Ajouter/combiner les scores mots-clés
        for r in resultats_keywords:
            article_id = r["article"].get("id") or r["article"].get("code_article")
            if article_id in scores_combines:
                scores_combines[article_id]["score_keywords"] = r.get("confiance", r.get("score", 0))
                scores_combines[article_id]["mots_cles_trouves"] = r.get("mots_cles_trouves", [])
            else:
                scores_combines[article_id] = {
                    "article": r["article"],
                    "score_ml": 0,
                    "score_keywords": r.get("confiance", r.get("score", 0)),
                    "mots_cles_trouves": r.get("mots_cles_trouves", [])
                }
        
        # Calculer les scores hybrides
        resultats = []
        for article_id, data in scores_combines.items():
            score_hybride = (
                data["score_ml"] * poids_ml + 
                data["score_keywords"] * poids_keywords
            )
            
            if score_hybride > 10:  # Seuil minimum
                resultats.append({
                    "article": data["article"],
                    "score": round(score_hybride, 2),
                    "confiance": int(min(100, score_hybride)),
                    "score_ml": round(data["score_ml"], 1),
                    "score_keywords": round(data["score_keywords"], 1),
                    "mots_cles_trouves": data["mots_cles_trouves"],
                    "methode": "hybride"
                })
        
        # Trier par score décroissant
        resultats.sort(key=lambda x: x["score"], reverse=True)
        
        return resultats[:limite]


# Instance globale du prédicteur (singleton)
_predicteur_instance: Optional[PredicteurCNPI] = None


def get_predicteur() -> PredicteurCNPI:
    """Retourne l'instance singleton du prédicteur."""
    global _predicteur_instance
    if _predicteur_instance is None:
        _predicteur_instance = PredicteurCNPI()
    return _predicteur_instance


async def entrainer_predicteur(articles: List[dict]) -> bool:
    """
    Entraîne le prédicteur avec les articles fournis.
    
    Args:
        articles: Liste des articles CNPI du tenant
    
    Returns:
        True si l'entraînement a réussi, False sinon
    """
    try:
        predicteur = get_predicteur()
        predicteur.fit(articles)
        return predicteur.is_fitted
    except Exception as e:
        print(f"Erreur entraînement prédicteur: {e}")
        return False


def predire_articles_ml(texte: str, limite: int = 10) -> List[dict]:
    """
    Prédit les articles pertinents en utilisant uniquement le ML.
    
    Args:
        texte: Description de la non-conformité
        limite: Nombre maximum de résultats
    
    Returns:
        Liste des articles prédits avec leurs scores
    """
    predicteur = get_predicteur()
    if not predicteur.is_fitted:
        return []
    return predicteur.predict(texte, limite=limite)


def predire_articles_hybride(
    texte: str, 
    resultats_keywords: List[dict], 
    limite: int = 10
) -> List[dict]:
    """
    Prédit les articles en combinant ML et mots-clés.
    
    Args:
        texte: Description de la non-conformité
        resultats_keywords: Résultats de l'algorithme par mots-clés
        limite: Nombre maximum de résultats
    
    Returns:
        Liste combinée des articles prédits
    """
    predicteur = get_predicteur()
    if not predicteur.is_fitted:
        return resultats_keywords[:limite]  # Fallback aux mots-clés seuls
    return predicteur.predict_hybride(texte, resultats_keywords, limite=limite)
