import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Couleurs ProFireManager
const COLORS = {
  primary: '#D9072B',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
  gray: '#6b7280'
};

// Composants de statut
const StatusBadge = ({ statut }) => {
  const config = {
    brouillon: { icon: '🔵', label: 'En brouillon', bg: 'bg-blue-100', text: 'text-blue-800' },
    pret_envoi: { icon: '🟡', label: 'Prêt pour envoi', bg: 'bg-yellow-100', text: 'text-yellow-800' },
    envoye: { icon: '🟡', label: 'En attente', bg: 'bg-yellow-100', text: 'text-yellow-800' },
    accepte: { icon: '🟢', label: 'Accepté MSP', bg: 'bg-green-100', text: 'text-green-800' },
    erreur: { icon: '🔴', label: 'Erreur', bg: 'bg-red-100', text: 'text-red-800' }
  };
  
  const s = config[statut] || config.brouillon;
  
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      {s.icon} {s.label}
    </span>
  );
};

// Widget de taux de conformité (graphique circulaire)
const ConformityGauge = ({ taux }) => {
  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (taux / 100) * circumference;
  const color = taux >= 90 ? COLORS.success : taux >= 70 ? COLORS.warning : COLORS.error;
  
  return (
    <div className="relative w-32 h-32">
      <svg className="w-full h-full transform -rotate-90">
        <circle
          cx="64"
          cy="64"
          r="45"
          stroke="#e5e7eb"
          strokeWidth="10"
          fill="none"
        />
        <circle
          cx="64"
          cy="64"
          r="45"
          stroke={color}
          strokeWidth="10"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-2xl font-bold" style={{ color }}>{taux}%</span>
      </div>
    </div>
  );
};

// Modal d'erreur (Debugger)
const ErrorModal = ({ isOpen, onClose, intervention, erreurs }) => {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-auto">
        <div className="p-4 border-b bg-red-50">
          <h3 className="text-lg font-bold text-red-800 flex items-center gap-2">
            ⚠️ Erreur de transmission MSP
          </h3>
          <p className="text-sm text-red-600 mt-1">
            Rapport #{intervention?.numero_rapport}
          </p>
        </div>
        
        <div className="p-4 space-y-4">
          {erreurs && erreurs.length > 0 ? (
            erreurs.map((err, idx) => (
              <div key={idx} className="bg-red-50 p-4 rounded-lg border border-red-200">
                <div className="flex items-start gap-2">
                  <span className="text-red-500 text-xl">❌</span>
                  <div>
                    <p className="font-medium text-red-800">{err.message_utilisateur}</p>
                    <p className="text-sm text-red-600 mt-1">Code: {err.code}</p>
                    <div className="mt-3 bg-white p-3 rounded border">
                      <p className="text-sm font-medium text-gray-700">💡 Suggestion:</p>
                      <p className="text-sm text-gray-600">{err.suggestion}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-gray-500">Aucune erreur détaillée disponible.</p>
          )}
        </div>
        
        <div className="p-4 border-t flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose}>Fermer</Button>
          <Button 
            className="bg-red-600 hover:bg-red-700 text-white"
            onClick={() => {
              // Rediriger vers l'intervention pour correction
              window.location.href = `/${intervention?.tenant_slug}/interventions/${intervention?.id}`;
            }}
          >
            🛠️ Corriger le rapport
          </Button>
        </div>
      </div>
    </div>
  );
};

// Composant principal
const DSIComplianceDashboard = ({ tenantSlug }) => {
  const [stats, setStats] = useState(null);
  const [transmissions, setTransmissions] = useState([]);
  const [retards, setRetards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtreStatut, setFiltreStatut] = useState('');
  const [selectedIntervention, setSelectedIntervention] = useState(null);
  const [erreurDetails, setErreurDetails] = useState(null);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [sending, setSending] = useState({});
  
  const getToken = () => {
    return localStorage.getItem(`${tenantSlug}_token`) || localStorage.getItem('token');
  };
  
  // Charger le tenant_id depuis le token ou le localStorage
  const getTenantId = () => {
    const token = getToken();
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
  
  const tenantId = getTenantId();

  // Charger les données
  useEffect(() => {
    if (!tenantId) return;
    
    const fetchData = async () => {
      setLoading(true);
      try {
        // Charger les stats
        const statsRes = await fetch(`${BACKEND_URL}/api/dsi/transmissions/stats/${tenantId}`);
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData);
        }
        
        // Charger la liste des transmissions
        let url = `${BACKEND_URL}/api/dsi/transmissions/list/${tenantId}?limit=50`;
        if (filtreStatut) url += `&statut=${filtreStatut}`;
        
        const listRes = await fetch(url);
        if (listRes.ok) {
          const listData = await listRes.json();
          setTransmissions(listData);
        }
        
        // Charger les retards
        const retardsRes = await fetch(`${BACKEND_URL}/api/dsi/transmissions/retards/${tenantId}`);
        if (retardsRes.ok) {
          const retardsData = await retardsRes.json();
          setRetards(retardsData);
        }
      } catch (error) {
        console.error('Erreur chargement données DSI:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [tenantId, filtreStatut]);

  // Voir les erreurs d'une transmission
  const voirErreurs = async (intervention) => {
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/dsi/transmissions/erreurs/${intervention.id}?tenant_id=${tenantId}`
      );
      if (res.ok) {
        const data = await res.json();
        setSelectedIntervention({ ...intervention, tenant_slug: tenantSlug });
        setErreurDetails(data.erreurs);
        setShowErrorModal(true);
      }
    } catch (error) {
      console.error('Erreur chargement erreurs:', error);
    }
  };

  // Envoyer un rapport au MSP
  const envoyerRapport = async (interventionId) => {
    setSending(prev => ({ ...prev, [interventionId]: true }));
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/dsi/transmissions/envoyer/${interventionId}?tenant_id=${tenantId}`,
        { method: 'POST' }
      );
      const data = await res.json();
      
      if (data.success) {
        alert(`✅ Rapport accepté par le MSP!\nNuméro de confirmation: ${data.numero_confirmation}`);
      } else {
        alert(`❌ Rapport rejeté par le MSP.\nVeuillez corriger les erreurs.`);
      }
      
      // Recharger les données
      window.location.reload();
    } catch (error) {
      console.error('Erreur envoi:', error);
      alert('Erreur lors de l\'envoi au MSP');
    } finally {
      setSending(prev => ({ ...prev, [interventionId]: false }));
    }
  };

  // Formater la date
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('fr-CA');
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tableau de Bord Conformité DSI</h1>
          <p className="text-gray-500">Suivi des transmissions au Ministère de la Sécurité publique</p>
        </div>
        <Button 
          onClick={() => window.location.reload()}
          variant="outline"
        >
          🔄 Actualiser
        </Button>
      </div>

      {/* Alerte retards */}
      {retards.length > 0 && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
          <div className="flex items-center">
            <span className="text-2xl mr-3">⚠️</span>
            <div>
              <p className="font-bold text-red-800">
                Attention : {retards.length} rapport(s) de plus de 48h non transmis au MSP
              </p>
              <p className="text-sm text-red-600">
                {retards.map(r => r.numero_rapport).join(', ')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Widgets statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Taux de conformité */}
        <Card className="bg-gradient-to-br from-gray-50 to-gray-100">
          <CardContent className="pt-6 flex flex-col items-center">
            <ConformityGauge taux={stats?.taux_conformite || 100} />
            <p className="text-sm font-medium text-gray-600 mt-2">Taux de conformité</p>
          </CardContent>
        </Card>

        {/* En brouillon */}
        <Card className="border-l-4 border-blue-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold text-blue-600">{stats?.brouillon || 0}</p>
                <p className="text-sm text-gray-500">En brouillon</p>
              </div>
              <span className="text-4xl">🔵</span>
            </div>
          </CardContent>
        </Card>

        {/* Prêts pour envoi */}
        <Card className="border-l-4 border-yellow-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold text-yellow-600">{stats?.pret_envoi || 0}</p>
                <p className="text-sm text-gray-500">Prêts pour envoi</p>
              </div>
              <span className="text-4xl">🟡</span>
            </div>
          </CardContent>
        </Card>

        {/* Acceptés */}
        <Card className="border-l-4 border-green-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold text-green-600">{stats?.accepte || 0}</p>
                <p className="text-sm text-gray-500">Acceptés MSP</p>
              </div>
              <span className="text-4xl">🟢</span>
            </div>
          </CardContent>
        </Card>

        {/* Erreurs */}
        <Card className="border-l-4 border-red-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold text-red-600">{stats?.erreur || 0}</p>
                <p className="text-sm text-gray-500">Erreurs</p>
              </div>
              <span className="text-4xl">🔴</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tableau des transmissions */}
      <Card>
        <CardHeader className="bg-gray-50">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <CardTitle className="text-lg">📋 Suivi des Transmissions DSI</CardTitle>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Filtrer par statut:</label>
              <select
                value={filtreStatut}
                onChange={(e) => setFiltreStatut(e.target.value)}
                className="border rounded px-3 py-1 text-sm"
              >
                <option value="">Tous</option>
                <option value="brouillon">🔵 En brouillon</option>
                <option value="pret_envoi">🟡 Prêt pour envoi</option>
                <option value="accepte">🟢 Accepté</option>
                <option value="erreur">🔴 Erreur</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 text-left">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3">No. Rapport</th>
                  <th className="p-3">Adresse</th>
                  <th className="p-3">Statut</th>
                  <th className="p-3">No. Confirmation MSP</th>
                  <th className="p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {transmissions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500">
                      Aucune intervention trouvée
                    </td>
                  </tr>
                ) : (
                  transmissions.map((trans) => (
                    <tr key={trans.id} className="border-b hover:bg-gray-50">
                      <td className="p-3">{formatDate(trans.date)}</td>
                      <td className="p-3 font-medium">{trans.numero_rapport}</td>
                      <td className="p-3 max-w-xs truncate" title={trans.adresse}>
                        {trans.adresse || '-'}
                      </td>
                      <td className="p-3">
                        <StatusBadge statut={trans.statut} />
                      </td>
                      <td className="p-3 font-mono text-sm">
                        {trans.numero_confirmation_msp || '--'}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {trans.statut === 'accepte' && (
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => window.location.href = `/${tenantSlug}/interventions/${trans.id}`}
                            >
                              👁️ Voir
                            </Button>
                          )}
                          {trans.statut === 'erreur' && (
                            <Button 
                              size="sm" 
                              variant="ghost"
                              className="text-red-600 hover:text-red-800"
                              onClick={() => voirErreurs(trans)}
                            >
                              🛠️ Réparer
                            </Button>
                          )}
                          {(trans.statut === 'pret_envoi' || trans.statut === 'envoye') && (
                            <Button 
                              size="sm" 
                              variant="ghost"
                              className="text-blue-600 hover:text-blue-800"
                              onClick={() => envoyerRapport(trans.id)}
                              disabled={sending[trans.id]}
                            >
                              {sending[trans.id] ? '⏳' : '🚀'} Envoyer
                            </Button>
                          )}
                          {trans.statut === 'brouillon' && trans.requiert_dsi && (
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => window.location.href = `/${tenantSlug}/interventions/${trans.id}`}
                            >
                              ✏️ Compléter
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modal d'erreur */}
      <ErrorModal 
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        intervention={selectedIntervention}
        erreurs={erreurDetails}
      />
    </div>
  );
};

export default DSIComplianceDashboard;
