/**
 * Module Actifs - Exports centralisés
 */

// Hooks personnalisés
export {
  useVehicules,
  useEquipements,
  useEPI,
  usePointsEau
} from './hooks';

// Utilitaires et constantes
export * from './utils';

// Composants d'onglets
export { TabButton, MobileTabButton, ActionButton, VehiculesTab, BornesTab } from './ActifsTabComponents';

// Container de modals
export { default as ActifsModalsContainer } from './ActifsModalsContainer';
