/**
 * Composants d'alertes pour le Dashboard Admin
 */
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { 
  AlertTriangle, 
  Wrench, 
  Truck,
  Calendar,
  Shield,
  Package,
  Clock
} from 'lucide-react';

// Section d'alerte générique
const AlertSection = ({ title, items, icon: Icon, color, emptyText }) => {
  if (!items || items.length === 0) return null;
  
  return (
    <div className="mb-3">
      <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
        <Icon className="h-3 w-3" style={{ color }} />
        {title} ({items.length})
      </h4>
      <ul className="space-y-1">
        {items.slice(0, 5).map((item, i) => (
          <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
            <span className="text-gray-400">•</span>
            <span>{item.nom || item.numero || item.label || 'Élément'}</span>
            {item.date && (
              <span className="text-xs text-gray-400 ml-auto">
                {new Date(item.date).toLocaleDateString('fr-CA')}
              </span>
            )}
          </li>
        ))}
        {items.length > 5 && (
          <li className="text-xs text-gray-500 pl-4">
            +{items.length - 5} autres...
          </li>
        )}
      </ul>
    </div>
  );
};

// Carte d'alertes équipements
export const AlertesEquipementsCard = ({ alertes }) => {
  const hasAlertes = alertes && (
    alertes.stockBas?.length > 0 ||
    alertes.maintenanceProche?.length > 0 ||
    alertes.finVieProche?.length > 0 ||
    alertes.aReparer?.length > 0
  );

  if (!hasAlertes) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Wrench className="h-4 w-4 text-green-500" />
            Équipements
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-green-600">✓ Tous les équipements sont en ordre</p>
        </CardContent>
      </Card>
    );
  }

  const totalAlertes = (alertes.stockBas?.length || 0) +
                       (alertes.maintenanceProche?.length || 0) +
                       (alertes.finVieProche?.length || 0) +
                       (alertes.aReparer?.length || 0);

  return (
    <Card className="border-orange-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2 text-orange-700">
          <AlertTriangle className="h-4 w-4" />
          Alertes équipements ({totalAlertes})
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <AlertSection 
          title="Stock bas" 
          items={alertes.stockBas} 
          icon={Package} 
          color="#ef4444"
        />
        <AlertSection 
          title="Maintenance proche" 
          items={alertes.maintenanceProche} 
          icon={Wrench} 
          color="#f59e0b"
        />
        <AlertSection 
          title="Fin de vie proche" 
          items={alertes.finVieProche} 
          icon={Clock} 
          color="#8b5cf6"
        />
        <AlertSection 
          title="À réparer" 
          items={alertes.aReparer} 
          icon={AlertTriangle} 
          color="#dc2626"
        />
      </CardContent>
    </Card>
  );
};

// Carte d'alertes véhicules
export const AlertesVehiculesCard = ({ alertes }) => {
  const hasAlertes = alertes && (
    alertes.inspectionProche?.length > 0 ||
    alertes.assuranceProche?.length > 0 ||
    alertes.immatriculationProche?.length > 0 ||
    alertes.entretienProche?.length > 0
  );

  if (!hasAlertes) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Truck className="h-4 w-4 text-green-500" />
            Véhicules
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-green-600">✓ Tous les véhicules sont en ordre</p>
        </CardContent>
      </Card>
    );
  }

  const totalAlertes = (alertes.inspectionProche?.length || 0) +
                       (alertes.assuranceProche?.length || 0) +
                       (alertes.immatriculationProche?.length || 0) +
                       (alertes.entretienProche?.length || 0);

  return (
    <Card className="border-orange-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2 text-orange-700">
          <AlertTriangle className="h-4 w-4" />
          Alertes véhicules ({totalAlertes})
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <AlertSection 
          title="Inspection proche" 
          items={alertes.inspectionProche} 
          icon={Shield} 
          color="#ef4444"
        />
        <AlertSection 
          title="Assurance à renouveler" 
          items={alertes.assuranceProche} 
          icon={Calendar} 
          color="#f59e0b"
        />
        <AlertSection 
          title="Immatriculation proche" 
          items={alertes.immatriculationProche} 
          icon={Calendar} 
          color="#8b5cf6"
        />
        <AlertSection 
          title="Entretien prévu" 
          items={alertes.entretienProche} 
          icon={Wrench} 
          color="#3b82f6"
        />
      </CardContent>
    </Card>
  );
};

// Grille complète des alertes admin
export const AdminAlertesGrid = ({ alertesEquipements, alertesVehicules }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    <AlertesEquipementsCard alertes={alertesEquipements} />
    <AlertesVehiculesCard alertes={alertesVehicules} />
  </div>
);

export default {
  AlertesEquipementsCard,
  AlertesVehiculesCard,
  AdminAlertesGrid
};
