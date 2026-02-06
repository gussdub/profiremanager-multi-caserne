/**
 * Hooks personnalisés pour la gestion des actifs (véhicules, équipements, EPI)
 */
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export const useVehicules = (tenant) => {
  const [vehicules, setVehicules] = useState([]);
  const [loading, setLoading] = useState(false);

  const getToken = useCallback(() => {
    return localStorage.getItem(`${tenant}_token`) || localStorage.getItem('token');
  }, [tenant]);

  const fetchVehicules = useCallback(async () => {
    if (!tenant) return;
    
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/actifs/vehicules`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        const data = await response.json();
        setVehicules(data || []);
      }
    } catch (error) {
      console.error('Erreur chargement véhicules:', error);
    } finally {
      setLoading(false);
    }
  }, [tenant, getToken]);

  const createVehicule = useCallback(async (vehiculeData) => {
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/actifs/vehicules`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(vehiculeData)
      });
      
      if (response.ok) {
        toast.success('Véhicule ajouté');
        fetchVehicules();
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
  }, [tenant, getToken, fetchVehicules]);

  const updateVehicule = useCallback(async (vehiculeId, data) => {
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/actifs/vehicules/${vehiculeId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
      
      if (response.ok) {
        toast.success('Véhicule mis à jour');
        fetchVehicules();
        return true;
      } else {
        toast.error('Erreur de mise à jour');
        return false;
      }
    } catch (error) {
      toast.error('Erreur de connexion');
      return false;
    }
  }, [tenant, getToken, fetchVehicules]);

  const deleteVehicule = useCallback(async (vehiculeId) => {
    if (!window.confirm('Supprimer ce véhicule ?')) return false;
    
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/actifs/vehicules/${vehiculeId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      
      if (response.ok) {
        toast.success('Véhicule supprimé');
        fetchVehicules();
        return true;
      } else {
        toast.error('Erreur de suppression');
        return false;
      }
    } catch (error) {
      toast.error('Erreur de connexion');
      return false;
    }
  }, [tenant, getToken, fetchVehicules]);

  useEffect(() => {
    fetchVehicules();
  }, [fetchVehicules]);

  return {
    vehicules,
    loading,
    fetchVehicules,
    createVehicule,
    updateVehicule,
    deleteVehicule
  };
};

export const useEquipements = (tenant) => {
  const [equipements, setEquipements] = useState([]);
  const [loading, setLoading] = useState(false);

  const getToken = useCallback(() => {
    return localStorage.getItem(`${tenant}_token`) || localStorage.getItem('token');
  }, [tenant]);

  const fetchEquipements = useCallback(async () => {
    if (!tenant) return;
    
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/equipements`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        const data = await response.json();
        setEquipements(data.equipements || data || []);
      }
    } catch (error) {
      console.error('Erreur chargement équipements:', error);
    } finally {
      setLoading(false);
    }
  }, [tenant, getToken]);

  const createEquipement = useCallback(async (equipementData) => {
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/equipements`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(equipementData)
      });
      
      if (response.ok) {
        toast.success('Équipement ajouté');
        fetchEquipements();
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
  }, [tenant, getToken, fetchEquipements]);

  const updateEquipement = useCallback(async (equipementId, data) => {
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/equipements/${equipementId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
      
      if (response.ok) {
        toast.success('Équipement mis à jour');
        fetchEquipements();
        return true;
      } else {
        toast.error('Erreur de mise à jour');
        return false;
      }
    } catch (error) {
      toast.error('Erreur de connexion');
      return false;
    }
  }, [tenant, getToken, fetchEquipements]);

  const deleteEquipement = useCallback(async (equipementId) => {
    if (!window.confirm('Supprimer cet équipement ?')) return false;
    
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/equipements/${equipementId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      
      if (response.ok) {
        toast.success('Équipement supprimé');
        fetchEquipements();
        return true;
      } else {
        toast.error('Erreur de suppression');
        return false;
      }
    } catch (error) {
      toast.error('Erreur de connexion');
      return false;
    }
  }, [tenant, getToken, fetchEquipements]);

  useEffect(() => {
    fetchEquipements();
  }, [fetchEquipements]);

  return {
    equipements,
    loading,
    fetchEquipements,
    createEquipement,
    updateEquipement,
    deleteEquipement
  };
};

export const useEPI = (tenant) => {
  const [epiList, setEpiList] = useState([]);
  const [loading, setLoading] = useState(false);

  const getToken = useCallback(() => {
    return localStorage.getItem(`${tenant}_token`) || localStorage.getItem('token');
  }, [tenant]);

  const fetchEPI = useCallback(async () => {
    if (!tenant) return;
    
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/epi`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        const data = await response.json();
        setEpiList(data.epi || data || []);
      }
    } catch (error) {
      console.error('Erreur chargement EPI:', error);
    } finally {
      setLoading(false);
    }
  }, [tenant, getToken]);

  useEffect(() => {
    fetchEPI();
  }, [fetchEPI]);

  return {
    epiList,
    loading,
    fetchEPI
  };
};

export const usePointsEau = (tenant) => {
  const [pointsEau, setPointsEau] = useState([]);
  const [loading, setLoading] = useState(false);

  const getToken = useCallback(() => {
    return localStorage.getItem(`${tenant}_token`) || localStorage.getItem('token');
  }, [tenant]);

  const fetchPointsEau = useCallback(async () => {
    if (!tenant) return;
    
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/points-eau`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        const data = await response.json();
        setPointsEau(data.points_eau || data || []);
      }
    } catch (error) {
      console.error('Erreur chargement points d\'eau:', error);
    } finally {
      setLoading(false);
    }
  }, [tenant, getToken]);

  const createPointEau = useCallback(async (pointData) => {
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/points-eau`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(pointData)
      });
      
      if (response.ok) {
        toast.success('Point d\'eau ajouté');
        fetchPointsEau();
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
  }, [tenant, getToken, fetchPointsEau]);

  useEffect(() => {
    fetchPointsEau();
  }, [fetchPointsEau]);

  return {
    pointsEau,
    loading,
    fetchPointsEau,
    createPointEau
  };
};
