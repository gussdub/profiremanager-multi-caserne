/**
 * Composant de liste des activités récentes pour le Dashboard
 * Affiche le flux d'audit système (TOUT ce qui se passe dans l'application)
 */
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { 
  Activity, 
  Flame, 
  GraduationCap, 
  UserPlus, 
  Wrench,
  Calendar,
  FileText,
  Bell,
  Trash2,
  Edit,
  Plus,
  X,
  ChevronDown
} from 'lucide-react';

// Icône selon le type d'activité
const getActivityIcon = (type) => {
  const icons = {
    'intervention': { icon: Flame, color: '#ef4444' },
    'formation': { icon: GraduationCap, color: '#8b5cf6' },
    'formation_creation': { icon: GraduationCap, color: '#8b5cf6' },
    'personnel': { icon: UserPlus, color: '#3b82f6' },
    'equipement': { icon: Wrench, color: '#10b981' },
    'planning': { icon: Calendar, color: '#f59e0b' },
    'planning_assignation': { icon: Plus, color: '#10b981' },
    'planning_suppression': { icon: Trash2, color: '#ef4444' },
    'disponibilite': { icon: Calendar, color: '#3b82f6' },
    'disponibilite_creation': { icon: Plus, color: '#10b981' },
    'disponibilite_suppression': { icon: Trash2, color: '#ef4444' },
    'conge': { icon: Calendar, color: '#f59e0b' },
    'rapport': { icon: FileText, color: '#6366f1' },
    'notification': { icon: Bell, color: '#ec4899' },
    'prevention': { icon: FileText, color: '#f97316' },
    'validation_competence': { icon: GraduationCap, color: '#10b981' },
    'default': { icon: Activity, color: '#6b7280' }
  };
  return icons[type] || icons['default'];
};

// Formater la date relative
const formatRelativeTime = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'À l\'instant';
  if (diffMins < 60) return `Il y a ${diffMins} min`;
  if (diffHours < 24) return `Il y a ${diffHours}h`;
  if (diffDays < 7) return `Il y a ${diffDays}j`;
  return date.toLocaleDateString('fr-CA');
};

// Item d'activité individuel
const ActivityItem = ({ activite }) => {
  const { icon: Icon, color } = getActivityIcon(activite.type);

  return (
    <div className="flex items-start gap-3 py-3 border-b last:border-b-0">
      <div 
        className="p-2 rounded-lg shrink-0" 
        style={{ backgroundColor: `${color}15` }}
      >
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {activite.titre || activite.message}
        </p>
        {activite.description && (
          <p className="text-xs text-gray-500 truncate mt-0.5">
            {activite.description}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-gray-400">
            {formatRelativeTime(activite.date || activite.created_at)}
          </span>
          {activite.user && (
            <span className="text-xs text-gray-400">
              • {activite.user}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// Carte des activités récentes avec bouton "Voir plus"
export const ActivitesRecentesCard = ({ activites = [], maxItems = 5 }) => {
  const [showAll, setShowAll] = useState(false);
  const displayActivites = showAll ? activites : activites.slice(0, maxItems);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-500" />
            Flux d'activité système
          </span>
          {activites.length > 0 && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
              {activites.length}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {displayActivites.length > 0 ? (
          <>
            <div className="divide-y max-h-[400px] overflow-y-auto">
              {displayActivites.map((activite, index) => (
                <ActivityItem key={activite.id || index} activite={activite} />
              ))}
            </div>
            {activites.length > maxItems && (
              <div className="pt-3 text-center border-t mt-2">
                <button
                  onClick={() => setShowAll(!showAll)}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 mx-auto"
                >
                  {showAll ? (
                    <>
                      <X className="h-4 w-4" />
                      Afficher moins
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      Voir tout ({activites.length - maxItems} de plus)
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-500 py-4 text-center">
            Aucune activité récente
          </p>
        )}
      </CardContent>
    </Card>
  );
};

// Version compacte pour sidebar ou widget
export const ActivitesCompactes = ({ activites = [], maxItems = 3 }) => {
  const displayActivites = activites.slice(0, maxItems);

  return (
    <div className="space-y-2">
      {displayActivites.map((activite, index) => {
        const { icon: Icon, color } = getActivityIcon(activite.type);
        return (
          <div key={activite.id || index} className="flex items-center gap-2 text-sm">
            <Icon className="h-3 w-3 shrink-0" style={{ color }} />
            <span className="truncate flex-1">{activite.titre || activite.message}</span>
            <span className="text-xs text-gray-400 shrink-0">
              {formatRelativeTime(activite.date || activite.created_at)}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default ActivitesRecentesCard;
