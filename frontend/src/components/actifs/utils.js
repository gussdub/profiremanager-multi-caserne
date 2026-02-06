/**
 * Utilitaires et constantes pour le module Gestion des Actifs
 */

// États des véhicules
export const vehiculeEtats = [
  { value: 'en_service', label: 'En service', color: '#22c55e', bgColor: '#dcfce7' },
  { value: 'en_maintenance', label: 'En maintenance', color: '#f59e0b', bgColor: '#fef3c7' },
  { value: 'hors_service', label: 'Hors service', color: '#ef4444', bgColor: '#fee2e2' }
];

// Types de véhicules
export const vehiculeTypes = [
  { value: 'autopompe', label: 'Autopompe' },
  { value: 'echelle', label: 'Échelle' },
  { value: 'citerne', label: 'Citerne' },
  { value: 'vus', label: 'VUS / Chef' },
  { value: 'remorque', label: 'Remorque' },
  { value: 'bateau', label: 'Bateau' },
  { value: 'autre', label: 'Autre' }
];

// États des équipements
export const equipementEtats = [
  { value: 'neuf', label: 'Neuf', color: '#3b82f6', bgColor: '#dbeafe' },
  { value: 'bon', label: 'Bon', color: '#22c55e', bgColor: '#dcfce7' },
  { value: 'a_reparer', label: 'À réparer', color: '#f59e0b', bgColor: '#fef3c7' },
  { value: 'en_reparation', label: 'En réparation', color: '#8b5cf6', bgColor: '#ede9fe' },
  { value: 'hors_service', label: 'Hors service', color: '#ef4444', bgColor: '#fee2e2' }
];

// Types de points d'eau
export const pointEauTypes = [
  { value: 'borne', label: 'Borne-fontaine' },
  { value: 'point_eau', label: 'Point d\'eau naturel' },
  { value: 'reservoir', label: 'Réservoir' },
  { value: 'piscine', label: 'Piscine' },
  { value: 'cours_eau', label: 'Cours d\'eau' },
  { value: 'autre', label: 'Autre' }
];

// États des points d'eau
export const pointEauEtats = [
  { value: 'fonctionnel', label: 'Fonctionnel', color: '#22c55e', bgColor: '#dcfce7' },
  { value: 'a_verifier', label: 'À vérifier', color: '#f59e0b', bgColor: '#fef3c7' },
  { value: 'hors_service', label: 'Hors service', color: '#ef4444', bgColor: '#fee2e2' },
  { value: 'hivernal', label: 'Hivernisé', color: '#3b82f6', bgColor: '#dbeafe' }
];

// Formater le statut d'un véhicule
export const formatVehiculeStatut = (statut) => {
  const etat = vehiculeEtats.find(e => e.value === statut);
  return etat || { label: statut, color: '#6b7280', bgColor: '#f3f4f6' };
};

// Formater le statut d'un équipement
export const formatEquipementStatut = (statut) => {
  const etat = equipementEtats.find(e => e.value === statut);
  return etat || { label: statut, color: '#6b7280', bgColor: '#f3f4f6' };
};

// Formater le statut d'un point d'eau
export const formatPointEauStatut = (statut) => {
  const etat = pointEauEtats.find(e => e.value === statut);
  return etat || { label: statut, color: '#6b7280', bgColor: '#f3f4f6' };
};

// Vérifier si une date est proche (30 jours par défaut)
export const isDateProche = (dateString, joursAvant = 30) => {
  if (!dateString) return false;
  const date = new Date(dateString);
  const now = new Date();
  const diff = date - now;
  const joursRestants = diff / (1000 * 60 * 60 * 24);
  return joursRestants > 0 && joursRestants <= joursAvant;
};

// Vérifier si une date est dépassée
export const isDateDepassee = (dateString) => {
  if (!dateString) return false;
  return new Date(dateString) < new Date();
};

// Calculer le pourcentage de vie restante
export const calculerVieRestante = (dateAcquisition, dateFin) => {
  if (!dateAcquisition || !dateFin) return null;
  
  const debut = new Date(dateAcquisition);
  const fin = new Date(dateFin);
  const now = new Date();
  
  const vieTotal = fin - debut;
  const vieEcoulee = now - debut;
  
  if (vieTotal <= 0) return 0;
  
  const pourcentageRestant = Math.max(0, Math.min(100, 100 - (vieEcoulee / vieTotal * 100)));
  return Math.round(pourcentageRestant);
};

// Formater une date pour affichage
export const formatDate = (dateString) => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('fr-CA');
};

// Formater un montant en dollars
export const formatMontant = (montant) => {
  if (montant === null || montant === undefined) return '-';
  return new Intl.NumberFormat('fr-CA', { 
    style: 'currency', 
    currency: 'CAD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(montant);
};
