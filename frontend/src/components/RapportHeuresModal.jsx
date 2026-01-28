import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { apiGet, getTenantToken, buildApiUrl } from '../utils/api';
import useModalScrollLock from '../hooks/useModalScrollLock';

const RapportHeuresModal = ({ isOpen, onClose, tenantSlug }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  
  // Bloquer le scroll du body quand la modale est ouverte
  useModalScrollLock(isOpen);
  // États pour les filtres
  const [modeSelection, setModeSelection] = useState('mois'); // 'mois' ou 'periode'
  const [moisSelectionne, setMoisSelectionne] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  
  // États pour le tri
  const [sortField, setSortField] = useState('nom'); // 'nom', 'heures_internes', 'heures_externes', 'total_heures'
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc' ou 'desc'
  
  // Charger les données
  const chargerRapport = async () => {
    if (!tenantSlug) {
      setError('Tenant non défini');
      return;
    }
    
    try {
      setLoading(true);
      setError('');
      
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
      
      if (!debut || !fin) {
        setError('Veuillez sélectionner une période');
        return;
      }
      
      const response = await apiGet(tenantSlug, `/planning/rapport-heures?date_debut=${debut}&date_fin=${fin}`);
      setData(response);
    } catch (err) {
      setError(err.message || 'Erreur lors du chargement du rapport');
    } finally {
      setLoading(false);
    }
  };
  
  // Charger au montage et quand les filtres changent
  useEffect(() => {
    if (isOpen) {
      chargerRapport();
    }
  }, [isOpen, moisSelectionne, dateDebut, dateFin, modeSelection]);
  
  // Export Excel
  const exporterExcel = async () => {
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
      
      // Construire l'URL relative (le proxy Kubernetes gérera la redirection)
      const url = `/api/${tenantSlug}/planning/rapport-heures/export-excel?date_debut=${debut}&date_fin=${fin}`;
      const token = getTenantToken();
      
      console.log('Export Excel URL:', url);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      console.log('Response status:', response.status);
      
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }
      
      const blob = await response.blob();
      console.log('Blob size:', blob.size);
      
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `rapport_heures_${debut}_${fin}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error('Erreur export Excel:', err);
      alert(`Erreur lors de l'export Excel: ${err.message}`);
    }
  };
  
  // Imprimer (déclenche le dialogue d'impression natif)
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
  
  // Fonction pour gérer le tri
  const handleSort = (field) => {
    if (sortField === field) {
      // Inverser l'ordre si on clique sur la même colonne
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Nouvelle colonne, ordre ascendant par défaut
      setSortField(field);
      setSortOrder('asc');
    }
  };
  
  // Fonction pour trier les employés
  const getSortedEmployes = () => {
    if (!data || !data.employes) return [];
    
    const employes = [...data.employes];
    
    employes.sort((a, b) => {
      let valA, valB;
      
      switch(sortField) {
        case 'nom':
          valA = a.nom_complet.toLowerCase();
          valB = b.nom_complet.toLowerCase();
          break;
        case 'heures_internes':
          valA = a.heures_internes;
          valB = b.heures_internes;
          break;
        case 'heures_externes':
          valA = a.heures_externes;
          valB = b.heures_externes;
          break;
        case 'total_heures':
          valA = a.total_heures;
          valB = b.total_heures;
          break;
        default:
          return 0;
      }
      
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    
    return employes;
  };
  
  // Icône de tri
  const SortIcon = ({ field }) => {
    if (sortField !== field) {
      return <span className="ml-1 text-white opacity-50">↕️</span>;
    }
    return <span className="ml-1 text-white">{sortOrder === 'asc' ? '↑' : '↓'}</span>;
  };
  
  if (!isOpen) return null;
  
  return createPortal(
    <div 
      className="modal-overlay" 
      style={{ zIndex: 100000 }}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-800">📊 Rapport d&apos;Heures</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
          >
            ×
          </button>
        </div>
        
        {/* Filtres */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex gap-4 items-end flex-wrap">
            {/* Sélecteur de mode */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type de période
              </label>
              <select
                value={modeSelection}
                onChange={(e) => setModeSelection(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
              >
                <option value="mois">Par mois</option>
                <option value="periode">Période personnalisée</option>
              </select>
            </div>
            
            {/* Sélecteur de mois */}
            {modeSelection === 'mois' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mois
                </label>
                <select
                  value={moisSelectionne}
                  onChange={(e) => setMoisSelectionne(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 min-w-[200px]"
                >
                  {/* Générer mois prochain + 12 derniers mois */}
                  {Array.from({ length: 13 }, (_, i) => {
                    const date = new Date();
                    // Mois prochain (i=0), mois actuel (i=1), puis mois précédents
                    date.setMonth(date.getMonth() + 1 - i);
                    const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                    const label = date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
                    const displayLabel = i === 0 
                      ? `${label.charAt(0).toUpperCase() + label.slice(1)} (Planifié)` 
                      : label.charAt(0).toUpperCase() + label.slice(1);
                    return (
                      <option key={yearMonth} value={yearMonth}>
                        {displayLabel}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
            
            {/* Sélecteur de période personnalisée */}
            {modeSelection === 'periode' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date début
                  </label>
                  <input
                    type="date"
                    value={dateDebut}
                    onChange={(e) => setDateDebut(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date fin
                  </label>
                  <input
                    type="date"
                    value={dateFin}
                    onChange={(e) => setDateFin(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </>
            )}
            
            {/* Boutons d'actions */}
            <div className="flex gap-2 ml-auto">
              <button
                onClick={exporterExcel}
                disabled={!data || loading}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                📊 Export Excel
              </button>
              <button
                onClick={imprimer}
                disabled={!data || loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                🖨️ Imprimer
              </button>
            </div>
          </div>
        </div>
        
        {/* Contenu */}
        <div className="flex-1 overflow-auto p-6">
          {loading && (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
              <p className="mt-2 text-gray-600">Chargement...</p>
            </div>
          )}
          
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
              {error}
            </div>
          )}
          
          {data && !loading && (
            <>
              {/* Note d'information */}
              <div className="bg-blue-50 border-l-4 border-blue-500 p-3 mb-4 text-sm">
                <p className="text-blue-800">
                  <strong>ℹ️ Note:</strong> Ce rapport affiche les heures <strong>réellement assignées</strong> durant la période sélectionnée, 
                  indépendamment des limites hebdomadaires ou des paramètres d&apos;heures supplémentaires.
                </p>
              </div>
              
              {/* Statistiques */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                  <div style={{fontSize: '10px', color: '#2563EB', fontWeight: '600', marginBottom: '4px'}}>
                    Total H. Planifiées
                  </div>
                  <div className="text-2xl font-bold text-blue-900">{data.statistiques.total_heures_planifiees}h</div>
                </div>
                <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                  <div style={{fontSize: '10px', color: '#16A34A', fontWeight: '600', marginBottom: '4px'}}>
                    Moy. H. Internes
                  </div>
                  <div className="text-2xl font-bold text-green-900">{data.statistiques.moyenne_heures_internes}h</div>
                </div>
                <div className="bg-purple-50 p-3 rounded-lg border border-purple-200">
                  <div style={{fontSize: '10px', color: '#9333EA', fontWeight: '600', marginBottom: '4px'}}>
                    Moy. H. Externes
                  </div>
                  <div className="text-2xl font-bold text-purple-900">{data.statistiques.moyenne_heures_externes}h</div>
                </div>
              </div>
              
              {/* Tableau */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-red-600">
                    <tr>
                      <th 
                        className="px-4 py-3 text-left text-xs font-medium text-white uppercase tracking-wider cursor-pointer hover:bg-red-700 transition-colors"
                        onClick={() => handleSort('nom')}
                        title="Cliquer pour trier"
                      >
                        <div className="flex items-center justify-start">
                          Employé
                          <SortIcon field="nom" />
                        </div>
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">
                        Grade
                      </th>
                      <th 
                        className="px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider cursor-pointer hover:bg-red-700 transition-colors"
                        onClick={() => handleSort('heures_internes')}
                        title="Cliquer pour trier"
                      >
                        <div className="flex items-center justify-center">
                          H. Internes
                          <SortIcon field="heures_internes" />
                        </div>
                      </th>
                      <th 
                        className="px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider cursor-pointer hover:bg-red-700 transition-colors"
                        onClick={() => handleSort('heures_externes')}
                        title="Cliquer pour trier"
                      >
                        <div className="flex items-center justify-center">
                          H. Externes
                          <SortIcon field="heures_externes" />
                        </div>
                      </th>
                      <th 
                        className="px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider cursor-pointer hover:bg-red-700 transition-colors"
                        onClick={() => handleSort('total_heures')}
                        title="Cliquer pour trier"
                      >
                        <div className="flex items-center justify-center">
                          Total
                          <SortIcon field="total_heures" />
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {getSortedEmployes().map((emp, index) => (
                      <tr key={emp.user_id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                          {emp.nom_complet}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 text-center">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            emp.type_emploi === 'Temps plein'
                              ? 'bg-green-100 text-green-800' 
                              : emp.type_emploi === 'Temps partiel'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-orange-100 text-orange-800'
                          }`}>
                            {emp.type_emploi || 'Non défini'}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 text-center">
                          {emp.grade}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 text-center">
                          {emp.heures_internes}h
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 text-center">
                          {emp.heures_externes}h
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-gray-900 text-center">
                          {emp.total_heures}h
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {data.employes.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  Aucun employé trouvé
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default RapportHeuresModal;
