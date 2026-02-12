/**
 * FaussesAlarmesView - Vue des fausses alarmes récurrentes
 * 
 * Affiche la liste des adresses avec des fausses alarmes et permet:
 * - De voir le compteur par adresse
 * - De créer des suggestions de facture
 * - D'exempter une adresse
 */

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const FaussesAlarmesView = ({ tenantSlug, getToken, toast }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ fausses_alarmes: [], config: {}, total_adresses: 0, total_a_facturer: 0 });
  const [selectedAdresse, setSelectedAdresse] = useState(null);
  const [showFactureModal, setShowFactureModal] = useState(false);
  const [showExemptionModal, setShowExemptionModal] = useState(false);
  const [factureForm, setFactureForm] = useState({
    responsable_nom: '',
    responsable_adresse: '',
    responsable_telephone: '',
    responsable_courriel: '',
    montant: 0,
    notes: ''
  });
  const [exemptionRaison, setExemptionRaison] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${BACKEND_URL}/api/${tenantSlug}/interventions/fausses-alarmes`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error('Erreur chargement fausses alarmes:', error);
      toast({ title: "Erreur", description: "Impossible de charger les données", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [tenantSlug]);

  const getStatutBadge = (item) => {
    const { statut_facturation, count, seuil } = item;
    
    if (statut_facturation === 'exempte') {
      return <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-600">Exempté</span>;
    }
    if (statut_facturation === 'facture') {
      return <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-700">Facturé</span>;
    }
    if (count > seuil) {
      return <span className="px-2 py-1 text-xs rounded bg-red-100 text-red-700">À facturer</span>;
    }
    if (count >= seuil) {
      return <span className="px-2 py-1 text-xs rounded bg-yellow-100 text-yellow-700">À surveiller</span>;
    }
    return <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-700">OK</span>;
  };

  const handleFacturer = async () => {
    if (!selectedAdresse) return;
    
    try {
      const response = await fetch(
        `${BACKEND_URL}/api/${tenantSlug}/interventions/fausses-alarmes/${selectedAdresse.id}/facturer`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${getToken()}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ...factureForm,
            montant: selectedAdresse.montant_a_facturer || factureForm.montant
          })
        }
      );
      
      if (response.ok) {
        toast({ title: "Succès", description: "Suggestion de facture créée" });
        setShowFactureModal(false);
        setSelectedAdresse(null);
        fetchData();
      } else {
        throw new Error('Erreur création facture');
      }
    } catch (error) {
      toast({ title: "Erreur", description: "Impossible de créer la facture", variant: "destructive" });
    }
  };

  const handleExempter = async () => {
    if (!selectedAdresse) return;
    
    try {
      const response = await fetch(
        `${BACKEND_URL}/api/${tenantSlug}/interventions/fausses-alarmes/${selectedAdresse.id}/exempter`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${getToken()}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ raison: exemptionRaison })
        }
      );
      
      if (response.ok) {
        toast({ title: "Succès", description: "Adresse exemptée" });
        setShowExemptionModal(false);
        setSelectedAdresse(null);
        fetchData();
      } else {
        throw new Error('Erreur exemption');
      }
    } catch (error) {
      toast({ title: "Erreur", description: "Impossible d'exempter l'adresse", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête avec stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">{data.total_adresses}</div>
              <div className="text-sm text-gray-500">Adresses avec alarmes</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-red-600">{data.total_a_facturer}</div>
              <div className="text-sm text-gray-500">À facturer</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-600">{data.config?.seuil_gratuit || 3}</div>
              <div className="text-sm text-gray-500">Seuil gratuit</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">
                {data.config?.type_facturation === 'fixe' 
                  ? `${data.config?.montant_fixe || 500}$`
                  : 'Progressif'}
              </div>
              <div className="text-sm text-gray-500">Type facturation</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Configuration info */}
      {!data.config?.actif && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-800">
            ⚠️ La facturation des fausses alarmes n'est pas activée. 
            Activez-la dans les <strong>Paramètres du module Interventions</strong>.
          </p>
        </div>
      )}

      {/* Liste des adresses */}
      <Card>
        <CardHeader>
          <CardTitle>🚨 Adresses avec fausses alarmes</CardTitle>
        </CardHeader>
        <CardContent>
          {data.fausses_alarmes.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Aucune fausse alarme enregistrée</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-3 text-left">Adresse</th>
                    <th className="p-3 text-center">Compteur</th>
                    <th className="p-3 text-center">Statut</th>
                    <th className="p-3 text-center">Montant</th>
                    <th className="p-3 text-center">Dernière alarme</th>
                    <th className="p-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.fausses_alarmes.map((item) => (
                    <tr key={item.id} className="border-b hover:bg-gray-50">
                      <td className="p-3">
                        <div className="font-medium">{item.adresse}</div>
                        {item.batiment_nom && (
                          <div className="text-xs text-blue-600">🏢 {item.batiment_nom}</div>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`font-bold text-lg ${item.count > item.seuil ? 'text-red-600' : 'text-gray-700'}`}>
                          {item.count}
                        </span>
                        <span className="text-gray-400 text-sm">/{item.seuil}</span>
                      </td>
                      <td className="p-3 text-center">
                        {getStatutBadge(item)}
                      </td>
                      <td className="p-3 text-center">
                        {item.montant_a_facturer > 0 ? (
                          <span className="font-bold text-red-600">{item.montant_a_facturer}$</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="p-3 text-center text-gray-500">
                        {item.derniere_alarme 
                          ? new Date(item.derniere_alarme).toLocaleDateString('fr-CA')
                          : '-'}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex gap-2 justify-center">
                          {item.statut_facturation === 'a_facturer' && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                setSelectedAdresse(item);
                                setFactureForm({ ...factureForm, montant: item.montant_a_facturer });
                                setShowFactureModal(true);
                              }}
                            >
                              Facturer
                            </Button>
                          )}
                          {item.statut_facturation !== 'exempte' && item.statut_facturation !== 'facture' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedAdresse(item);
                                setShowExemptionModal(true);
                              }}
                            >
                              Exempter
                            </Button>
                          )}
                          {item.exemption && (
                            <span className="text-xs text-gray-500" title={item.exemption.raison}>
                              Exempté le {new Date(item.exemption.date).toLocaleDateString('fr-CA')}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Facturation */}
      {showFactureModal && selectedAdresse && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-bold mb-4">💰 Créer une suggestion de facture</h3>
            <p className="text-sm text-gray-600 mb-4">
              Adresse: <strong>{selectedAdresse.adresse}</strong><br />
              Montant suggéré: <strong>{selectedAdresse.montant_a_facturer}$</strong>
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Nom du responsable</label>
                <input
                  type="text"
                  value={factureForm.responsable_nom}
                  onChange={(e) => setFactureForm({ ...factureForm, responsable_nom: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="Nom complet ou entreprise"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Adresse de facturation</label>
                <input
                  type="text"
                  value={factureForm.responsable_adresse}
                  onChange={(e) => setFactureForm({ ...factureForm, responsable_adresse: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Téléphone</label>
                  <input
                    type="tel"
                    value={factureForm.responsable_telephone}
                    onChange={(e) => setFactureForm({ ...factureForm, responsable_telephone: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Courriel</label>
                  <input
                    type="email"
                    value={factureForm.responsable_courriel}
                    onChange={(e) => setFactureForm({ ...factureForm, responsable_courriel: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Notes</label>
                <textarea
                  value={factureForm.notes}
                  onChange={(e) => setFactureForm({ ...factureForm, notes: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  rows={3}
                />
              </div>
            </div>
            
            <div className="flex gap-2 mt-6">
              <Button variant="outline" onClick={() => setShowFactureModal(false)} className="flex-1">
                Annuler
              </Button>
              <Button onClick={handleFacturer} className="flex-1 bg-red-600 hover:bg-red-700">
                Créer la facture
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Exemption */}
      {showExemptionModal && selectedAdresse && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-bold mb-4">⚖️ Exempter de facturation</h3>
            <p className="text-sm text-gray-600 mb-4">
              Adresse: <strong>{selectedAdresse.adresse}</strong>
            </p>
            
            <div>
              <label className="block text-sm font-medium mb-1">Raison de l'exemption</label>
              <textarea
                value={exemptionRaison}
                onChange={(e) => setExemptionRaison(e.target.value)}
                className="w-full border rounded px-3 py-2"
                rows={3}
                placeholder="Expliquez pourquoi cette adresse est exemptée..."
              />
            </div>
            
            <div className="flex gap-2 mt-6">
              <Button variant="outline" onClick={() => setShowExemptionModal(false)} className="flex-1">
                Annuler
              </Button>
              <Button onClick={handleExempter} className="flex-1">
                Confirmer l'exemption
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FaussesAlarmesView;
