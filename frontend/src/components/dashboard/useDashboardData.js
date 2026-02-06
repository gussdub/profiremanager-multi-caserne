/**
 * Hook personnalisé pour charger les données du dashboard
 */
import { useState, useEffect, useCallback } from 'react';

const API = process.env.REACT_APP_BACKEND_URL;

export const useDashboardData = (tenantSlug, userId, isAdmin) => {
  const [data, setData] = useState({
    heuresTravaillees: { internes: 0, externes: 0, total: 0 },
    formationsInscrites: [],
    tauxPresence: 0,
    prochainGarde: null,
    mesEPIAlerts: [],
    tauxCouverture: 0,
    personnesAbsentes: [],
    activitesRecentes: [],
    statsGenerales: {
      totalPersonnel: 0,
      interventionsMois: 0,
      formationsMois: 0,
      heuresGardeMois: 0,
      equipementsActifs: 0,
      vehiculesActifs: 0
    },
    alertesEquipements: {
      stockBas: [],
      maintenanceProche: [],
      finVieProche: [],
      aReparer: []
    },
    alertesVehicules: {
      inspectionProche: [],
      assuranceProche: [],
      immatriculationProche: [],
      entretienProche: []
    }
  });
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  const getToken = useCallback(() => {
    return localStorage.getItem(`${tenantSlug}_token`) || localStorage.getItem('token');
  }, [tenantSlug]);

  const fetchDashboardData = useCallback(async () => {
    if (!tenantSlug || !userId) return;

    setLoading(true);
    try {
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };
      const now = new Date();
      const debutMois = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const finMois = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
      const lundi = new Date(now);
      lundi.setDate(now.getDate() - now.getDay() + 1);
      const semaineDebut = lundi.toISOString().split('T')[0];

      const premierJourMoisCourant = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const premierJourMoisSuivant = now.getMonth() === 11
        ? `${now.getFullYear() + 1}-01-01`
        : `${now.getFullYear()}-${String(now.getMonth() + 2).padStart(2, '0')}-01`;

      // Appels en parallèle
      const [
        statsRes,
        activitesRes,
        formationsRes,
        gardesRes,
        epiRes,
        alertesRes
      ] = await Promise.allSettled([
        fetch(`${API}/api/${tenantSlug}/dashboard/stats`, { headers }),
        fetch(`${API}/api/${tenantSlug}/dashboard/activites-recentes`, { headers }),
        fetch(`${API}/api/${tenantSlug}/formations/user/${userId}?date_debut=${premierJourMoisCourant}&date_fin=${premierJourMoisSuivant}`, { headers }),
        fetch(`${API}/api/${tenantSlug}/planning/gardes?user_id=${userId}&date_debut=${semaineDebut}`, { headers }),
        fetch(`${API}/api/${tenantSlug}/epi/user/${userId}/alertes`, { headers }),
        isAdmin ? fetch(`${API}/api/${tenantSlug}/dashboard/alertes`, { headers }) : Promise.resolve({ ok: false })
      ]);

      const newData = { ...data };

      // Stats générales
      if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
        const stats = await statsRes.value.json();
        newData.statsGenerales = stats.stats || stats;
        newData.tauxCouverture = stats.taux_couverture || 0;
        newData.personnesAbsentes = stats.personnes_absentes || [];
        newData.heuresTravaillees = stats.heures_travaillees || { internes: 0, externes: 0, total: 0 };
        newData.tauxPresence = stats.taux_presence || 0;
      }

      // Activités récentes
      if (activitesRes.status === 'fulfilled' && activitesRes.value.ok) {
        const activites = await activitesRes.value.json();
        newData.activitesRecentes = activites.activites || activites || [];
      }

      // Formations
      if (formationsRes.status === 'fulfilled' && formationsRes.value.ok) {
        const formations = await formationsRes.value.json();
        newData.formationsInscrites = formations.formations || formations || [];
      }

      // Gardes
      if (gardesRes.status === 'fulfilled' && gardesRes.value.ok) {
        const gardes = await gardesRes.value.json();
        const gardesArray = gardes.gardes || gardes || [];
        const prochaine = gardesArray.find(g => new Date(g.date_debut) > new Date());
        newData.prochainGarde = prochaine || null;
      }

      // EPI Alerts
      if (epiRes.status === 'fulfilled' && epiRes.value.ok) {
        const epi = await epiRes.value.json();
        newData.mesEPIAlerts = epi.alertes || epi || [];
      }

      // Alertes admin
      if (isAdmin && alertesRes.status === 'fulfilled' && alertesRes.value.ok) {
        const alertes = await alertesRes.value.json();
        newData.alertesEquipements = alertes.equipements || newData.alertesEquipements;
        newData.alertesVehicules = alertes.vehicules || newData.alertesVehicules;
      }

      setData(newData);
      setLastRefresh(Date.now());
    } catch (error) {
      console.error('Erreur chargement dashboard:', error);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, userId, isAdmin, getToken]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  return {
    ...data,
    loading,
    lastRefresh,
    refresh: fetchDashboardData
  };
};

export default useDashboardData;
