/**
 * Hook personnalisé pour la gestion des paramètres de paie
 * Centralise la logique de chargement, sauvegarde et manipulation des données
 */
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export const usePaieParametres = (tenant) => {
  const [parametres, setParametres] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const getToken = useCallback(() => {
    return localStorage.getItem(`${tenant}_token`) || localStorage.getItem('token');
  }, [tenant]);

  const fetchParametres = useCallback(async () => {
    if (!tenant) return;
    
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/parametres`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        const data = await response.json();
        setParametres(data);
      }
    } catch (error) {
      console.error('Erreur chargement paramètres:', error);
      toast.error('Erreur de chargement des paramètres');
    } finally {
      setLoading(false);
    }
  }, [tenant, getToken]);

  const saveParametres = useCallback(async (newParametres) => {
    if (!tenant) return false;
    
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/parametres`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newParametres || parametres)
      });
      
      if (response.ok) {
        toast.success('Paramètres enregistrés');
        return true;
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Erreur de sauvegarde');
        return false;
      }
    } catch (error) {
      console.error('Erreur sauvegarde:', error);
      toast.error('Erreur de connexion');
      return false;
    } finally {
      setSaving(false);
    }
  }, [tenant, getToken, parametres]);

  useEffect(() => {
    fetchParametres();
  }, [fetchParametres]);

  return {
    parametres,
    setParametres,
    loading,
    saving,
    fetchParametres,
    saveParametres
  };
};

export const usePaieConfig = (tenant) => {
  const [payrollConfig, setPayrollConfig] = useState(null);
  const [providersDisponibles, setProvidersDisponibles] = useState([]);
  const [loading, setLoading] = useState(false);

  const getToken = useCallback(() => {
    return localStorage.getItem(`${tenant}_token`) || localStorage.getItem('token');
  }, [tenant]);

  const fetchConfig = useCallback(async () => {
    if (!tenant) return;
    
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/config`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        const data = await response.json();
        setPayrollConfig(data.config);
        setProvidersDisponibles(data.providers || []);
      }
    } catch (error) {
      console.error('Erreur chargement config:', error);
    } finally {
      setLoading(false);
    }
  }, [tenant, getToken]);

  const saveConfig = useCallback(async (config) => {
    if (!tenant) return false;
    
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/config`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(config || payrollConfig)
      });
      
      if (response.ok) {
        toast.success('Configuration enregistrée');
        return true;
      } else {
        toast.error('Erreur de sauvegarde');
        return false;
      }
    } catch (error) {
      toast.error('Erreur de connexion');
      return false;
    }
  }, [tenant, getToken, payrollConfig]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  return {
    payrollConfig,
    setPayrollConfig,
    providersDisponibles,
    loading,
    fetchConfig,
    saveConfig
  };
};

export const useFeuillésTemps = (tenant) => {
  const [feuilles, setFeuilles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filtres, setFiltres] = useState({
    annee: new Date().getFullYear(),
    mois: '',
    employe: '',
    statut: ''
  });

  const getToken = useCallback(() => {
    return localStorage.getItem(`${tenant}_token`) || localStorage.getItem('token');
  }, [tenant]);

  const fetchFeuilles = useCallback(async () => {
    if (!tenant) return;
    
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtres.annee) params.append('annee', filtres.annee);
      if (filtres.mois) params.append('mois', filtres.mois);
      if (filtres.employe) params.append('employe_id', filtres.employe);
      if (filtres.statut) params.append('statut', filtres.statut);
      
      const response = await fetch(`${API_URL}/api/${tenant}/paie/feuilles-temps?${params}`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setFeuilles(data.feuilles || []);
      }
    } catch (error) {
      console.error('Erreur chargement feuilles:', error);
    } finally {
      setLoading(false);
    }
  }, [tenant, getToken, filtres]);

  const validerFeuille = useCallback(async (feuilleId) => {
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/feuilles-temps/${feuilleId}/valider`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      
      if (response.ok) {
        toast.success('Feuille validée');
        fetchFeuilles();
        return true;
      } else {
        toast.error('Erreur de validation');
        return false;
      }
    } catch (error) {
      toast.error('Erreur de connexion');
      return false;
    }
  }, [tenant, getToken, fetchFeuilles]);

  const supprimerFeuille = useCallback(async (feuilleId, skipConfirmation = false) => {
    // La confirmation doit être gérée par le composant appelant avec useConfirmDialog
    
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/feuilles-temps/${feuilleId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      
      if (response.ok) {
        toast.success('Feuille supprimée');
        fetchFeuilles();
        return true;
      } else {
        toast.error('Erreur de suppression');
        return false;
      }
    } catch (error) {
      toast.error('Erreur de connexion');
      return false;
    }
  }, [tenant, getToken, fetchFeuilles]);

  useEffect(() => {
    fetchFeuilles();
  }, [fetchFeuilles]);

  return {
    feuilles,
    loading,
    filtres,
    setFiltres,
    fetchFeuilles,
    validerFeuille,
    supprimerFeuille
  };
};

export const useCodeMappings = (tenant) => {
  const [codeMappings, setCodeMappings] = useState([]);
  const [eventTypes, setEventTypes] = useState([]);
  const [loading, setLoading] = useState(false);

  const getToken = useCallback(() => {
    return localStorage.getItem(`${tenant}_token`) || localStorage.getItem('token');
  }, [tenant]);

  const fetchCodeMappings = useCallback(async () => {
    if (!tenant) return;
    
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/code-mappings`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        const data = await response.json();
        setCodeMappings(data.mappings || []);
        setEventTypes(data.event_types || []);
      }
    } catch (error) {
      console.error('Erreur chargement mappings:', error);
    } finally {
      setLoading(false);
    }
  }, [tenant, getToken]);

  const addEventType = useCallback(async (eventType) => {
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/event-types`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(eventType)
      });
      
      if (response.ok) {
        toast.success('Type ajouté');
        fetchCodeMappings();
        return true;
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Erreur');
        return false;
      }
    } catch (error) {
      toast.error('Erreur de connexion');
      return false;
    }
  }, [tenant, getToken, fetchCodeMappings]);

  const updateEventType = useCallback(async (eventTypeId, data) => {
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/event-types/${eventTypeId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
      
      if (response.ok) {
        toast.success('Type modifié');
        fetchCodeMappings();
        return true;
      } else {
        toast.error('Erreur de modification');
        return false;
      }
    } catch (error) {
      toast.error('Erreur de connexion');
      return false;
    }
  }, [tenant, getToken, fetchCodeMappings]);

  const deleteEventType = useCallback(async (eventTypeId, skipConfirmation = false) => {
    // La confirmation doit être gérée par le composant appelant avec useConfirmDialog
    
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/event-types/${eventTypeId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      
      if (response.ok) {
        toast.success('Type supprimé');
        fetchCodeMappings();
        return true;
      } else {
        toast.error('Erreur de suppression');
        return false;
      }
    } catch (error) {
      toast.error('Erreur de connexion');
      return false;
    }
  }, [tenant, getToken, fetchCodeMappings]);

  useEffect(() => {
    fetchCodeMappings();
  }, [fetchCodeMappings]);

  return {
    codeMappings,
    eventTypes,
    loading,
    fetchCodeMappings,
    addEventType,
    updateEventType,
    deleteEventType
  };
};
