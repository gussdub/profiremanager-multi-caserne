import React, { useState, useEffect, useRef, useCallback } from 'react';
import { apiPost } from '../../utils/api';
import { Badge } from './badge';
import { X, Search, FileText, AlertTriangle, Clock, CheckCircle2 } from 'lucide-react';

/**
 * Composant de prédiction d'articles basé sur le texte saisi
 * Affiche une liste déroulante avec les articles suggérés et leur score de confiance
 */
const ArticlePrediction = ({ 
  tenantSlug, 
  texte,  // Le texte à analyser (titre + description)
  onSelectArticle,  // Callback quand un article est sélectionné
  selectedArticles = [],  // Articles déjà sélectionnés
  onRemoveArticle,  // Callback pour retirer un article
  placeholder = "Les articles seront suggérés automatiquement...",
  className = ""
}) => {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [error, setError] = useState(null);
  const containerRef = useRef(null);
  const debounceRef = useRef(null);

  // Fermer le dropdown quand on clique ailleurs
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Effet de debounce pour éviter trop d'appels API
  const fetchPredictions = useCallback(async (text) => {
    if (!text || text.trim().length < 3) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const result = await apiPost(tenantSlug, '/prevention/ref-violations/predire', {
        texte: text,
        limite: 15
      });
      
      // Filtrer les articles déjà sélectionnés
      const selectedIds = selectedArticles.map(a => a.id);
      const filteredSuggestions = (result.suggestions || []).filter(
        s => !selectedIds.includes(s.id)
      );
      
      setSuggestions(filteredSuggestions);
      setShowDropdown(filteredSuggestions.length > 0);
    } catch (err) {
      console.error('Erreur prédiction:', err);
      setError("Impossible de charger les suggestions");
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, selectedArticles]);

  // Déclencher la prédiction quand le texte change
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    debounceRef.current = setTimeout(() => {
      fetchPredictions(texte);
    }, 300); // Debounce de 300ms

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [texte, fetchPredictions]);

  const handleSelect = (article) => {
    onSelectArticle(article);
    setShowDropdown(false);
  };

  const getConfianceColor = (confiance) => {
    if (confiance >= 70) return 'bg-green-100 text-green-800 border-green-300';
    if (confiance >= 40) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    return 'bg-gray-100 text-gray-800 border-gray-300';
  };

  const getSeveriteIcon = (severite) => {
    switch (severite) {
      case 'urgente': return <AlertTriangle className="w-3 h-3 text-red-500" />;
      case 'majeure': return <Clock className="w-3 h-3 text-orange-500" />;
      default: return <CheckCircle2 className="w-3 h-3 text-blue-500" />;
    }
  };

  const getSeveriteBadge = (severite) => {
    const colors = {
      urgente: 'bg-red-100 text-red-700',
      majeure: 'bg-orange-100 text-orange-700',
      mineure: 'bg-blue-100 text-blue-700'
    };
    return colors[severite] || colors.mineure;
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Articles sélectionnés */}
      {selectedArticles.length > 0 && (
        <div className="mb-3 space-y-2">
          <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Articles sélectionnés ({selectedArticles.length})
          </label>
          <div className="flex flex-wrap gap-2">
            {selectedArticles.map((article) => (
              <div 
                key={article.id}
                className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm"
              >
                <span className="font-mono font-semibold text-red-700">
                  {article.code_article}
                </span>
                <span className={`px-1.5 py-0.5 rounded text-xs ${getSeveriteBadge(article.severite)}`}>
                  {article.delai_jours}j
                </span>
                {onRemoveArticle && (
                  <button
                    type="button"
                    onClick={() => onRemoveArticle(article.id)}
                    className="ml-1 text-red-400 hover:text-red-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Zone de suggestions */}
      <div className="relative">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
          <Search className="w-4 h-4" />
          <span>Suggestions d'articles basées sur votre description</span>
          {loading && (
            <span className="ml-2 text-blue-500 animate-pulse">Analyse en cours...</span>
          )}
        </div>

        {/* Message si pas assez de texte */}
        {(!texte || texte.trim().length < 3) && (
          <div className="text-sm text-gray-400 italic p-3 bg-gray-50 rounded-lg border border-dashed">
            {placeholder}
          </div>
        )}

        {/* Dropdown des suggestions */}
        {showDropdown && suggestions.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto">
            <div className="p-2 bg-gray-50 border-b text-xs text-gray-500 sticky top-0">
              {suggestions.length} article(s) suggéré(s) - Cliquez pour ajouter
            </div>
            {suggestions.map((suggestion) => (
              <div
                key={suggestion.id}
                onClick={() => handleSelect(suggestion)}
                className="p-3 hover:bg-blue-50 cursor-pointer border-b last:border-b-0 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {getSeveriteIcon(suggestion.severite)}
                      <span className="font-mono font-semibold text-gray-900">
                        {suggestion.code_article}
                      </span>
                      <Badge variant="outline" className={getSeveriteBadge(suggestion.severite)}>
                        {suggestion.severite}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        ({suggestion.delai_jours} jours)
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-2">
                      {suggestion.description_standard}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-600">
                        {suggestion.categorie}
                      </span>
                      {suggestion.mots_cles_trouves?.length > 0 && (
                        <span className="text-xs text-gray-400">
                          Mots-clés: {suggestion.mots_cles_trouves.slice(0, 3).join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <div className={`px-2 py-1 rounded-full text-xs font-semibold border ${getConfianceColor(suggestion.confiance)}`}>
                      {suggestion.confiance}%
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Message si aucune suggestion */}
        {texte && texte.trim().length >= 3 && !loading && suggestions.length === 0 && !error && (
          <div className="text-sm text-gray-400 italic p-3 bg-gray-50 rounded-lg">
            Aucun article suggéré pour ce texte. Vous pouvez sélectionner manuellement un article.
          </div>
        )}

        {/* Erreur */}
        {error && (
          <div className="text-sm text-red-500 p-3 bg-red-50 rounded-lg">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default ArticlePrediction;
