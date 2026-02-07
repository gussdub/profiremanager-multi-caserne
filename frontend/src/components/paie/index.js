/**
 * Module de Paie - Exports centralisés
 */

// Utilitaires
export * from './utils';

// Hooks personnalisés
export {
  usePaieParametres,
  usePaieConfig,
  useFeuillésTemps,
  useCodeMappings
} from './hooks';

// Composants d'onglets
export { default as TabParametres } from './TabParametres';
export { default as TabExport } from './TabExport';
export { default as TabFeuilles } from './TabFeuilles';
export { default as TabMatricules } from './TabMatricules';
export { default as TabJoursFeries } from './TabJoursFeries';
