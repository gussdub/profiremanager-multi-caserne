import { useState, useCallback, useMemo } from 'react';

/**
 * Hook personnalisé pour la gestion des filtres de remplacements et congés
 * Centralise la logique de filtrage par statut et période
 */
const useRemplacementsFilters = () => {
  const [filterStatut, setFilterStatut] = useState('non_traitees');
  const [filterPeriode, setFilterPeriode] = useState('toutes');
  const [filterDateDebut, setFilterDateDebut] = useState('');
  const [filterDateFin, setFilterDateFin] = useState('');

  // Obtenir les dates de la période sélectionnée
  const getPeriodeDates = useCallback(() => {
    const now = new Date();
    let dateDebut = null;
    let dateFin = null;

    switch (filterPeriode) {
      case 'ce_mois':
        dateDebut = new Date(now.getFullYear(), now.getMonth(), 1);
        dateFin = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'mois_precedent':
        dateDebut = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        dateFin = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case '3_mois':
        dateDebut = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        dateFin = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'cette_annee':
        dateDebut = new Date(now.getFullYear(), 0, 1);
        dateFin = new Date(now.getFullYear(), 11, 31);
        break;
      case 'personnalise':
        if (filterDateDebut) dateDebut = new Date(filterDateDebut);
        if (filterDateFin) dateFin = new Date(filterDateFin);
        break;
      default: // 'toutes'
        return { dateDebut: null, dateFin: null };
    }
    return { dateDebut, dateFin };
  }, [filterPeriode, filterDateDebut, filterDateFin]);

  // Fonction de filtrage générique
  const filterByStatutAndPeriode = useCallback((items, dateField = 'date') => {
    let filtered = [...items];
    
    // Filtre par statut
    if (filterStatut !== 'toutes') {
      if (filterStatut === 'non_traitees') {
        filtered = filtered.filter(d => ['en_attente', 'en_cours'].includes(d.statut));
      } else if (filterStatut === 'acceptees') {
        filtered = filtered.filter(d => ['accepte', 'approuve', 'approuve_manuellement'].includes(d.statut));
      } else if (filterStatut === 'refusees') {
        filtered = filtered.filter(d => ['refuse', 'refusee', 'annulee', 'expiree'].includes(d.statut));
      }
    }
    
    // Filtre par période
    const { dateDebut, dateFin } = getPeriodeDates();
    if (dateDebut || dateFin) {
      filtered = filtered.filter(d => {
        const itemDate = new Date(d[dateField] || d.created_at);
        if (dateDebut && itemDate < dateDebut) return false;
        if (dateFin && itemDate > dateFin) return false;
        return true;
      });
    }
    
    return filtered;
  }, [filterStatut, getPeriodeDates]);

  // Réinitialiser les filtres
  const resetFilters = useCallback(() => {
    setFilterStatut('non_traitees');
    setFilterPeriode('toutes');
    setFilterDateDebut('');
    setFilterDateFin('');
  }, []);

  // Créer les fonctions de filtrage spécifiques
  const createFilteredDemandes = useCallback((demandes) => {
    return filterByStatutAndPeriode(demandes, 'date');
  }, [filterByStatutAndPeriode]);

  const createFilteredConges = useCallback((conges) => {
    return filterByStatutAndPeriode(conges, 'date_debut');
  }, [filterByStatutAndPeriode]);

  return {
    // États des filtres
    filterStatut,
    filterPeriode,
    filterDateDebut,
    filterDateFin,
    // Setters
    setFilterStatut,
    setFilterPeriode,
    setFilterDateDebut,
    setFilterDateFin,
    // Actions
    resetFilters,
    // Fonctions de filtrage
    filterByStatutAndPeriode,
    createFilteredDemandes,
    createFilteredConges
  };
};

export default useRemplacementsFilters;
