/**
 * Dashboard - Exports centralisés
 */

// Hook de données
export { default as useDashboardData } from './useDashboardData';

// Cartes de statistiques
export {
  StatCard,
  AdminStatsGrid,
  HeuresTravailleesCard,
  ProchaineGardeCard,
  TauxPresenceCard,
  EPIAlertesCard
} from './StatCards';

// Cartes d'alertes (anciens composants)
export {
  AlertesEquipementsCard,
  AlertesVehiculesCard,
  AdminAlertesGrid
} from './AlertCards';

// Activités récentes
export {
  default as ActivitesRecentesCard,
  ActivitesCompactes
} from './ActivitesRecentes';

// Sections extraites du Dashboard
export { EquipementAlertesSection } from './EquipementAlertesSection';
export { VehiculeAlertesSection } from './VehiculeAlertesSection';
export { AdminSection, AdminKPIGrid, PersonnesAbsentesCard } from './AdminSection';
export { FormationsAVenirCard } from './FormationsCard';
export { EPIAlertesInline } from './EPIAlertesInline';
