import React, { useState, useEffect } from 'react';
import { apiGet } from '../utils/api';

const RapportHeuresModal = ({ isOpen, onClose, tenantSlug }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  
  // États pour les filtres
  const [modeSelection, setModeSelection] = useState('mois'); // 'mois' ou 'periode'
  const [moisSelectionne, setMoisSelectionne] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  
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
  const exporterExcel = () => {
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
    
    const url = `${process.env.REACT_APP_BACKEND_URL}/${tenantSlug}/planning/rapport-heures/export-excel?date_debut=${debut}&date_fin=${fin}`;
    const token = localStorage.getItem('token');
    
    fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
      .then(response => response.blob())
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rapport_heures_${debut}_${fin}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      })
      .catch(err => alert("Erreur lors de l'export Excel"));
  };
  
  // Imprimer (ouvre le PDF)
  const imprimer = () => {
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
    
    const url = `${process.env.REACT_APP_BACKEND_URL}/${tenantSlug}/planning/rapport-heures/export-pdf?date_debut=${debut}&date_fin=${fin}`;
    const token = localStorage.getItem('token');
    
    fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
      .then(response => response.blob())
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        window.open(url, '_blank');
      })
      .catch(err => alert('Erreur lors de la génération du PDF'));
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
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
                  {/* Générer les 12 derniers mois */}
                  {Array.from({ length: 12 }, (_, i) => {
                    const date = new Date();
                    date.setMonth(date.getMonth() - i);
                    const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                    const label = date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
                    return (
                      <option key={yearMonth} value={yearMonth}>
                        {label.charAt(0).toUpperCase() + label.slice(1)}
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <div className="text-xs text-blue-600 font-medium leading-tight mb-2">
                    Total Heures<br/>Planifiées
                  </div>
                  <div className="text-2xl font-bold text-blue-900">{data.statistiques.total_heures_planifiees}h</div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <div className="text-xs text-green-600 font-medium leading-tight mb-2">
                    Moyenne Heures<br/>Internes
                  </div>
                  <div className="text-2xl font-bold text-green-900">{data.statistiques.moyenne_heures_internes}h</div>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                  <div className="text-xs text-purple-600 font-medium leading-tight mb-2">
                    Moyenne Heures<br/>Externes
                  </div>
                  <div className="text-2xl font-bold text-purple-900">{data.statistiques.moyenne_heures_externes}h</div>
                </div>
              </div>
              
              {/* Tableau */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-red-600">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                        Employé
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">
                        Grade
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">
                        H. Internes
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">
                        H. Externes
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {data.employes.map((emp, index) => (
                      <tr key={emp.user_id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                          {emp.nom_complet}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 text-center">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            emp.type_emploi === 'temps_partiel' 
                              ? 'bg-yellow-100 text-yellow-800' 
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {emp.type_emploi === 'temps_partiel' ? 'TP' : 'TF'}
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
    </div>
  );
};

export default RapportHeuresModal;
