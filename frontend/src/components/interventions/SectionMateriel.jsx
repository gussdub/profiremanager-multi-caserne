import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const SectionMateriel = ({ formData, setFormData, editMode, tenantSlug, getToken }) => {
  const [materielDisponible, setMaterielDisponible] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddMateriel, setShowAddMateriel] = useState(false);
  const [searchMateriel, setSearchMateriel] = useState('');
  
  const API = `${BACKEND_URL}/api/${tenantSlug}`;
  
  // Matériel utilisé dans cette intervention
  const materielUtilise = formData.materiel_utilise || [];
  
  // Charger le matériel disponible depuis Gestion des Actifs
  const loadMaterielDisponible = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API}/actifs/materiels`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        const data = await response.json();
        setMaterielDisponible(data || []);
      }
    } catch (error) {
      console.error('Erreur chargement matériel:', error);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    if (showAddMateriel && materielDisponible.length === 0) {
      loadMaterielDisponible();
    }
  }, [showAddMateriel]);
  
  // Ajouter du matériel
  const ajouterMateriel = (materiel) => {
    const existing = materielUtilise.find(m => m.id === materiel.id);
    if (existing) {
      // Incrémenter la quantité
      const updated = materielUtilise.map(m => 
        m.id === materiel.id ? { ...m, quantite: (m.quantite || 1) + 1 } : m
      );
      setFormData({ ...formData, materiel_utilise: updated });
    } else {
      // Ajouter nouveau
      const nouveau = {
        id: materiel.id,
        nom: materiel.nom || materiel.designation,
        type: materiel.type || materiel.categorie,
        numero_serie: materiel.numero_serie || materiel.code_unique,
        quantite: 1,
        gerer_quantite: materiel.gerer_quantite || materiel.est_consommable || false,
        stock_disponible: materiel.quantite || materiel.quantite_disponible,
        est_apria: (materiel.nom || materiel.designation || '').toLowerCase().includes('apria'),
        notes: ''
      };
      setFormData({ ...formData, materiel_utilise: [...materielUtilise, nouveau] });
    }
  };
  
  // Modifier quantité
  const modifierQuantite = (materielId, quantite) => {
    if (quantite < 1) {
      // Supprimer si quantité = 0
      const updated = materielUtilise.filter(m => m.id !== materielId);
      setFormData({ ...formData, materiel_utilise: updated });
    } else {
      const updated = materielUtilise.map(m => 
        m.id === materielId ? { ...m, quantite } : m
      );
      setFormData({ ...formData, materiel_utilise: updated });
    }
  };
  
  // Modifier notes
  const modifierNotes = (materielId, notes) => {
    const updated = materielUtilise.map(m => 
      m.id === materielId ? { ...m, notes } : m
    );
    setFormData({ ...formData, materiel_utilise: updated });
  };
  
  // Supprimer matériel
  const supprimerMateriel = (materielId) => {
    const updated = materielUtilise.filter(m => m.id !== materielId);
    setFormData({ ...formData, materiel_utilise: updated });
  };
  
  // Filtrer le matériel disponible
  const materielFiltre = materielDisponible.filter(m => {
    if (!searchMateriel) return true;
    const search = searchMateriel.toLowerCase();
    return (m.nom || m.designation || '').toLowerCase().includes(search) ||
           (m.type || m.categorie || '').toLowerCase().includes(search) ||
           (m.numero_serie || '').toLowerCase().includes(search);
  });
  
  // Stats
  const totalItems = materielUtilise.reduce((sum, m) => sum + (m.quantite || 1), 0);
  const bouteillesAPRIA = materielUtilise.filter(m => m.est_apria);
  const consommablesUtilises = materielUtilise.filter(m => m.gerer_quantite);
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="bg-amber-50">
          <CardTitle className="text-lg text-amber-800 flex justify-between items-center">
            <span>🧰 Matériel utilisé ({totalItems} item{totalItems > 1 ? 's' : ''})</span>
            {editMode && (
              <Button size="sm" variant="outline" onClick={() => setShowAddMateriel(true)}>
                + Ajouter matériel
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {materielUtilise.length === 0 ? (
            <p className="text-gray-500 text-center py-4">Aucun matériel enregistré pour cette intervention</p>
          ) : (
            <div className="space-y-3">
              {materielUtilise.map(mat => (
                <div key={mat.id} className={`p-3 rounded-lg border ${mat.est_apria ? 'bg-blue-50 border-blue-200' : mat.gerer_quantite ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-medium flex-1 min-w-[150px]">
                      {mat.nom}
                      {mat.est_apria && <span className="ml-2 text-xs bg-blue-200 text-blue-800 px-2 py-0.5 rounded">APRIA</span>}
                      {mat.gerer_quantite && <span className="ml-2 text-xs bg-orange-200 text-orange-800 px-2 py-0.5 rounded">📦 Stock géré</span>}
                    </span>
                    <span className="text-gray-500 text-sm">{mat.type}</span>
                    {mat.numero_serie && <span className="text-gray-400 text-xs">#{mat.numero_serie}</span>}
                    {mat.stock_disponible !== undefined && mat.gerer_quantite && (
                      <span className="text-xs text-gray-500">(Stock: {mat.stock_disponible})</span>
                    )}
                    
                    {editMode ? (
                      <>
                        <div className="flex items-center gap-1">
                          <button 
                            onClick={() => modifierQuantite(mat.id, (mat.quantite || 1) - 1)}
                            className="w-6 h-6 bg-gray-200 rounded hover:bg-gray-300"
                          >-</button>
                          <span className="w-8 text-center font-bold">{mat.quantite || 1}</span>
                          <button 
                            onClick={() => modifierQuantite(mat.id, (mat.quantite || 1) + 1)}
                            className="w-6 h-6 bg-gray-200 rounded hover:bg-gray-300"
                          >+</button>
                        </div>
                        <button 
                          onClick={() => supprimerMateriel(mat.id)}
                          className="text-red-500 hover:text-red-700"
                        >🗑️</button>
                      </>
                    ) : (
                      <span className="font-bold">x{mat.quantite || 1}</span>
                    )}
                  </div>
                  
                  {/* Notes */}
                  {editMode ? (
                    <input
                      type="text"
                      value={mat.notes || ''}
                      onChange={(e) => modifierNotes(mat.id, e.target.value)}
                      placeholder="Notes (état, remarques...)"
                      className="w-full mt-2 text-sm border rounded p-1"
                    />
                  ) : mat.notes && (
                    <p className="text-sm text-gray-600 mt-1">📝 {mat.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Résumé APRIA pour facturation */}
      {bouteillesAPRIA.length > 0 && (
        <Card>
          <CardHeader className="bg-blue-50">
            <CardTitle className="text-lg text-blue-800">
              🫁 Bouteilles APRIA ({bouteillesAPRIA.reduce((s, b) => s + (b.quantite || 1), 0)} recharges à facturer)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <p className="text-sm text-gray-600 mb-3">
              Ces bouteilles seront incluses dans la facturation d'entraide si applicable.
            </p>
            <div className="space-y-1">
              {bouteillesAPRIA.map(b => (
                <div key={b.id} className="flex justify-between text-sm">
                  <span>{b.nom} {b.numero_serie && `(#${b.numero_serie})`}</span>
                  <span className="font-medium">{b.quantite || 1} recharge(s)</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Modal Ajout Matériel */}
      {showAddMateriel && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{ zIndex: 100001 }}>
          <div className="bg-white rounded-lg p-6 max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col">
            <h3 className="text-lg font-bold mb-4">🧰 Ajouter du matériel</h3>
            
            <input
              type="text"
              placeholder="🔍 Rechercher par nom, type, numéro de série..."
              value={searchMateriel}
              onChange={(e) => setSearchMateriel(e.target.value)}
              className="w-full border rounded p-2 mb-4"
            />
            
            {loading ? (
              <p className="text-center py-4">Chargement...</p>
            ) : materielFiltre.length === 0 ? (
              <p className="text-center py-4 text-gray-500">
                {materielDisponible.length === 0 
                  ? "Aucun matériel trouvé. Ajoutez du matériel dans Gestion des Actifs."
                  : "Aucun résultat pour cette recherche"
                }
              </p>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-2">
                {materielFiltre.slice(0, 50).map(mat => {
                  const dejaAjoute = materielUtilise.find(m => m.id === mat.id);
                  return (
                    <div 
                      key={mat.id} 
                      className={`p-3 rounded border cursor-pointer hover:bg-gray-50 flex justify-between items-center ${dejaAjoute ? 'bg-green-50 border-green-200' : ''}`}
                      onClick={() => ajouterMateriel(mat)}
                    >
                      <div>
                        <span className="font-medium">{mat.nom || mat.designation}</span>
                        <span className="text-gray-500 text-sm ml-2">({mat.type || mat.categorie})</span>
                        {mat.numero_serie && <span className="text-gray-400 text-xs ml-2">#{mat.numero_serie}</span>}
                      </div>
                      {dejaAjoute ? (
                        <span className="text-green-600 text-sm">✓ Ajouté (x{dejaAjoute.quantite})</span>
                      ) : (
                        <span className="text-blue-600 text-sm">+ Ajouter</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            
            <div className="flex justify-end mt-4 pt-3 border-t">
              <Button variant="outline" onClick={() => setShowAddMateriel(false)}>
                Fermer
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default SectionMateriel;
