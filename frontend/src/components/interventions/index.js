/**
 * Module Interventions - Index des composants
 * 
 * Ce fichier sert de point d'entrée pour tous les composants du module Interventions.
 * La refactorisation est en cours - les composants sont progressivement extraits
 * de GestionInterventions.jsx vers des fichiers séparés.
 * 
 * Composants extraits:
 * ✅ SectionBatiment.jsx (~530 lignes)
 * ✅ SectionIdentification.jsx (~310 lignes)
 * 
 * Composants restants à extraire:
 * - SectionRessources (~780 lignes)
 * - SectionDSI (~130 lignes)
 * - SectionProtection (~140 lignes)
 * - SectionMateriel (~270 lignes)
 * - SectionPertes (~190 lignes)
 * - SectionNarratif (~230 lignes)
 * - SectionRemisePropriete (~360 lignes)
 * - SectionFacturation (~730 lignes)
 * - TabHistorique (~200 lignes)
 * - TabParametres (~350 lignes)
 * - InterventionDetailModal (~700 lignes)
 * - ImportXMLModal (~200 lignes)
 */

// Composants extraits
export { default as SectionBatiment } from './SectionBatiment';
export { default as SectionIdentification } from './SectionIdentification';

// Composant principal (encore contient plusieurs sous-composants)
export { default as GestionInterventions } from '../GestionInterventions';
