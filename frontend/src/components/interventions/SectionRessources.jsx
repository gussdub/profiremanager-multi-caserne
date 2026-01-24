import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const SectionRessources = ({ vehicles, resources, formData, setFormData, editMode, tenantSlug, interventionId, onRefresh }) => {
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [showAddPersonnel, setShowAddPersonnel] = useState(false);
  const [users, setUsers] = useState([]);
  const [tenantVehicles, setTenantVehicles] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [newVehicle, setNewVehicle] = useState({ number: '', crew_count: '' });
  const [selectedPersonnel, setSelectedPersonnel] = useState([]);
  const [searchPersonnel, setSearchPersonnel] = useState('');
  const [gardeInterneUsers, setGardeInterneUsers] = useState([]);
  const [equipesGarde, setEquipesGarde] = useState([]);
  const [showImportEquipe, setShowImportEquipe] = useState(false);
  const [primeRepasGlobale, setPrimeRepasGlobale] = useState(formData.prime_repas_globale ?? false);
  const [interventionSettings, setInterventionSettings] = useState(null);
  const [sortByVehicle, setSortByVehicle] = useState(false);
  
  // Charger les paramètres d'intervention au montage
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch(`${API}/interventions/settings`, {
          headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (response.ok) {
          const data = await response.json();
          setInterventionSettings(data);
        }
      } catch (error) {
        console.error('Erreur chargement paramètres:', error);
      }
    };
    loadSettings();
  }, [tenantSlug]);
  
  // Statuts de présence disponibles
  const statutsPresence = [
    { value: 'present', label: 'Présent', color: 'bg-green-100 text-green-800' },
    { value: 'absent_non_paye', label: 'Absent (non-payé)', color: 'bg-red-100 text-red-800' },
    { value: 'absent_paye', label: 'Absent (payé/maladie)', color: 'bg-orange-100 text-orange-800' },
    { value: 'remplace', label: 'Remplacé par...', color: 'bg-yellow-100 text-yellow-800' },
    { value: 'rappele', label: 'Rappelé', color: 'bg-blue-100 text-blue-800' },
    { value: 'non_disponible', label: 'Non-disponible', color: 'bg-gray-100 text-gray-800' }
  ];
  
  const API = `${BACKEND_URL}/api/${tenantSlug}`;
  
  const getToken = () => {
    return localStorage.getItem(`${tenantSlug}_token`) || localStorage.getItem('token');
  };
  
  // Véhicules et personnel manuels
  const [manualVehicles, setManualVehicles] = useState(formData.manual_vehicles || []);
  const [manualPersonnel, setManualPersonnel] = useState(formData.manual_personnel || []);
  
  // Combiner véhicules XML et manuels
  const allVehicles = [...vehicles, ...manualVehicles];
  const allPersonnel = [...resources, ...manualPersonnel];
  
  // Extraire l'heure HH:MM d'un datetime
  const getHeureFromDatetime = (datetime) => {
    if (!datetime) return null;
    if (datetime.includes('T')) {
      const timePart = datetime.split('T')[1];
      if (timePart) return timePart.substring(0, 5);
    }
    if (datetime.includes(' ')) {
      const parts = datetime.split(' ');
      if (parts[1]) return parts[1].substring(0, 5);
    }
    if (datetime.includes(':') && !datetime.includes('-')) {
      return datetime.substring(0, 5);
    }
    return null;
  };
  
  // Calculer la durée de l'intervention en heures
  const calculerDureeIntervention = () => {
    try {
      const debut = formData.xml_time_call_received;
      const fin = formData.xml_end_time || formData.xml_time_available;
      if (!debut || !fin) return 0;
      const debutDate = new Date(debut);
      const finDate = new Date(fin);
      return Math.max(0, (finDate - debutDate) / (1000 * 60 * 60));
    } catch (e) {
      return 0;
    }
  };
  
  // Vérifier si l'intervention couvre l'heure d'un repas
  const checkRepasCouvert = (typeRepas) => {
    const heureDebut = getHeureFromDatetime(formData.xml_time_call_received);
    const heureFin = getHeureFromDatetime(formData.xml_end_time || formData.xml_time_available);
    if (!heureDebut || !heureFin) return true;
    
    let config = interventionSettings?.[`repas_${typeRepas}`];
    if (!config || !config.actif) {
      const defaultConfig = {
        dejeuner: { heure_debut: '06:00', heure_fin: '09:00', actif: true },
        diner: { heure_debut: '11:00', heure_fin: '14:00', actif: true },
        souper: { heure_debut: '17:00', heure_fin: '20:00', actif: true }
      };
      config = defaultConfig[typeRepas];
      if (!config) return true;
    }
    
    const getMinutes = (timeStr) => {
      if (!timeStr) return 0;
      const [h, m] = timeStr.split(':').map(Number);
      return h * 60 + (m || 0);
    };
    
    const debutIntervention = getMinutes(heureDebut);
    const finIntervention = getMinutes(heureFin);
    const debutRepas = getMinutes(config.heure_debut || '00:00');
    const finRepas = getMinutes(config.heure_fin || '23:59');
    
    if (finIntervention < debutIntervention) {
      return debutRepas <= finIntervention || finRepas >= debutIntervention;
    }
    return debutIntervention < finRepas && finIntervention > debutRepas;
  };
  
  // Vérifier si un repas est éligible (durée minimum)
  const checkRepasEligible = (typeRepas, heureDebut, heureFin, dureeHeures) => {
    if (!interventionSettings) return false;
    const config = interventionSettings[`repas_${typeRepas}`];
    if (!config || !config.actif) return false;
    const dureeMin = config.duree_minimum || 0;
    if (dureeHeures < dureeMin) return false;
    
    const getMinutes = (timeStr) => {
      if (!timeStr) return 0;
      const [h, m] = timeStr.split(':').map(Number);
      return h * 60 + (m || 0);
    };
    
    const debutIntervention = getMinutes(heureDebut);
    const finIntervention = getMinutes(heureFin);
    const debutRepas = getMinutes(config.heure_debut || '00:00');
    const finRepas = getMinutes(config.heure_fin || '23:59');
    
    if (finIntervention < debutIntervention) {
      return debutRepas <= finIntervention || finRepas >= debutIntervention;
    }
    return debutIntervention < finRepas && finIntervention > debutRepas;
  };
  
  // Calcul des primes de repas automatiques
  const calculerRepasAutomatiques = (heureDebut, heureFin) => {
    if (!heureDebut) return { dejeuner: false, diner: false, souper: false };
    const dureeHeures = calculerDureeIntervention();
    if (!interventionSettings) return { dejeuner: false, diner: false, souper: false };
    return {
      dejeuner: checkRepasEligible('dejeuner', heureDebut, heureFin, dureeHeures),
      diner: checkRepasEligible('diner', heureDebut, heureFin, dureeHeures),
      souper: checkRepasEligible('souper', heureDebut, heureFin, dureeHeures)
    };
  };
  
  // Mettre à jour une prime de repas
  const updatePrimeRepas = (personnelId, field, value) => {
    const isManual = manualPersonnel.some(p => p.id === personnelId);
    if (isManual) {
      const updated = manualPersonnel.map(p =>
        p.id === personnelId ? { ...p, [field]: value } : p
      );
      setManualPersonnel(updated);
      setFormData(prev => ({ ...prev, manual_personnel: updated }));
    } else {
      const updated = resources.map(p =>
        p.id === personnelId ? { ...p, [field]: value } : p
      );
      setFormData(prev => ({ ...prev, resources: updated }));
    }
  };
  
  // Mettre à jour le véhicule assigné
  const updateVehicleAssignment = (personnelId, vehicleNumber) => {
    const updated = manualPersonnel.map(p => 
      p.id === personnelId ? { ...p, vehicle_number: vehicleNumber || null } : p
    );
    setManualPersonnel(updated);
    setFormData({ ...formData, manual_personnel: updated });
  };
  
  // Mettre à jour le statut de présence
  const updateStatutPresence = (personnelId, statut) => {
    const isManual = manualPersonnel.some(p => p.id === personnelId);
    if (isManual) {
      const updated = manualPersonnel.map(p =>
        p.id === personnelId ? { ...p, statut_presence: statut, remplace_par: statut !== 'remplace' ? null : p.remplace_par } : p
      );
      setManualPersonnel(updated);
      setFormData({ ...formData, manual_personnel: updated });
    }
  };
  
  // Mettre à jour le remplaçant
  const updateRemplacant = (personnelId, remplacantId) => {
    const remplacant = users.find(u => u.id === remplacantId);
    const updated = manualPersonnel.map(p =>
      p.id === personnelId ? { 
        ...p, 
        remplace_par: remplacantId, 
        remplace_par_nom: remplacant ? `${remplacant.prenom} ${remplacant.nom}` : null 
      } : p
    );
    setManualPersonnel(updated);
    setFormData({ ...formData, manual_personnel: updated });
  };
  
  // Mettre à jour fonction supérieure
  const updateFonctionSuperieure = (personnelId, checked) => {
    const updated = manualPersonnel.map(p => 
      p.id === personnelId ? { ...p, utilise_fonction_superieure: checked } : p
    );
    setManualPersonnel(updated);
    setFormData({ ...formData, manual_personnel: updated });
  };
  
  // Vérifier si tous les repas d'un type sont cochés
  const areAllRepasChecked = (typeRepas) => {
    const field = `prime_${typeRepas}`;
    const manualWithRepas = manualPersonnel.filter(p => p.is_manual);
    if (manualWithRepas.length === 0) return false;
    return manualWithRepas.every(p => p[field] === true);
  };
  
  // Cocher/décocher tous les repas d'un type
  const toggleAllRepasType = (typeRepas, checked) => {
    const field = `prime_${typeRepas}`;
    const updated = manualPersonnel.map(p => ({
      ...p,
      [field]: checked
    }));
    setManualPersonnel(updated);
    setFormData({ ...formData, manual_personnel: updated });
  };
  
  // Charger les utilisateurs
  const loadUsers = async () => {
    if (users.length > 0) return;
    setLoadingUsers(true);
    try {
      const response = await fetch(`${API}/users`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (error) {
      console.error('Erreur chargement utilisateurs:', error);
    } finally {
      setLoadingUsers(false);
    }
  };
  
  // Charger les véhicules du tenant
  const loadTenantVehicles = async () => {
    try {
      const response = await fetch(`${API}/actifs/vehicules`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        const data = await response.json();
        setTenantVehicles(data);
      }
    } catch (error) {
      console.error('Erreur chargement véhicules:', error);
    }
  };
  
  // Import automatique équipe de garde
  const importerEquipeAutomatique = async () => {
    try {
      const dateIntervention = formData.xml_time_call_received?.split('T')[0] || new Date().toISOString().split('T')[0];
      let heureDebut = null;
      if (formData.xml_time_call_received) {
        const timePart = formData.xml_time_call_received.split('T')[1];
        if (timePart) heureDebut = timePart.substring(0, 5);
      }
      
      const url = heureDebut 
        ? `${API}/interventions/equipes-garde?date=${dateIntervention}&heure=${heureDebut}`
        : `${API}/interventions/equipes-garde?date=${dateIntervention}`;
        
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      
      if (!response.ok) throw new Error('Erreur chargement équipes');
      
      const equipes = await response.json();
      if (!equipes || equipes.length === 0) {
        alert('Aucune équipe de garde trouvée pour cette date/heure.');
        return;
      }
      
      const heureFin = getHeureFromDatetime(formData.xml_end_time || formData.xml_time_available);
      const repasAuto = calculerRepasAutomatiques(heureDebut, heureFin);
      const auMoinsUnRepasEligible = repasAuto.dejeuner || repasAuto.diner || repasAuto.souper;
      
      const personnelExistants = manualPersonnel.map(p => p.id);
      let nouveauxMembres = [];
      
      equipes.forEach(equipe => {
        const membresAImporter = equipe.membres
          .filter(m => !personnelExistants.includes(m.id))
          .map(m => ({
            id: m.id,
            nom: m.nom,
            prenom: m.prenom,
            grade: m.grade,
            type_emploi: m.type_emploi,
            fonction_superieur: m.fonction_superieur || false,
            statut_presence: 'present',
            prime_repas: auMoinsUnRepasEligible,
            prime_dejeuner: repasAuto.dejeuner,
            prime_diner: repasAuto.diner,
            prime_souper: repasAuto.souper,
            utilise_fonction_superieure: false,
            equipe_origine: equipe.equipe_nom,
            vehicle_number: null,
            is_manual: true
          }));
        nouveauxMembres = [...nouveauxMembres, ...membresAImporter];
      });
      
      const updated = [...manualPersonnel, ...nouveauxMembres];
      setManualPersonnel(updated);
      setFormData({ ...formData, manual_personnel: updated });
      
      alert(`✅ ${nouveauxMembres.length} membre(s) importé(s) de l'équipe de garde.`);
    } catch (error) {
      console.error('Erreur import équipe:', error);
      alert('Erreur lors de l import de l équipe de garde.');
    }
  };
  
  // Ouvrir modal ajout personnel
  const openAddPersonnel = () => {
    loadUsers();
    setSelectedPersonnel([]);
    setShowAddPersonnel(true);
  };
  
  // Ajouter personnel
  const addPersonnel = () => {
    const heureDebut = getHeureFromDatetime(formData.xml_time_call_received);
    const heureFin = getHeureFromDatetime(formData.xml_end_time || formData.xml_time_available);
    const repasAuto = calculerRepasAutomatiques(heureDebut, heureFin);
    const auMoinsUnRepasEligible = repasAuto.dejeuner || repasAuto.diner || repasAuto.souper;
    
    const newPersonnel = selectedPersonnel.map(userId => {
      const user = users.find(u => u.id === userId);
      return {
        id: user.id,
        user_id: user.id,
        user_name: `${user.prenom} ${user.nom}`,
        prenom: user.prenom,
        nom: user.nom,
        grade: user.grade || user.grade_nom,
        fonction_superieur: user.fonction_superieur || false,
        vehicle_number: null,
        statut_presence: 'present',
        prime_repas: auMoinsUnRepasEligible,
        prime_dejeuner: repasAuto.dejeuner,
        prime_diner: repasAuto.diner,
        prime_souper: repasAuto.souper,
        utilise_fonction_superieure: false,
        is_manual: true
      };
    });
    
    const updated = [...manualPersonnel, ...newPersonnel];
    setManualPersonnel(updated);
    setFormData({ ...formData, manual_personnel: updated });
    setShowAddPersonnel(false);
    setSelectedPersonnel([]);
    setSearchPersonnel('');
  };
  
  // Supprimer personnel
  const removePersonnel = (personnelId) => {
    const updated = manualPersonnel.filter(p => p.id !== personnelId);
    setManualPersonnel(updated);
    setFormData({ ...formData, manual_personnel: updated });
  };
  
  // Ajouter véhicule
  const addVehicle = () => {
    if (!newVehicle.number) return;
    const vehicle = {
      id: `manual-${Date.now()}`,
      xml_vehicle_number: newVehicle.number,
      crew_count: parseInt(newVehicle.crew_count) || 0,
      is_manual: true
    };
    const updated = [...manualVehicles, vehicle];
    setManualVehicles(updated);
    setFormData({ ...formData, manual_vehicles: updated });
    setShowAddVehicle(false);
    setNewVehicle({ number: '', crew_count: '' });
  };
  
  // Supprimer véhicule
  const removeVehicle = (vehicleId) => {
    const updated = manualVehicles.filter(v => v.id !== vehicleId);
    setManualVehicles(updated);
    setFormData({ ...formData, manual_vehicles: updated });
  };
  
  // Obtenir le nombre de personnel par véhicule
  const getVehiclePersonnelCount = (vehicleNumber) => {
    return allPersonnel.filter(r => r.vehicle_number === vehicleNumber).length;
  };
  
  // Trier le personnel
  const getSortedPersonnel = () => {
    if (!sortByVehicle) return allPersonnel;
    return [...allPersonnel].sort((a, b) => {
      const vA = a.vehicle_number || 'zzz';
      const vB = b.vehicle_number || 'zzz';
      return vA.localeCompare(vB);
    });
  };
  
  // Options du dropdown véhicule
  const vehicleOptions = [
    { value: '', label: '— Non assigné —' },
    ...allVehicles.map(v => ({ value: v.xml_vehicle_number, label: `🚒 ${v.xml_vehicle_number}` })),
    { value: 'vehicule_personnel', label: '🚗 Véhicule personnel' }
  ];

  return (
    <div className="space-y-6">
      {/* Section Véhicules déployés - Simplifiée */}
      <Card>
        <CardHeader className="bg-blue-50">
          <CardTitle className="text-lg text-blue-800 flex justify-between items-center">
            <span>🚒 Véhicules déployés ({allVehicles.length})</span>
            {editMode && (
              <Button size="sm" variant="outline" onClick={() => { loadTenantVehicles(); setShowAddVehicle(true); }}>
                + Ajouter véhicule
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {allVehicles.length === 0 ? (
            <p className="text-gray-500">Aucun véhicule enregistré</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {allVehicles.map(vehicle => {
                const count = getVehiclePersonnelCount(vehicle.xml_vehicle_number);
                const hasNoPersonnel = count === 0;
                return (
                  <div 
                    key={vehicle.id} 
                    className={`px-4 py-3 rounded-lg border-2 flex items-center gap-3 ${
                      hasNoPersonnel ? 'bg-orange-50 border-orange-400' : 'bg-gray-50 border-gray-200'
                    } ${vehicle.is_manual ? 'border-green-400' : ''}`}
                  >
                    <div>
                      <div className="font-bold text-lg flex items-center gap-2">
                        🚒 {vehicle.xml_vehicle_number}
                        {vehicle.is_manual && <span className="text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded">Manuel</span>}
                      </div>
                      <div className={`text-sm ${hasNoPersonnel ? 'text-orange-600 font-medium' : 'text-gray-600'}`}>
                        👥 {count} assigné{count > 1 ? 's' : ''}
                        {hasNoPersonnel && ' ⚠️'}
                      </div>
                    </div>
                    {editMode && vehicle.is_manual && (
                      <Button size="sm" variant="ghost" onClick={() => removeVehicle(vehicle.id)} className="text-red-500 hover:text-red-700 p-1">
                        🗑️
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section Personnel présent lors de l'intervention */}
      <Card>
        <CardHeader className="bg-green-50">
          <CardTitle className="text-lg text-green-800">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <span>👥 Personnel présent lors de l&apos;intervention ({allPersonnel.length})</span>
              {editMode && (
                <div className="flex gap-2 flex-wrap">
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={importerEquipeAutomatique}
                    className="bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100"
                  >
                    📋 Importer équipe de garde
                  </Button>
                  <Button size="sm" variant="outline" onClick={openAddPersonnel}>
                    + Ajouter
                  </Button>
                  <Button 
                    size="sm" 
                    variant={sortByVehicle ? "default" : "outline"}
                    onClick={() => setSortByVehicle(!sortByVehicle)}
                  >
                    ↕️ Trier par véhicule
                  </Button>
                </div>
              )}
            </div>
            {editMode && (
              <div className="mt-2">
                <label className="flex items-center gap-2 text-sm font-normal">
                  <input
                    type="checkbox"
                    checked={primeRepasGlobale}
                    onChange={(e) => togglePrimeRepasGlobale(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span>🍽️ Prime repas pour tous</span>
                </label>
              </div>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {allPersonnel.length === 0 ? (
            <p className="text-gray-500">Aucun personnel enregistré. Cliquez sur &quot;Importer équipe de garde&quot; ou &quot;+ Ajouter&quot;.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-2 text-left">Nom</th>
                    <th className="p-2 text-left">Véhicule</th>
                    <th className="p-2 text-left">Statut</th>
                    <th className="p-2 text-left">Remplaçant</th>
                    <th className="p-2 text-left">Fct.Sup</th>
                    {checkRepasCouvert('dejeuner') && <th className="p-2 text-center" title="Déjeuner">🌅</th>}
                    {checkRepasCouvert('diner') && <th className="p-2 text-center" title="Dîner">☀️</th>}
                    {checkRepasCouvert('souper') && <th className="p-2 text-center" title="Souper">🌙</th>}
                    {editMode && <th className="p-2 text-center">⚡</th>}
                  </tr>
                </thead>
                <tbody>
                  {getSortedPersonnel().map(person => {
                    const statut = statutsPresence.find(s => s.value === (person.statut_presence || 'present'));
                    const employeData = users.find(u => u.id === person.id || u.id === person.user_id);
                    const estEligibleFonctionSup = employeData?.fonction_superieur === true || person.fonction_superieur === true;
                    
                    return (
                      <tr key={person.id} className="border-b hover:bg-gray-50">
                        <td className="p-2 font-medium">
                          {person.user_name || `${person.prenom} ${person.nom}` || person.user_id || 'Non assigné'}
                          {person.grade && <span className="text-gray-500 text-xs ml-1">({person.grade})</span>}
                          {person.equipe_origine && <span className="text-purple-600 text-xs ml-1">[{person.equipe_origine}]</span>}
                        </td>
                        <td className="p-2">
                          {editMode && person.is_manual ? (
                            <select
                              value={person.vehicle_number || ''}
                              onChange={(e) => updateVehicleAssignment(person.id, e.target.value)}
                              className="text-xs rounded px-2 py-1 border bg-blue-50 w-full min-w-[140px]"
                            >
                              {vehicleOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          ) : (
                            <span className={person.vehicle_number ? 'text-blue-700' : 'text-gray-400'}>
                              {person.vehicle_number === 'vehicule_personnel' ? '🚗 Véh. perso.' : 
                               person.vehicle_number ? `🚒 ${person.vehicle_number}` : '— Non assigné —'}
                            </span>
                          )}
                        </td>
                        <td className="p-2">
                          {editMode && person.is_manual ? (
                            <select
                              value={person.statut_presence || 'present'}
                              onChange={(e) => updateStatutPresence(person.id, e.target.value)}
                              className={`text-xs rounded px-2 py-1 border ${statut?.color || ''}`}
                            >
                              {statutsPresence.map(s => (
                                <option key={s.value} value={s.value}>{s.label}</option>
                              ))}
                            </select>
                          ) : (
                            <span className={`px-2 py-1 rounded text-xs ${statut?.color || 'bg-gray-100'}`}>
                              {statut?.label || 'Présent'}
                            </span>
                          )}
                        </td>
                        <td className="p-2">
                          {person.statut_presence === 'remplace' ? (
                            editMode && person.is_manual ? (
                              <select
                                value={person.remplace_par || ''}
                                onChange={(e) => updateRemplacant(person.id, e.target.value)}
                                className="text-xs rounded px-2 py-1 border bg-yellow-50 w-full"
                              >
                                <option value="">-- Choisir --</option>
                                {users
                                  .filter(u => (u.statut || '').toLowerCase() === 'actif' && u.id !== person.id)
                                  .map(u => (
                                    <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>
                                  ))
                                }
                              </select>
                            ) : (
                              <span className="text-yellow-700 text-xs">{person.remplace_par_nom || '-'}</span>
                            )
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </td>
                        <td className="p-2 text-center">
                          {estEligibleFonctionSup ? (
                            editMode && person.is_manual ? (
                              <input
                                type="checkbox"
                                checked={person.utilise_fonction_superieure ?? false}
                                onChange={(e) => updateFonctionSuperieure(person.id, e.target.checked)}
                                className="w-4 h-4"
                                title="Fonction supérieure"
                              />
                            ) : (
                              person.utilise_fonction_superieure ? <span className="text-orange-600">⬆️</span> : <span className="text-gray-400">-</span>
                            )
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        {checkRepasCouvert('dejeuner') && (
                          <td className="p-2 text-center">
                            {editMode && person.is_manual ? (
                              <input
                                type="checkbox"
                                checked={person.prime_dejeuner ?? false}
                                onChange={(e) => updatePrimeRepas(person.id, 'prime_dejeuner', e.target.checked)}
                                className="w-4 h-4"
                              />
                            ) : (
                              person.prime_dejeuner ? '✓' : '-'
                            )}
                          </td>
                        )}
                        {checkRepasCouvert('diner') && (
                          <td className="p-2 text-center">
                            {editMode && person.is_manual ? (
                              <input
                                type="checkbox"
                                checked={person.prime_diner ?? false}
                                onChange={(e) => updatePrimeRepas(person.id, 'prime_diner', e.target.checked)}
                                className="w-4 h-4"
                              />
                            ) : (
                              person.prime_diner ? '✓' : '-'
                            )}
                          </td>
                        )}
                        {checkRepasCouvert('souper') && (
                          <td className="p-2 text-center">
                            {editMode && person.is_manual ? (
                              <input
                                type="checkbox"
                                checked={person.prime_souper ?? false}
                                onChange={(e) => updatePrimeRepas(person.id, 'prime_souper', e.target.checked)}
                                className="w-4 h-4"
                              />
                            ) : (
                              person.prime_souper ? '✓' : '-'
                            )}
                          </td>
                        )}
                        {editMode && (
                          <td className="p-2 text-center">
                            {person.is_manual && (
                              <button onClick={() => removePersonnel(person.id)} className="text-red-500 hover:text-red-700">
                                🗑️
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Modal Ajout Véhicule */}
      {showAddVehicle && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{ zIndex: 100001 }}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-bold mb-4">🚒 Ajouter un véhicule</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Sélectionner un véhicule *</label>
                <select 
                  value={newVehicle.number}
                  onChange={(e) => {
                    const v = tenantVehicles.find(tv => (tv.numero || tv.nom) === e.target.value);
                    setNewVehicle({ 
                      number: e.target.value, 
                      crew_count: v?.capacite || '' 
                    });
                  }}
                  className="w-full border rounded p-2"
                >
                  <option value="">-- Sélectionner un véhicule --</option>
                  {tenantVehicles.map(v => (
                    <option key={v.id} value={v.numero || v.nom}>
                      {v.numero || v.nom} {v.type ? `(${v.type})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Capacité</label>
                <input
                  type="number"
                  value={newVehicle.crew_count}
                  onChange={(e) => setNewVehicle({ ...newVehicle, crew_count: e.target.value })}
                  className="w-full border rounded p-2"
                  placeholder="0"
                  min="0"
                />
              </div>
            </div>
            
            <div className="flex gap-2 mt-4">
              <Button variant="outline" onClick={() => setShowAddVehicle(false)} className="flex-1">
                Annuler
              </Button>
              <Button onClick={addVehicle} disabled={!newVehicle.number} className="flex-1">
                Ajouter
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
      
      {/* Modal Ajout Personnel */}
      {showAddPersonnel && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{ zIndex: 100001 }}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col">
            <h3 className="text-lg font-bold mb-4">👥 Ajouter du personnel</h3>
            
            <div className="mb-3">
              <input
                type="text"
                placeholder="🔍 Rechercher par nom..."
                value={searchPersonnel}
                onChange={(e) => setSearchPersonnel(e.target.value)}
                className="w-full border rounded-lg p-2"
              />
            </div>
            
            {loadingUsers ? (
              <p>Chargement...</p>
            ) : (
              <div className="space-y-1 overflow-y-auto flex-1" style={{ maxHeight: '300px' }}>
                {users.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">Aucun utilisateur trouvé</p>
                ) : users
                  .filter(u => (u.statut || '').toLowerCase() === 'actif')
                  .filter(u => !allPersonnel.some(p => p.id === u.id))
                  .filter(u => {
                    if (!searchPersonnel) return true;
                    const search = searchPersonnel.toLowerCase();
                    return `${u.prenom} ${u.nom}`.toLowerCase().includes(search);
                  })
                  .map(user => (
                    <label key={user.id} className="flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-gray-50">
                      <input 
                        type="checkbox"
                        checked={selectedPersonnel.includes(user.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedPersonnel([...selectedPersonnel, user.id]);
                          } else {
                            setSelectedPersonnel(selectedPersonnel.filter(id => id !== user.id));
                          }
                        }}
                        className="w-4 h-4" 
                      />
                      <span className="flex-1">{user.prenom} {user.nom}</span>
                      <span className="text-gray-500 text-sm">({user.grade || user.grade_nom || 'Pompier'})</span>
                    </label>
                  ))}
              </div>
            )}
            <div className="flex gap-2 mt-4 pt-3 border-t">
              <Button variant="outline" onClick={() => { setShowAddPersonnel(false); setSearchPersonnel(''); }} className="flex-1">
                Annuler
              </Button>
              <Button onClick={addPersonnel} disabled={selectedPersonnel.length === 0} className="flex-1">
                Ajouter ({selectedPersonnel.length})
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default SectionRessources;
