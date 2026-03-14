/**
 * Module Remplacements
 * ====================
 * 
 * Structure modulaire pour la gestion des remplacements.
 * 
 * Composants disponibles:
 * - KPICards: Cartes de statistiques (total, acceptées, refusées, etc.)
 * - FilterBar: Barre de filtres (statut, période, export)
 * - TabsBar: Onglets (Propositions, Remplacements, Congés)
 * - PropositionsRecues: Liste des propositions reçues
 * 
 * Composants à migrer:
 * - DemandesList: Liste des demandes de remplacement
 * - CongesTab: Onglet des congés
 * - CreateDemandeModal: Modal de création
 */

// Export des sous-composants
export { default as KPICards } from './KPICards';
export { default as FilterBar } from './FilterBar';
export { default as TabsBar } from './TabsBar';
export { default as PropositionsRecues } from './PropositionsRecues';

// Réexport du composant principal
export { default } from '../Remplacements';
