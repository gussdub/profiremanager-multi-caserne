import React, { useState, useEffect } from 'react';
import { buildApiUrl, getTenantToken } from '../utils/api';

const RapportHeuresModal = ({ isOpen, onClose, tenantSlug }) => {
  const [modeSelection, setModeSelection] = useState('mois');
  const [moisSelectionne, setMoisSelectionne] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');

  // Imprimer (déclenche la boîte de dialogue d'impression système)
  const imprimer = async () => {
    try {
      let debut, fin;
      
      if (modeSelection === 'mois') {
        const [year, month] = moisSelectionne.split('-');
        debut = `${year}-${month}-01`;
        const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
        fin = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
      } else {
        debut = dateDebut;
        fin = dateFin;
      }
      
      const response = await fetch(
        buildApiUrl(tenantSlug, `/planning/rapport-heures/export-pdf?date_debut=${debut}&date_fin=${fin}`),
        {
          headers: {
            'Authorization': `Bearer ${getTenantToken()}`
          }
        }
      );
      
      if (!response.ok) throw new Error('Erreur génération rapport');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      // Créer un iframe caché pour déclencher l'impression
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = url;
      document.body.appendChild(iframe);
      
      // Attendre que le PDF soit chargé, puis déclencher l'impression
      iframe.onload = () => {
        try {
          iframe.contentWindow.print();
          // Nettoyer après un délai
          setTimeout(() => {
            document.body.removeChild(iframe);
            window.URL.revokeObjectURL(url);
          }, 1000);
        } catch (e) {
          console.error('Erreur impression:', e);
          document.body.removeChild(iframe);
          window.URL.revokeObjectURL(url);
        }
      };
      
    } catch (err) {
      console.error('Erreur PDF:', err);
      alert(`Erreur lors de la génération du PDF: ${err.message}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
      <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Rapport d'Heures</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Mode de sélection</label>
            <select
              value={modeSelection}
              onChange={(e) => setModeSelection(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="mois">Mois complet</option>
              <option value="periode">Période personnalisée</option>
            </select>
          </div>

          {modeSelection === 'mois' ? (
            <div>
              <label className="block text-sm font-medium mb-2">Mois</label>
              <input
                type="month"
                value={moisSelectionne}
                onChange={(e) => setMoisSelectionne(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium mb-2">Date de début</label>
                <input
                  type="date"
                  value={dateDebut}
                  onChange={(e) => setDateDebut(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Date de fin</label>
                <input
                  type="date"
                  value={dateFin}
                  onChange={(e) => setDateFin(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
            </>
          )}

          <div className="flex gap-3 pt-4">
            <button
              onClick={imprimer}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              🖨️ Imprimer
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RapportHeuresModal;