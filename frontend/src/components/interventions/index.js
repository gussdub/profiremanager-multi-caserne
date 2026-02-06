// Composants extraits de GestionInterventions.jsx pour réduire la taille du fichier
export { default as SectionIdentification } from './SectionIdentification';
export { default as SectionBatiment } from './SectionBatiment';
export { default as SectionRessources } from './SectionRessources';
export { default as SectionDSI } from './SectionDSI';
export { default as SectionProtection } from './SectionProtection';
export { default as SectionMateriel } from './SectionMateriel';
export { default as SectionPertes } from './SectionPertes';
export { default as SectionNarratif } from './SectionNarratif';
export { default as SectionRemisePropriete } from './SectionRemisePropriete';
export { default as SectionFacturation } from './SectionFacturation';
export { default as SectionRCCI } from './SectionRCCI';
export { default as SectionSinistre } from './SectionSinistre';

// Hooks personnalisés
export {
  useInterventions,
  useInterventionDetail,
  useInterventionSettings,
  useDSIReferences
} from './hooks';
