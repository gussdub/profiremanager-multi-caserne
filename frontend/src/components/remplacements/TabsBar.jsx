/**
 * Composant Onglets pour le module Remplacements
 * Affiche les onglets Propositions, Remplacements et Congés
 */

import React from 'react';

const TabsBar = ({
  activeTab,
  setActiveTab,
  propositionsCount,
  remplacementsCount,
  congesCount,
  quartsOuvertsCount
}) => {
  return (
    <div className="flex gap-2 mb-6 border-b border-gray-200 pb-2 flex-wrap">
      {/* Onglet Propositions reçues - Affiché en premier pour attirer l'attention */}
      {propositionsCount > 0 && (
        <button
          className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
            activeTab === 'propositions' ? 'bg-green-600 text-white' : 'bg-green-100 text-green-700 hover:bg-green-200'
          }`}
          style={{ animation: 'pulse 2s infinite' }}
          onClick={() => setActiveTab('propositions')}
          data-testid="tab-propositions"
        >
          Propositions recues ({propositionsCount})
        </button>
      )}
      {/* Onglet Quarts ouverts */}
      {quartsOuvertsCount > 0 && (
        <button
          className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
            activeTab === 'quarts_ouverts' ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
          }`}
          onClick={() => setActiveTab('quarts_ouverts')}
          data-testid="tab-quarts-ouverts"
        >
          Quarts disponibles ({quartsOuvertsCount})
        </button>
      )}
      <button
        className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
          activeTab === 'remplacements' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }`}
        onClick={() => setActiveTab('remplacements')}
        data-testid="tab-remplacements"
      >
        Remplacements ({remplacementsCount})
      </button>
      <button
        className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
          activeTab === 'conges' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }`}
        onClick={() => setActiveTab('conges')}
        data-testid="tab-conges"
      >
        Conges ({congesCount})
      </button>
    </div>
  );
};

export default TabsBar;
