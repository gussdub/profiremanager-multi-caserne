import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const SectionRessources = ({ vehicles, resources, formData, setFormData, editMode, tenantSlug, interventionId, onRefresh }) => {
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [showAddPersonnel, setShowAddPersonnel] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
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
  
  // Statuts de présence disponibles avec leur impact sur les statistiques
  const statutsPresence = [
    { value: 'present', label: 'Présent', color: 'bg-green-100 text-green-800', impact: '+1' },
    { value: 'absent_non_paye', label: 'Absent (non-payé)', color: 'bg-red-100 text-red-800', impact: '-1' },
    { value: 'absent_paye', label: 'Absent (payé/maladie)', color: 'bg-orange-100 text-orange-800', impact: '0' },
    { value: 'remplace', label: 'Remplacé par...', color: 'bg-yellow-100 text-yellow-800', impact: '0' },
    { value: 'rappele', label: 'Rappelé', color: 'bg-blue-100 text-blue-800', impact: '+1' },
    { value: 'non_disponible', label: 'Non-disponible', color: 'bg-gray-100 text-gray-800', impact: '-1' }
  ];
  
  const API = `${BACKEND_URL}/api/${tenantSlug}`;
  
  const getToken = () => {
    return localStorage.getItem(`${tenantSlug}_token`) || localStorage.getItem('token');
  };
  
  // Véhicules manuels ajoutés localement
  const [manualVehicles, setManualVehicles] = useState(formData.manual_vehicles || []);
  const [manualPersonnel, setManualPersonnel] = useState(formData.manual_personnel || []);
  
  // Calcul des primes de repas automatiques basé sur les heures de l'intervention
  // Déjeuner: 6h-9h, Dîner: 11h-14h, Souper: 17h-20h
  const calculerRepasAutomatiques = (heureDebut, heureFin) => {
    if (!heureDebut || !heureFin) return { dejeuner: false, diner: false, souper: false };
    
    try {
      const getMinutes = (timeStr) => {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + (m || 0);
      };
      
      const debut = getMinutes(heureDebut);
      const fin = getMinutes(heureFin);
      
      // Plages horaires des repas (en minutes depuis minuit)
      const repas = {
        dejeuner: { debut: 6 * 60, fin: 9 * 60 },   // 6h - 9h
        diner: { debut: 11 * 60, fin: 14 * 60 },    // 11h - 14h
        souper: { debut: 17 * 60, fin: 20 * 60 }    // 17h - 20h
      };
      
      const chevauche = (repasDebut, repasFin) => {
        // Gestion si fin < debut (intervention qui passe minuit)
        if (fin < debut) {
          return repasDebut <= fin || repasFin >= debut;
        }
        return debut < repasFin && fin > repasDebut;
      };
      
      return {
        dejeuner: chevauche(repas.dejeuner.debut, repas.dejeuner.fin),
        diner: chevauche(repas.diner.debut, repas.diner.fin),
        souper: chevauche(repas.souper.debut, repas.souper.fin)
      };
    } catch (e) {
      console.error('Erreur calcul repas:', e);
      return { dejeuner: false, diner: false, souper: false };
    }
  };
  
  // Mettre à jour une prime de repas pour un membre du récapitulatif
  const updatePrimeRepasRecap = (personnelId, field, value) => {
    // Mettre à jour dans manualPersonnel si c'est un membre manuel
    const isManual = manualPersonnel.some(p => p.id === personnelId);
    
    if (isManual) {
      const updatedManual = manualPersonnel.map(p =>
        p.id === personnelId ? { ...p, [field]: value } : p
      );
      setManualPersonnel(updatedManual);
      setFormData(prev => ({ ...prev, manual_personnel: updatedManual }));
    } else {
      // Mettre à jour dans resources (XML)
      const updatedResources = resources.map(p =>
        p.id === personnelId ? { ...p, [field]: value } : p
      );
      setFormData(prev => ({ ...prev, resources: updatedResources }));
    }
  };
  
  // Charger les équipes de garde
  // Import automatique de l'équipe de garde basé sur l'heure de l'intervention
  const importerEquipeAutomatique = async () => {
    try {
      const dateIntervention = formData.xml_time_call_received?.split('T')[0] || new Date().toISOString().split('T')[0];
      
      // Extraire l'heure de début de l'intervention
      let heureDebut = null;
      if (formData.xml_time_call_received) {
        const timePart = formData.xml_time_call_received.split('T')[1];
        if (timePart) {
          heureDebut = timePart.substring(0, 5); // HH:MM
        }
      }
      
      // Extraire l'heure de fin de l'intervention
      let heureFin = null;
      if (formData.xml_end_time) {
        const timePart = formData.xml_end_time.split('T')[1];
        if (timePart) {
          heureFin = timePart.substring(0, 5); // HH:MM
        }
      }
      
      // Calculer les repas automatiques
      const repasAuto = calculerRepasAutomatiques(heureDebut, heureFin || heureDebut);
      console.log(`🍽️ Repas automatiques détectés:`, repasAuto);
      
      // Appeler l'API avec date et heure pour détection automatique
      let url = `${API}/interventions/equipes-garde?date=${dateIntervention}`;
      if (heureDebut) {
        url += `&heure=${heureDebut}`;
      }
      
      console.log(`🕐 Import équipe automatique - Date: ${dateIntervention}, Heure: ${heureDebut}`);
      
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        const equipes = data.equipes || [];
        const typeGardeDetecte = data.type_garde_detecte;
        
        console.log(`✅ Équipes trouvées: ${equipes.length}, Type garde détecté: ${typeGardeDetecte}`);
        
        if (equipes.length === 0) {
          alert('Aucune équipe de garde configurée pour cette date.');
          return;
        }
        
        // Importer automatiquement toutes les équipes trouvées
        let totalMembres = 0;
        let nouveauxMembresTotal = [];
        
        equipes.forEach(equipe => {
          const membresAImporter = equipe.membres.map(m => ({
            id: m.id,
            nom: m.nom,
            prenom: m.prenom,
            grade: m.grade,
            type_emploi: m.type_emploi,
            fonction_superieur: m.fonction_superieur || false,
            statut_presence: 'present',
            prime_repas: true,
            // Primes de repas basées sur les heures de l'intervention
            prime_dejeuner: repasAuto.dejeuner,
            prime_diner: repasAuto.diner,
            prime_souper: repasAuto.souper,
            utilise_fonction_superieure: false,
            equipe_origine: equipe.equipe_nom
          }));
          
          // Fusionner avec le personnel existant (éviter les doublons)
          const personnelExistant = manualPersonnel.map(p => p.id);
          const nouveauxMembres = membresAImporter.filter(m => !personnelExistant.includes(m.id));
          nouveauxMembresTotal = [...nouveauxMembresTotal, ...nouveauxMembres];
          totalMembres += nouveauxMembres.length;
        });
        
        if (nouveauxMembresTotal.length > 0) {
          const updated = [...manualPersonnel, ...nouveauxMembresTotal];
          setManualPersonnel(updated);
          setFormData(prev => ({ ...prev, manual_personnel: updated }));
        }
        
        const typeGardeMsg = typeGardeDetecte ? ` (garde ${typeGardeDetecte})` : '';
        const repasMsg = repasAuto.dejeuner || repasAuto.diner || repasAuto.souper 
          ? ` - Repas: ${repasAuto.dejeuner ? '🌅' : ''}${repasAuto.diner ? '☀️' : ''}${repasAuto.souper ? '🌙' : ''}`
          : '';
        alert(`✅ ${totalMembres} membre(s) importé(s)${typeGardeMsg}${repasMsg}`);
      } else {
        console.error('Erreur API équipes-garde:', response.status);
        alert('Erreur lors du chargement des équipes de garde');
      }
    } catch (error) {
      console.error('Erreur import équipe automatique:', error);
      alert('Erreur lors de l\'import de l\'équipe');
    }
  };
  
  const loadEquipesGarde = async () => {
    try {
      const dateIntervention = formData.xml_time_call_received?.split('T')[0] || new Date().toISOString().split('T')[0];
      const response = await fetch(`${API}/interventions/equipes-garde?date=${dateIntervention}`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        const data = await response.json();
        setEquipesGarde(data.equipes || []);
      }
    } catch (error) {
      console.error('Erreur chargement équipes:', error);
    }
  };
  
  // Importer une équipe complète (manuel)
  const importerEquipe = (equipe) => {
    const membresAImporter = equipe.membres.map(m => ({
      id: m.id,
      nom: m.nom,
      prenom: m.prenom,
      grade: m.grade,
      type_emploi: m.type_emploi,
      fonction_superieur: m.fonction_superieur || false,
      statut_presence: 'present',
      prime_repas: true,
      utilise_fonction_superieure: false,
      equipe_origine: equipe.equipe_nom
    }));
    
    // Fusionner avec le personnel existant (éviter les doublons)
    const personnelExistant = manualPersonnel.map(p => p.id);
    const nouveauxMembres = membresAImporter.filter(m => !personnelExistant.includes(m.id));
    
    const updated = [...manualPersonnel, ...nouveauxMembres];
    setManualPersonnel(updated);
    setFormData({ ...formData, manual_personnel: updated });
    setShowImportEquipe(false);
  };
  
  // Mettre à jour le statut de présence d'un membre
  const updateStatutPresence = (personnelId, statut, remplacePar = null) => {
    const updated = manualPersonnel.map(p => 
      p.id === personnelId ? { ...p, statut_presence: statut, remplace_par: remplacePar } : p
    );
    setManualPersonnel(updated);
    setFormData({ ...formData, manual_personnel: updated });
  };
  
  // Mettre à jour le remplaçant et son statut payé
  const updateRemplacant = (personnelId, remplacantId) => {
    const remplacant = users.find(u => u.id === remplacantId);
    const updated = manualPersonnel.map(p => 
      p.id === personnelId ? { 
        ...p, 
        remplace_par: remplacantId,
        remplace_par_nom: remplacant ? `${remplacant.prenom} ${remplacant.nom}` : null,
        remplacant_paye: true // Par défaut payé
      } : p
    );
    setManualPersonnel(updated);
    setFormData({ ...formData, manual_personnel: updated });
  };
  
  // Mettre à jour le statut payé du remplaçant
  const updateRemplacantPaye = (personnelId, paye) => {
    const updated = manualPersonnel.map(p => 
      p.id === personnelId ? { ...p, remplacant_paye: paye } : p
    );
    setManualPersonnel(updated);
    setFormData({ ...formData, manual_personnel: updated });
  };
  
  // Mettre à jour la prime de repas d'un membre
  const updatePrimeRepas = (personnelId, checked) => {
    const updated = manualPersonnel.map(p => 
      p.id === personnelId ? { ...p, prime_repas: checked } : p
    );
    setManualPersonnel(updated);
    setFormData({ ...formData, manual_personnel: updated });
  };
  
  // Mettre à jour si l'employé est utilisé en fonction supérieure
  const updateFonctionSuperieure = (personnelId, checked) => {
    const updated = manualPersonnel.map(p => 
      p.id === personnelId ? { ...p, utilise_fonction_superieure: checked } : p
    );
    setManualPersonnel(updated);
    setFormData({ ...formData, manual_personnel: updated });
  };
  
  // Appliquer/retirer la prime de repas globale
  const togglePrimeRepasGlobale = (checked) => {
    setPrimeRepasGlobale(checked);
    const updated = manualPersonnel.map(p => ({ ...p, prime_repas: checked }));
    setManualPersonnel(updated);
    setFormData({ ...formData, manual_personnel: updated, prime_repas_globale: checked });
  };
  
  // Charger la liste des utilisateurs et le planning
  const loadUsers = async () => {
    if (users.length > 0) return;
    setLoadingUsers(true);
    try {
      const [usersResponse, planningResponse] = await Promise.all([
        fetch(`${API}/users`, { headers: { 'Authorization': `Bearer ${getToken()}` } }),
        fetch(`${API}/plannings?date=${formData.xml_time_call_received?.split('T')[0] || new Date().toISOString().split('T')[0]}`, { 
          headers: { 'Authorization': `Bearer ${getToken()}` } 
        }).catch(() => ({ ok: false }))
      ]);
      
      if (usersResponse.ok) {
        const data = await usersResponse.json();
        setUsers(data.users || data || []);
      }
      
      // Récupérer le personnel en garde interne
      if (planningResponse.ok) {
        const planningData = await planningResponse.json();
        const gardeInterne = (planningData.affectations || [])
          .filter(a => a.type_affectation === 'garde_interne' || a.type === 'garde_interne')
          .map(a => ({ id: a.user_id, ...a }));
        setGardeInterneUsers(gardeInterne);
        // Pré-sélectionner le personnel en garde
        if (gardeInterne.length > 0 && selectedPersonnel.length === 0) {
          setSelectedPersonnel(gardeInterne.map(g => g.id));
        }
      }
    } catch (error) {
      console.error('Erreur chargement:', error);
    } finally {
      setLoadingUsers(false);
    }
  };
  
  // Charger les véhicules du tenant (depuis Gestion des Actifs)
  const loadTenantVehicles = async () => {
    try {
      const response = await fetch(`${API}/actifs/vehicules`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        const data = await response.json();
        setTenantVehicles(data || []);
      }
    } catch (error) {
      console.error('Erreur chargement véhicules:', error);
    }
  };
  
  const openAddPersonnel = (vehicle = null) => {
    setSelectedVehicle(vehicle);
    loadUsers();
    setSelectedPersonnel([]);
    setSearchPersonnel('');
    setShowAddPersonnel(true);
  };
  
  const addVehicle = () => {
    if (!newVehicle.number) return;
    const vehicle = {
      id: `manual_${Date.now()}`,
      xml_vehicle_number: newVehicle.number,
      crew_count: parseInt(newVehicle.crew_count) || 0,
      is_manual: true
    };
    const updated = [...manualVehicles, vehicle];
    setManualVehicles(updated);
    setFormData({ ...formData, manual_vehicles: updated });
    setNewVehicle({ number: '', crew_count: '' });
    setShowAddVehicle(false);
  };
  
  const removeVehicle = (vehicleId) => {
    const updated = manualVehicles.filter(v => v.id !== vehicleId);
    setManualVehicles(updated);
    setFormData({ ...formData, manual_vehicles: updated });
  };
  
  const addPersonnelToVehicle = () => {
    if (selectedPersonnel.length === 0) return;
    
    const newPersonnel = selectedPersonnel.map(userId => {
      const user = users.find(u => u.id === userId);
      return {
        id: `manual_${Date.now()}_${userId}`,
        user_id: userId,
        user_name: user ? `${user.prenom} ${user.nom}` : userId,
        vehicle_number: selectedVehicle?.xml_vehicle_number || null,
        role_on_scene: 'Pompier',
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
  
  const removePersonnel = (personnelId) => {
    const updated = manualPersonnel.filter(p => p.id !== personnelId);
    setManualPersonnel(updated);
    setFormData({ ...formData, manual_personnel: updated });
  };
  
  // Combiner véhicules XML et manuels
  const allVehicles = [...vehicles, ...manualVehicles];
  const allPersonnel = [...resources, ...manualPersonnel];
  
  // Obtenir le personnel assigné à un véhicule
  const getVehiclePersonnel = (vehicleNumber) => {
    return allPersonnel.filter(r => r.vehicle_number === vehicleNumber);
  };
  
  // Personnel supplémentaire
  const personnelSansVehicule = allPersonnel.filter(r => !r.vehicle_number);
  
  return (
    <div className="space-y-6">
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
            <div className="space-y-4">
              {allVehicles.map(vehicle => {
                const personnel = getVehiclePersonnel(vehicle.xml_vehicle_number);
                return (
                  <div key={vehicle.id} className={`p-4 rounded-lg border ${vehicle.is_manual ? 'bg-green-50 border-green-200' : 'bg-gray-50'}`}>
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="font-bold text-xl flex items-center gap-2">
                          {vehicle.xml_vehicle_number}
                          {vehicle.is_manual && <span className="text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded">Manuel</span>}
                        </div>
                        <div className="text-sm text-gray-600">
                          👥 {vehicle.crew_count || 0} pompier(s) {!vehicle.is_manual && 'selon la centrale'}
                        </div>
                        {vehicle.xml_status && (
                          <div className="text-xs text-gray-500">Statut: {vehicle.xml_status}</div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {editMode && (
                          <Button size="sm" variant="outline" onClick={() => openAddPersonnel(vehicle)}>
                            + Personnel
                          </Button>
                        )}
                        {editMode && vehicle.is_manual && (
                          <Button size="sm" variant="destructive" onClick={() => removeVehicle(vehicle.id)}>
                            🗑️
                          </Button>
                        )}
                      </div>
                    </div>
                    
                    {/* Personnel assigné */}
                    {personnel.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <p className="text-sm font-medium text-gray-700 mb-2">Personnel assigné:</p>
                        <div className="flex flex-wrap gap-2">
                          {personnel.map(p => {
                            const employeData = users.find(u => u.id === p.id || u.id === p.user_id);
                            const estEligibleFonctionSup = employeData?.fonction_superieur === true || p.fonction_superieur === true;
                            
                            return (
                              <span key={p.id} className={`px-2 py-1 rounded text-sm flex items-center gap-1 ${p.is_manual ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                                {p.user_name || p.user_id}
                                {p.role_on_scene && <span className="opacity-75">({p.role_on_scene})</span>}
                                {p.utilise_fonction_superieure && <span className="text-orange-600 font-bold ml-1">⬆️</span>}
                                {editMode && estEligibleFonctionSup && (
                                  <label className="ml-1" title="Fonction supérieure">
                                    <input
                                      type="checkbox"
                                      checked={p.utilise_fonction_superieure ?? false}
                                      onChange={(e) => updateFonctionSuperieure(p.id, e.target.checked)}
                                      className="w-3 h-3"
                                    />
                                  </label>
                                )}
                                {editMode && p.is_manual && (
                                  <button onClick={() => removePersonnel(p.id)} className="ml-1 text-red-500 hover:text-red-700">×</button>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Personnel supplémentaire */}
      <Card>
        <CardHeader className="bg-orange-50">
          <CardTitle className="text-lg text-orange-800 flex justify-between items-center">
            <span>🚶 Personnel supplémentaire ({personnelSansVehicule.length})</span>
            {editMode && (
              <Button size="sm" variant="outline" onClick={() => openAddPersonnel(null)}>
                + Ajouter
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {/* Bouton Import équipe de garde */}
          {editMode && (
            <div className="mb-4 flex gap-2 flex-wrap">
              <Button 
                size="sm" 
                variant="outline"
                onClick={importerEquipeAutomatique}
                className="bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100"
                title="Import automatique basé sur l'heure de l'intervention"
              >
                📋 Importer équipe de garde
              </Button>
              <label className="flex items-center gap-2 ml-auto">
                <input
                  type="checkbox"
                  checked={primeRepasGlobale}
                  onChange={(e) => togglePrimeRepasGlobale(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium">🍽️ Prime de repas pour tous</span>
              </label>
            </div>
          )}
          
          {personnelSansVehicule.length === 0 ? (
            <p className="text-gray-500 text-sm">Ajouter du personnel</p>
          ) : (
            <div className="space-y-2">
              {personnelSansVehicule.map(p => {
                const statut = statutsPresence.find(s => s.value === (p.statut_presence || 'present'));
                // Vérifier si l'employé est éligible à la fonction supérieure
                const employeData = users.find(u => u.id === p.id || u.id === p.user_id);
                const estEligibleFonctionSup = employeData?.fonction_superieur === true || p.fonction_superieur === true;
                
                return (
                  <div key={p.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded border flex-wrap">
                    <span className="font-medium flex-1 min-w-[150px]">
                      {p.user_name || p.prenom + ' ' + p.nom || p.user_id}
                      {p.grade && <span className="text-gray-500 text-sm ml-1">({p.grade})</span>}
                      {p.equipe_origine && <span className="text-purple-600 text-xs ml-2">[{p.equipe_origine}]</span>}
                      {p.utilise_fonction_superieure && <span className="text-orange-600 text-xs ml-2 font-bold">⬆️ Fct.Sup.</span>}
                    </span>
                    {editMode ? (
                      <>
                        <select
                          value={p.statut_presence || 'present'}
                          onChange={(e) => updateStatutPresence(p.id, e.target.value)}
                          className={`text-xs rounded px-2 py-1 border ${statut?.color || ''}`}
                        >
                          {statutsPresence.map(s => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                        {/* Sélecteur de remplaçant si statut = remplacé */}
                        {p.statut_presence === 'remplace' && (
                          <>
                            <select
                              value={p.remplace_par || ''}
                              onChange={(e) => updateRemplacant(p.id, e.target.value)}
                              className="text-xs rounded px-2 py-1 border bg-yellow-50"
                            >
                              <option value="">-- Choisir remplaçant --</option>
                              {users
                                .filter(u => (u.statut || '').toLowerCase() === 'actif' && u.id !== p.id)
                                .map(u => (
                                  <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>
                                ))
                              }
                            </select>
                            {p.remplace_par && (
                              <label className="flex items-center gap-1 text-xs bg-green-50 px-2 py-1 rounded border border-green-200">
                                <input
                                  type="checkbox"
                                  checked={p.remplacant_paye ?? true}
                                  onChange={(e) => updateRemplacantPaye(p.id, e.target.checked)}
                                  className="w-3 h-3"
                                />
                                <span>Payé</span>
                              </label>
                            )}
                          </>
                        )}
                        {/* Case à cocher Fonction Supérieure si éligible */}
                        {estEligibleFonctionSup && (
                          <label className="flex items-center gap-1 text-xs bg-orange-50 px-2 py-1 rounded border border-orange-200" title="Utilisé en fonction supérieure (payé comme Lieutenant)">
                            <input
                              type="checkbox"
                              checked={p.utilise_fonction_superieure ?? false}
                              onChange={(e) => updateFonctionSuperieure(p.id, e.target.checked)}
                              className="w-3 h-3"
                            />
                            <span className="text-orange-700">⬆️ Fct.Sup.</span>
                          </label>
                        )}
                        <label className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={p.prime_repas ?? true}
                            onChange={(e) => updatePrimeRepas(p.id, e.target.checked)}
                            className="w-4 h-4"
                          />
                          <span className="text-xs">🍽️</span>
                        </label>
                        {p.is_manual && (
                          <button onClick={() => removePersonnel(p.id)} className="text-red-500 hover:text-red-700">×</button>
                        )}
                      </>
                    ) : (
                      <>
                        <span className={`text-xs px-2 py-1 rounded ${statut?.color || 'bg-gray-100'}`}>
                          {statut?.label || 'Présent'}
                          {p.statut_presence === 'remplace' && p.remplace_par_nom && (
                            <span className="ml-1">→ {p.remplace_par_nom}</span>
                          )}
                        </span>
                        {p.utilise_fonction_superieure && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded">⬆️ Fct.Sup.</span>}
                        {(p.prime_repas ?? true) && <span className="text-xs">🍽️</span>}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="bg-blue-50">
          <CardTitle className="text-lg text-blue-800">👥 Récapitulatif du personnel ({allPersonnel.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {allPersonnel.length === 0 ? (
            <p className="text-gray-500">Aucune ressource humaine enregistrée</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-2 text-left">Nom</th>
                    <th className="p-2 text-left">Véhicule</th>
                    <th className="p-2 text-left">Statut</th>
                    <th className="p-2 text-left">Remplaçant</th>
                    <th className="p-2 text-left">Primes repas</th>
                    <th className="p-2 text-left">Source</th>
                    {editMode && <th className="p-2 text-left">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {allPersonnel.map(resource => {
                    const statut = statutsPresence.find(s => s.value === (resource.statut_presence || 'present'));
                    return (
                      <tr key={resource.id} className="border-b">
                        <td className="p-2 font-medium">
                          {resource.user_name || resource.prenom + ' ' + resource.nom || resource.user_id || 'Non assigné'}
                          {resource.grade && <span className="text-gray-500 text-xs ml-1">({resource.grade})</span>}
                        </td>
                        <td className="p-2">{resource.vehicle_number || <span className="text-orange-600">Supplémentaire</span>}</td>
                        <td className="p-2">
                          {editMode ? (
                            <select
                              value={resource.statut_presence || 'present'}
                              onChange={(e) => updateStatutPresence(resource.id, e.target.value)}
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
                          {resource.statut_presence === 'remplace' ? (
                            editMode ? (
                              <select
                                value={resource.remplace_par || ''}
                                onChange={(e) => updateRemplacant(resource.id, e.target.value)}
                                className="text-xs rounded px-2 py-1 border bg-yellow-50 w-full"
                              >
                                <option value="">-- Choisir --</option>
                                {users
                                  .filter(u => (u.statut || '').toLowerCase() === 'actif' && u.id !== resource.id)
                                  .map(u => (
                                    <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>
                                  ))
                                }
                              </select>
                            ) : (
                              <span className="text-yellow-700 text-xs">{resource.remplace_par_nom || '-'}</span>
                            )
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </td>
                        <td className="p-2">
                          {editMode ? (
                            <div className="flex gap-1 flex-wrap">
                              <label className="flex items-center gap-1 text-xs bg-orange-50 px-2 py-1 rounded cursor-pointer" title="Déjeuner (6h-9h)">
                                <input
                                  type="checkbox"
                                  checked={resource.prime_dejeuner ?? false}
                                  onChange={(e) => updatePrimeRepasRecap(resource.id, 'prime_dejeuner', e.target.checked)}
                                  className="w-3 h-3"
                                />
                                <span>🌅</span>
                              </label>
                              <label className="flex items-center gap-1 text-xs bg-yellow-50 px-2 py-1 rounded cursor-pointer" title="Dîner (11h-14h)">
                                <input
                                  type="checkbox"
                                  checked={resource.prime_diner ?? false}
                                  onChange={(e) => updatePrimeRepasRecap(resource.id, 'prime_diner', e.target.checked)}
                                  className="w-3 h-3"
                                />
                                <span>☀️</span>
                              </label>
                              <label className="flex items-center gap-1 text-xs bg-indigo-50 px-2 py-1 rounded cursor-pointer" title="Souper (17h-20h)">
                                <input
                                  type="checkbox"
                                  checked={resource.prime_souper ?? false}
                                  onChange={(e) => updatePrimeRepasRecap(resource.id, 'prime_souper', e.target.checked)}
                                  className="w-3 h-3"
                                />
                                <span>🌙</span>
                              </label>
                            </div>
                          ) : (
                            <div className="flex gap-1">
                              {resource.prime_dejeuner && <span title="Déjeuner" className="text-xs bg-orange-100 px-1 rounded">🌅</span>}
                              {resource.prime_diner && <span title="Dîner" className="text-xs bg-yellow-100 px-1 rounded">☀️</span>}
                              {resource.prime_souper && <span title="Souper" className="text-xs bg-indigo-100 px-1 rounded">🌙</span>}
                              {!resource.prime_dejeuner && !resource.prime_diner && !resource.prime_souper && <span className="text-gray-400">-</span>}
                            </div>
                          )}
                        </td>
                        <td className="p-2">
                          <span className={`px-2 py-1 rounded text-xs ${resource.is_manual ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                            {resource.is_manual ? 'Manuel' : 'XML'}
                          </span>
                        </td>
                        {editMode && (
                          <td className="p-2">
                            {resource.is_manual && (
                              <button onClick={() => removePersonnel(resource.id)} className="text-red-500 hover:text-red-700">🗑️</button>
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

      {/* Modal Import Équipe de garde */}
      {showImportEquipe && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{ zIndex: 100001 }}>
          <div className="bg-white rounded-lg p-6 max-w-lg w-full">
            <h3 className="text-lg font-bold mb-4">📋 Importer équipe de garde</h3>
            
            {equipesGarde.length === 0 ? (
              <p className="text-gray-500 text-center py-4">
                Aucune équipe de garde trouvée pour cette date.<br/>
                <span className="text-sm">Vérifiez les paramètres d'équipes dans le module Planning.</span>
              </p>
            ) : (
              <div className="space-y-3">
                {equipesGarde.map(equipe => (
                  <div key={equipe.type_emploi} className="border rounded-lg p-4" style={{ borderColor: equipe.couleur }}>
                    <div className="flex justify-between items-center mb-3">
                      <div>
                        <span className="font-bold" style={{ color: equipe.couleur }}>{equipe.equipe_nom}</span>
                        <span className="text-gray-500 text-sm ml-2">
                          ({equipe.type_emploi === 'temps_plein' ? 'Temps plein' : 'Temps partiel'})
                        </span>
                      </div>
                      <Button size="sm" onClick={() => importerEquipe(equipe)}>
                        Importer ({equipe.membres.length})
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {equipe.membres.map(m => (
                        <span key={m.id} className="bg-gray-100 px-2 py-1 rounded text-xs">
                          {m.prenom} {m.nom} {m.grade && `(${m.grade})`}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            <div className="flex justify-end mt-4">
              <Button variant="outline" onClick={() => setShowImportEquipe(false)}>
                Fermer
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
      
      {/* Modal Ajout Véhicule */}
      {showAddVehicle && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{ zIndex: 100001 }}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-bold mb-4">🚒 Ajouter un véhicule</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Sélectionner un véhicule du tenant *</label>
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
                {tenantVehicles.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">Aucun véhicule trouvé. Ajoutez des véhicules dans Gestion des Actifs.</p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Nombre de pompiers</label>
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
            <h3 className="text-lg font-bold mb-4">
              👥 {selectedVehicle ? `Ajouter personnel au véhicule ${selectedVehicle.xml_vehicle_number}` : 'Ajouter du personnel'}
            </h3>
            
            {/* Barre de recherche */}
            <div className="mb-3">
              <input
                type="text"
                placeholder="🔍 Rechercher par nom..."
                value={searchPersonnel}
                onChange={(e) => setSearchPersonnel(e.target.value)}
                className="w-full border rounded-lg p-2"
              />
            </div>
            
            {/* Info garde interne */}
            {gardeInterneUsers.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded p-2 mb-3 text-sm text-blue-800">
                ℹ️ {gardeInterneUsers.length} personne(s) en garde interne pré-sélectionnée(s)
              </div>
            )}
            
            {loadingUsers ? (
              <p>Chargement...</p>
            ) : (
              <div className="space-y-1 overflow-y-auto flex-1" style={{ maxHeight: '300px' }}>
                {users.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">Aucun utilisateur trouvé</p>
                ) : users
                  .filter(u => (u.statut || '').toLowerCase() === 'actif')
                  .filter(u => {
                    if (!searchPersonnel) return true;
                    const search = searchPersonnel.toLowerCase();
                    return `${u.prenom} ${u.nom}`.toLowerCase().includes(search);
                  })
                  .map(user => {
                    const isGardeInterne = gardeInterneUsers.some(g => g.id === user.id);
                    return (
                      <label key={user.id} className={`flex items-center gap-2 p-2 rounded cursor-pointer ${isGardeInterne ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
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
                        {isGardeInterne && <span className="text-xs bg-blue-200 text-blue-800 px-1 rounded">Garde</span>}
                      </label>
                    );
                  })}
              </div>
            )}
            <div className="flex gap-2 mt-4 pt-3 border-t">
              <Button variant="outline" onClick={() => { setShowAddPersonnel(false); setSearchPersonnel(''); }} className="flex-1">
                Annuler
              </Button>
              <Button onClick={addPersonnelToVehicle} disabled={selectedPersonnel.length === 0} className="flex-1">
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
