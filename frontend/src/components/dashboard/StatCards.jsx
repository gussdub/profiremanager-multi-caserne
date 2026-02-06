/**
 * Composants de cartes statistiques pour le Dashboard
 */
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { 
  Users, 
  Flame, 
  GraduationCap, 
  Clock, 
  Truck, 
  Wrench,
  AlertTriangle,
  Calendar,
  Shield
} from 'lucide-react';

// Carte de statistique générique
export const StatCard = ({ title, value, subtitle, icon: Icon, color = '#3b82f6', trend }) => (
  <Card className="hover:shadow-md transition-shadow">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium text-gray-600">{title}</CardTitle>
      {Icon && (
        <div 
          className="p-2 rounded-lg" 
          style={{ backgroundColor: `${color}15` }}
        >
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
      )}
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
      {trend && (
        <p className={`text-xs mt-1 ${trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
          {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}% vs mois dernier
        </p>
      )}
    </CardContent>
  </Card>
);

// Grille de statistiques pour admin
export const AdminStatsGrid = ({ stats }) => (
  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
    <StatCard 
      title="Personnel actif" 
      value={stats.totalPersonnel || 0}
      icon={Users}
      color="#3b82f6"
    />
    <StatCard 
      title="Interventions (mois)" 
      value={stats.interventionsMois || 0}
      icon={Flame}
      color="#ef4444"
    />
    <StatCard 
      title="Formations (mois)" 
      value={stats.formationsMois || 0}
      icon={GraduationCap}
      color="#8b5cf6"
    />
    <StatCard 
      title="Heures de garde" 
      value={`${stats.heuresGardeMois || 0}h`}
      icon={Clock}
      color="#f59e0b"
    />
    <StatCard 
      title="Véhicules actifs" 
      value={stats.vehiculesActifs || 0}
      icon={Truck}
      color="#10b981"
    />
    <StatCard 
      title="Équipements" 
      value={stats.equipementsActifs || 0}
      icon={Wrench}
      color="#6366f1"
    />
  </div>
);

// Carte d'heures travaillées pour employé
export const HeuresTravailleesCard = ({ heures }) => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-sm font-medium flex items-center gap-2">
        <Clock className="h-4 w-4 text-blue-500" />
        Mes heures (ce mois)
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Internes</span>
          <span className="font-semibold">{heures.internes?.toFixed(1) || 0}h</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Externes</span>
          <span className="font-semibold">{heures.externes?.toFixed(1) || 0}h</span>
        </div>
        <div className="border-t pt-2 flex justify-between items-center">
          <span className="text-sm font-medium">Total</span>
          <span className="font-bold text-blue-600">{heures.total?.toFixed(1) || 0}h</span>
        </div>
      </div>
    </CardContent>
  </Card>
);

// Carte de prochaine garde
export const ProchaineGardeCard = ({ garde }) => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-sm font-medium flex items-center gap-2">
        <Calendar className="h-4 w-4 text-green-500" />
        Prochaine garde
      </CardTitle>
    </CardHeader>
    <CardContent>
      {garde ? (
        <div>
          <div className="text-lg font-bold text-green-600">
            {new Date(garde.date_debut).toLocaleDateString('fr-CA', {
              weekday: 'long',
              day: 'numeric',
              month: 'long'
            })}
          </div>
          <div className="text-sm text-gray-600 mt-1">
            {garde.heure_debut} - {garde.heure_fin}
          </div>
          {garde.caserne && (
            <div className="text-xs text-gray-500 mt-1">{garde.caserne}</div>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-500">Aucune garde planifiée</p>
      )}
    </CardContent>
  </Card>
);

// Carte de taux de présence
export const TauxPresenceCard = ({ taux, absents = [] }) => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-sm font-medium flex items-center gap-2">
        <Users className="h-4 w-4 text-purple-500" />
        Présence aujourd'hui
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div className="text-3xl font-bold text-purple-600">{taux}%</div>
      {absents.length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-gray-500 mb-1">{absents.length} absent(s)</p>
          <div className="flex flex-wrap gap-1">
            {absents.slice(0, 3).map((p, i) => (
              <span key={i} className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                {p.prenom} {p.nom?.charAt(0)}.
              </span>
            ))}
            {absents.length > 3 && (
              <span className="text-xs text-gray-500">+{absents.length - 3}</span>
            )}
          </div>
        </div>
      )}
    </CardContent>
  </Card>
);

// Carte d'alertes EPI
export const EPIAlertesCard = ({ alertes }) => {
  if (!alertes || alertes.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Shield className="h-4 w-4 text-green-500" />
            Mes EPI
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-green-600">✓ Tous vos EPI sont à jour</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-orange-200 bg-orange-50/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2 text-orange-700">
          <AlertTriangle className="h-4 w-4" />
          Alertes EPI ({alertes.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1">
          {alertes.slice(0, 3).map((alerte, i) => (
            <li key={i} className="text-sm text-orange-800">
              • {alerte.type_epi}: {alerte.message || 'Action requise'}
            </li>
          ))}
          {alertes.length > 3 && (
            <li className="text-xs text-orange-600">+{alertes.length - 3} autres alertes</li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
};

export default { 
  StatCard, 
  AdminStatsGrid, 
  HeuresTravailleesCard, 
  ProchaineGardeCard,
  TauxPresenceCard,
  EPIAlertesCard
};
