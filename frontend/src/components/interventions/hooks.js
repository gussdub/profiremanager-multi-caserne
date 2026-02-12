/**
 * Hook personnalisé pour la gestion des interventions
 * Centralise la logique de chargement, sauvegarde et manipulation des données
 */
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export const useInterventions = (tenantSlug) => {
  const [interventions, setInterventions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filtres, setFiltres] = useState({
    annee: new Date().getFullYear(),
    mois: '',
    type: '',
    statut: ''
  });

  const getToken = useCallback(() => {
    return localStorage.getItem(`${tenantSlug}_token`) || localStorage.getItem('token');
  }, [tenantSlug]);

  const fetchInterventions = useCallback(async () => {
    if (!tenantSlug) return;
    
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtres.annee) params.append('annee', filtres.annee);
      if (filtres.mois) params.append('mois', filtres.mois);
      if (filtres.type) params.append('type', filtres.type);
      if (filtres.statut) params.append('statut', filtres.statut);
      
      const response = await fetch(`${API_URL}/api/${tenantSlug}/interventions?${params}`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setInterventions(data.interventions || data || []);
      }
    } catch (error) {
      console.error('Erreur chargement interventions:', error);
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, getToken, filtres]);

  const createIntervention = useCallback(async (interventionData) => {
    try {
      const response = await fetch(`${API_URL}/api/${tenantSlug}/interventions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(interventionData)
      });
      
      if (response.ok) {
        const data = await response.json();
        toast.success('Intervention créée');
        fetchInterventions();
        return data;
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Erreur de création');
        return null;
      }
    } catch (error) {
      toast.error('Erreur de connexion');
      return null;
    }
  }, [tenantSlug, getToken, fetchInterventions]);

  const updateIntervention = useCallback(async (interventionId, data) => {
    try {
      const response = await fetch(`${API_URL}/api/${tenantSlug}/interventions/${interventionId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
      
      if (response.ok) {
        toast.success('Intervention mise à jour');
        fetchInterventions();
        return true;
      } else {
        toast.error('Erreur de mise à jour');
        return false;
      }
    } catch (error) {
      toast.error('Erreur de connexion');
      return false;
    }
  }, [tenantSlug, getToken, fetchInterventions]);

  const deleteIntervention = useCallback(async (interventionId, skipConfirmation = false) => {
    // La confirmation doit être gérée par le composant appelant avec useConfirmDialog
    
    try {
      const response = await fetch(`${API_URL}/api/${tenantSlug}/interventions/${interventionId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      
      if (response.ok) {
        toast.success('Intervention supprimée');
        fetchInterventions();
        return true;
      } else {
        toast.error('Erreur de suppression');
        return false;
      }
    } catch (error) {
      toast.error('Erreur de connexion');
      return false;
    }
  }, [tenantSlug, getToken, fetchInterventions]);

  useEffect(() => {
    fetchInterventions();
  }, [fetchInterventions]);

  return {
    interventions,
    loading,
    filtres,
    setFiltres,
    fetchInterventions,
    createIntervention,
    updateIntervention,
    deleteIntervention
  };
};

export const useInterventionDetail = (tenantSlug, interventionId) => {
  const [intervention, setIntervention] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const getToken = useCallback(() => {
    return localStorage.getItem(`${tenantSlug}_token`) || localStorage.getItem('token');
  }, [tenantSlug]);

  const fetchIntervention = useCallback(async () => {
    if (!tenantSlug || !interventionId) return;
    
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/${tenantSlug}/interventions/${interventionId}`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setIntervention(data);
      }
    } catch (error) {
      console.error('Erreur chargement intervention:', error);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, interventionId, getToken]);

  const saveIntervention = useCallback(async (data) => {
    if (!interventionId) return false;
    
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/${tenantSlug}/interventions/${interventionId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data || intervention)
      });
      
      if (response.ok) {
        toast.success('Intervention enregistrée');
        fetchIntervention();
        return true;
      } else {
        toast.error('Erreur de sauvegarde');
        return false;
      }
    } catch (error) {
      toast.error('Erreur de connexion');
      return false;
    } finally {
      setSaving(false);
    }
  }, [tenantSlug, interventionId, getToken, intervention, fetchIntervention]);

  useEffect(() => {
    fetchIntervention();
  }, [fetchIntervention]);

  return {
    intervention,
    setIntervention,
    loading,
    saving,
    fetchIntervention,
    saveIntervention
  };
};

export const useInterventionSettings = (tenantSlug) => {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(false);

  const getToken = useCallback(() => {
    return localStorage.getItem(`${tenantSlug}_token`) || localStorage.getItem('token');
  }, [tenantSlug]);

  const fetchSettings = useCallback(async () => {
    if (!tenantSlug) return;
    
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/${tenantSlug}/interventions/settings`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setSettings(data.settings);
      }
    } catch (error) {
      console.error('Erreur chargement settings:', error);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, getToken]);

  const saveSettings = useCallback(async (newSettings) => {
    try {
      const response = await fetch(`${API_URL}/api/${tenantSlug}/interventions/settings`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newSettings || settings)
      });
      
      if (response.ok) {
        toast.success('Paramètres enregistrés');
        return true;
      } else {
        toast.error('Erreur de sauvegarde');
        return false;
      }
    } catch (error) {
      toast.error('Erreur de connexion');
      return false;
    }
  }, [tenantSlug, getToken, settings]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return {
    settings,
    setSettings,
    loading,
    fetchSettings,
    saveSettings
  };
};

export const useDSIReferences = (tenantSlug) => {
  const [references, setReferences] = useState({
    causes: [],
    sources_chaleur: [],
    materiaux: [],
    facteurs_allumage: [],
    usages_batiment: [],
    natures_sinistre: []
  });
  const [loading, setLoading] = useState(false);

  const getToken = useCallback(() => {
    return localStorage.getItem(`${tenantSlug}_token`) || localStorage.getItem('token');
  }, [tenantSlug]);

  const fetchReferences = useCallback(async () => {
    if (!tenantSlug) return;
    
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/${tenantSlug}/interventions/dsi-references`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setReferences(data);
      }
    } catch (error) {
      console.error('Erreur chargement références DSI:', error);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, getToken]);

  useEffect(() => {
    fetchReferences();
  }, [fetchReferences]);

  return {
    references,
    loading,
    fetchReferences
  };
};
