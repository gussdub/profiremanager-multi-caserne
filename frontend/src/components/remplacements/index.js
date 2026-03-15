/**
 * Module Remplacements
 * ====================
 * 
 * Structure modulaire pour la gestion des remplacements et congés.
 * 
 * Composants disponibles:
 * - KPICards: Cartes de statistiques (total, acceptées, refusées, etc.)
 * - FilterBar: Barre de filtres (statut, période, export)
 * - TabsBar: Onglets (Propositions, Remplacements, Congés)
 * - PropositionsRecues: Liste des propositions reçues
 * - DemandeCard: Carte individuelle de demande
 * - RemplacementsList: Liste des demandes de remplacement
 * - CongesList: Liste des demandes de congé
 * - CreateRemplacementModal: Modal de création de remplacement
 * - CreateCongeModal: Modal de création de congé
 * - ExportModal: Modal d'export PDF/Excel
 * - ImpactPlanningModal: Modal d'impact sur le planning
 */

// Export des sous-composants
export { default as KPICards } from './KPICards';
export { default as FilterBar } from './FilterBar';
export { default as TabsBar } from './TabsBar';
export { default as PropositionsRecues } from './PropositionsRecues';
export { default as DemandeCard } from './DemandeCard';
export { default as RemplacementsList } from './RemplacementsList';
export { default as CongesList } from './CongesList';
export { default as CreateRemplacementModal } from './CreateRemplacementModal';
export { default as CreateCongeModal } from './CreateCongeModal';
export { default as ExportModal } from './ExportModal';
export { default as ImpactPlanningModal } from './ImpactPlanningModal';

// Réexport du composant principal
export { default } from '../Remplacements';
