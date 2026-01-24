import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

/**
 * Widget de conformité DSI pour le dashboard principal
 * Affiche un résumé du taux de conformité et des alertes
 */
const DSIComplianceWidget = ({ tenantSlug, onClick }) => {
  const [stats, setStats] = useState(null);
  const [retards, setRetards] = useState([]);
  const [loading, setLoading] = useState(true);

  const getTenantId = () => {
    const token = localStorage.getItem(`${tenantSlug}_token`) || localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.tenant_id;
      } catch (e) {
        return null;
      }
    }
    return null;
  };

  useEffect(() => {
    const tenantId = getTenantId();
    if (!tenantId) return;

    const fetchData = async () => {
      try {
        const [statsRes, retardsRes] = await Promise.all([
          fetch(`${BACKEND_URL}/api/dsi/transmissions/stats/${tenantId}`),
          fetch(`${BACKEND_URL}/api/dsi/transmissions/retards/${tenantId}`)
        ]);

        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData);
        }
        if (retardsRes.ok) {
          const retardsData = await retardsRes.json();
          setRetards(retardsData);
        }
      } catch (error) {
        console.error('Erreur chargement widget DSI:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [tenantSlug]);

  if (loading) {
    return (
      <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={onClick}>
        <CardContent className="pt-6 flex items-center justify-center h-32">
          <div className="animate-pulse bg-gray-200 rounded h-8 w-24"></div>
        </CardContent>
      </Card>
    );
  }

  const tauxConformite = stats?.taux_conformite || 100;
  const tauxColor = tauxConformite >= 90 ? 'text-green-600' : tauxConformite >= 70 ? 'text-yellow-600' : 'text-red-600';
  const hasRetards = retards.length > 0;
  const hasErreurs = (stats?.erreur || 0) > 0;

  return (
    <Card 
      className={`cursor-pointer hover:shadow-lg transition-shadow ${hasRetards || hasErreurs ? 'border-red-300 bg-red-50' : ''}`}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-gray-500 flex items-center justify-between">
          <span>📊 Conformité DSI</span>
          {(hasRetards || hasErreurs) && <span className="text-red-500">⚠️</span>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div>
            <p className={`text-3xl font-bold ${tauxColor}`}>{tauxConformite}%</p>
            <p className="text-xs text-gray-500">Taux de conformité</p>
          </div>
          <div className="text-right space-y-1">
            <div className="flex items-center gap-1 text-xs">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              <span>{stats?.accepte || 0} acceptés</span>
            </div>
            <div className="flex items-center gap-1 text-xs">
              <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
              <span>{stats?.pret_envoi || 0} en attente</span>
            </div>
            {hasErreurs && (
              <div className="flex items-center gap-1 text-xs text-red-600 font-medium">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                <span>{stats?.erreur} erreur(s)</span>
              </div>
            )}
          </div>
        </div>

        {hasRetards && (
          <div className="mt-3 pt-3 border-t border-red-200">
            <p className="text-xs text-red-600 font-medium">
              🚨 {retards.length} rapport(s) en retard (&gt;48h)
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DSIComplianceWidget;
