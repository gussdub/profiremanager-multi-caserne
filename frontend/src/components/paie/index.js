/**
 * Module de Paie - Exports centralisés
 * 
 * Ce fichier centralise les exports du module de paie pour faciliter
 * l'import dans d'autres composants.
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

// Les composants seront ajoutés ici au fur et à mesure de la refactorisation
// export { default as TabFeuilles } from './TabFeuilles';
// export { default as TabParametres } from './TabParametres';
// export { default as TabExport } from './TabExport';
// export { default as TabMatricules } from './TabMatricules';
// export { default as ModalDetailFeuille } from './ModalDetailFeuille';
