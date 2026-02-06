/**
 * Utilitaires et constantes pour le module de paie
 */

// Formatage des montants en dollars canadiens
export const formatMontant = (montant) => {
  if (montant === null || montant === undefined) return '-';
  return new Intl.NumberFormat('fr-CA', { 
    style: 'currency', 
    currency: 'CAD' 
  }).format(montant);
};

// Formatage des heures
export const formatHeures = (heures) => {
  if (heures === null || heures === undefined) return '-';
  return `${heures.toFixed(2)}h`;
};

// Styles des badges de statut
export const statutStyles = {
  brouillon: { bg: '#fef3c7', color: '#92400e', text: 'Brouillon' },
  valide: { bg: '#d1fae5', color: '#065f46', text: 'Validé' },
  exporte: { bg: '#dbeafe', color: '#1e40af', text: 'Exporté' }
};

// Catégories de types d'heures
export const categoriesHeures = [
  { value: 'heures', label: 'Heures travaillées', bgColor: '#dbeafe', textColor: '#1e40af' },
  { value: 'prime', label: 'Prime / Bonus', bgColor: '#fef3c7', textColor: '#92400e' },
  { value: 'frais', label: 'Frais / Remboursement', bgColor: '#dcfce7', textColor: '#166534' },
  { value: 'deduction', label: 'Déduction', bgColor: '#fee2e2', textColor: '#991b1b' }
];

// Unités disponibles
export const unites = [
  { value: 'heures', label: 'Heures (h)', shortLabel: 'h' },
  { value: 'km', label: 'Kilomètres (km)', shortLabel: 'km' },
  { value: 'montant', label: 'Montant ($)', shortLabel: '$' },
  { value: 'quantite', label: 'Quantité', shortLabel: 'qté' }
];

// Liste des mois en français
export const moisOptions = [
  { value: '', label: 'Tous les mois' },
  { value: '01', label: 'Janvier' },
  { value: '02', label: 'Février' },
  { value: '03', label: 'Mars' },
  { value: '04', label: 'Avril' },
  { value: '05', label: 'Mai' },
  { value: '06', label: 'Juin' },
  { value: '07', label: 'Juillet' },
  { value: '08', label: 'Août' },
  { value: '09', label: 'Septembre' },
  { value: '10', label: 'Octobre' },
  { value: '11', label: 'Novembre' },
  { value: '12', label: 'Décembre' }
];

// Calcul du montant pour une ligne de feuille de temps
export const calculerMontantLigne = (ligne, tauxHoraire, eventTypes) => {
  const eventType = eventTypes.find(et => et.code === ligne.type);
  
  if (!eventType) {
    return ligne.heures_payees * tauxHoraire;
  }
  
  const unit = eventType.unit || 'heures';
  const rate = eventType.default_rate;
  
  switch (unit) {
    case 'km':
      return (ligne.quantite || ligne.heures_payees) * (rate || 0);
    case 'montant':
      return rate || ligne.montant || 0;
    case 'quantite':
      return (ligne.quantite || 1) * (rate || 0);
    case 'heures':
    default:
      return ligne.heures_payees * tauxHoraire * (rate || 1);
  }
};

// Validation d'une feuille de temps
export const validerFeuille = (feuille) => {
  const erreurs = [];
  
  if (!feuille.employe_id) {
    erreurs.push('Employé requis');
  }
  
  if (!feuille.periode_debut || !feuille.periode_fin) {
    erreurs.push('Période requise');
  }
  
  if (!feuille.lignes || feuille.lignes.length === 0) {
    erreurs.push('Au moins une ligne est requise');
  }
  
  return {
    valide: erreurs.length === 0,
    erreurs
  };
};

// Génération des années disponibles (5 ans en arrière, 1 an en avant)
export const genererAnneesDisponibles = () => {
  const anneeActuelle = new Date().getFullYear();
  const annees = [];
  for (let i = anneeActuelle - 5; i <= anneeActuelle + 1; i++) {
    annees.push(i);
  }
  return annees;
};
