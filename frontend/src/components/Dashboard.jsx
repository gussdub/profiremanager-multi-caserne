import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { useToast } from "../hooks/use-toast";
import { useTenant } from "../contexts/TenantContext";
import { useAuth } from "../contexts/AuthContext";

const Dashboard = () => {
  const { user, tenant } = useAuth();
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  
  // États pour les données personnelles
  const [heuresTravaillees, setHeuresTravaillees] = useState({ internes: 0, externes: 0, total: 0 });
  const [formationsInscrites, setFormationsInscrites] = useState([]);
  const [tauxPresence, setTauxPresence] = useState(0);
  const [prochainGarde, setProchainGarde] = useState(null);
  const [mesEPIAlerts, setMesEPIAlerts] = useState([]);
  
  // États pour les données admin
  const [tauxCouverture, setTauxCouverture] = useState(0);
  const [personnesAbsentes, setPersonnesAbsentes] = useState([]);
  const [activitesRecentes, setActivitesRecentes] = useState([]);
  const [statsGenerales, setStatsGenerales] = useState({
    personnel: 0,
    vehicules: 0,
    epiActifs: 0,
    formationsAVenir: 0
  });
  
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  const API = process.env.REACT_APP_BACKEND_URL 
    ? `${process.env.REACT_APP_BACKEND_URL}/api` 
    : '/api';

  const isAdmin = user?.role === 'admin' || user?.role === 'production';

  // Fonction de chargement des données (mémorisée pour réutilisation)
  const fetchDashboardData = useCallback(async () => {
    if (!tenantSlug || !user) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    
    try {
      const token = localStorage.getItem(`${tenantSlug}_token`);
      const headers = { Authorization: `Bearer ${token}` };
      const now = new Date();
      const debutMois = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const finMois = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
      const lundi = new Date(now);
      lundi.setDate(now.getDate() - now.getDay() + 1);
      const semaineDebut = lundi.toISOString().split('T')[0];

      // ===== APPELS EN PARALLÈLE =====
      // Pour trouver la prochaine garde/formation, on cherche sur une période étendue
      const premierJourMoisCourant = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const premierJourMoisSuivant = now.getMonth() === 11 
        ? `${now.getFullYear() + 1}-01-01`
        : `${now.getFullYear()}-${String(now.getMonth() + 2).padStart(2, '0')}-01`;
      
      const promises = [
        // 1. Formations (année courante + suivante pour couvrir les formations futures)
        axios.get(`${API}/${tenantSlug}/formations?annee=${now.getFullYear()}`, { headers, timeout: 10000 }).catch(() => null),
        // 2. Assignations mois courant (pour trouver la prochaine garde)
        axios.get(`${API}/${tenantSlug}/planning/assignations/${premierJourMoisCourant}`, { headers, timeout: 10000 }).catch(() => null),
        // 3. Mes EPI
        axios.get(`${API}/${tenantSlug}/mes-epi`, { headers, timeout: 10000 }).catch(() => null),
        // 4. Mes heures (nouvel endpoint accessible à tous les utilisateurs)
        axios.get(`${API}/${tenantSlug}/planning/mes-heures?date_debut=${debutMois}&date_fin=${finMois}`, { headers, timeout: 10000 }).catch(() => null),
        // 5. Mon taux de présence formations (endpoint existant)
        axios.get(`${API}/${tenantSlug}/formations/mon-taux-presence?annee=${now.getFullYear()}`, { headers, timeout: 10000 }).catch(() => null),
        // 6. Assignations mois suivant (backup si pas de garde ce mois-ci)
        axios.get(`${API}/${tenantSlug}/planning/assignations/${premierJourMoisSuivant}`, { headers, timeout: 10000 }).catch(() => null),
        // 7. Formations année suivante (backup)
        axios.get(`${API}/${tenantSlug}/formations?annee=${now.getFullYear() + 1}`, { headers, timeout: 10000 }).catch(() => null),
      ];
      
      // Ajouter les appels admin uniquement
      if (isAdmin) {
        const todayStr = now.toISOString().split('T')[0];
        
        promises.push(
          // Index 7: Users
          axios.get(`${API}/${tenantSlug}/users`, { headers, timeout: 10000 }).catch(() => null),
          // Index 8: Véhicules
          axios.get(`${API}/${tenantSlug}/actifs/vehicules`, { headers, timeout: 10000 }).catch(() => null),
          // Index 9: Congés en cours
          axios.get(`${API}/${tenantSlug}/demandes-conge?statut=approuve&date_actuelle=${todayStr}`, { headers, timeout: 10000 }).catch(() => null),
          // Index 10: Assignations mois courant (pour couverture planning admin)
          axios.get(`${API}/${tenantSlug}/planning/assignations/${premierJourMoisCourant}`, { headers, timeout: 10000 }).catch(() => null),
          // Index 11: Notifications
          axios.get(`${API}/${tenantSlug}/notifications?limit=10`, { headers, timeout: 10000 }).catch(() => null),
        );
      }

      const results = await Promise.all(promises);
      
      // ===== TRAITEMENT DES RÉSULTATS =====
      // Les 5 premiers résultats sont toujours: Formations, Assignations, Mes EPI, Mes Heures, Mon Taux Présence
      
      // 1. Formations inscrites (index 0)
      if (results[0]?.data) {
        const formationsAVenir = (results[0].data || [])
          .filter(f => new Date(f.date_debut || f.date) >= now)
          .filter(f => f.inscrits?.includes(user.id) || f.participants?.some(p => p.user_id === user.id))
          .slice(0, 3);
        setFormationsInscrites(formationsAVenir);
      }
      
      // 2. Prochain garde (index 1)
      if (results[1]?.data) {
        const mesAssignations = (results[1].data || [])
          .filter(a => a.user_id === user.id && new Date(a.date) >= now)
          .sort((a, b) => new Date(a.date) - new Date(b.date));
        if (mesAssignations.length > 0) {
          setProchainGarde(mesAssignations[0]);
        }
      }
      
      // 3. Alertes EPI (index 2)
      if (results[2]?.data) {
        const dans30Jours = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const alertes = (results[2].data || [])
          .filter(epi => {
            const dateExpiration = epi.date_expiration ? new Date(epi.date_expiration) : null;
            return dateExpiration && dateExpiration <= dans30Jours;
          })
          .slice(0, 5);
        setMesEPIAlerts(alertes);
      }
      
      // 4. Mes heures travaillées (index 3) - accessible à tous
      if (results[3]?.data) {
        setHeuresTravaillees({
          internes: results[3].data.heures_internes || 0,
          externes: results[3].data.heures_externes || 0,
          total: results[3].data.total_heures || 0
        });
      }
      
      // 5. Mon taux de présence formations (index 4)
      if (results[4]?.data) {
        setTauxPresence(results[4].data.taux_presence || 0);
      }

      // ===== DONNÉES ADMIN UNIQUEMENT =====
      if (isAdmin && results.length > 5) {
        // Index fixes pour éviter les problèmes de closure
        const usersData = results[5]?.data;
        const vehiculesData = results[6]?.data;
        const congesData = results[7]?.data;
        const planningData = results[8]?.data;
        const notificationsData = results[9]?.data;
        
        // Calculer toutes les valeurs avant de mettre à jour le state
        const personnelCount = Array.isArray(usersData) ? usersData.length : 0;
        const vehiculesCount = Array.isArray(vehiculesData) ? vehiculesData.length : 0;
        
        // Mise à jour atomique du state
        setStatsGenerales({
          personnel: personnelCount,
          vehicules: vehiculesCount,
          epiActifs: 0,
          formationsAVenir: 0
        });
        
        // Personnes en congé/maladie actuellement (congés approuvés en cours)
        if (Array.isArray(congesData)) {
          const absentsActuellement = congesData
            .filter(d => d.statut === 'approuve' || d.statut === 'approuvé')
            .slice(0, 5);
          setPersonnesAbsentes(absentsActuellement);
        }
        
        // Couverture planning - calculer sur le mois complet
        if (Array.isArray(planningData)) {
          const now = new Date();
          const joursTotal = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
          const joursCouverts = new Set(planningData.map(a => a.date)).size;
          const taux = Math.min(100, Math.round((joursCouverts / joursTotal) * 100));
          setTauxCouverture(taux);
        }
        
        // Activités récentes
        if (Array.isArray(notificationsData)) {
          const activites = notificationsData
            .slice(0, 5)
            .map(n => ({
              id: n.id,
              message: n.message || n.titre,
              date: n.created_at || n.date_creation,
              type: n.type
            }));
          setActivitesRecentes(activites);
        }
      }

    } catch (error) {
      console.error('Erreur chargement dashboard:', error);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, user, API, isAdmin]);

  // Effect principal - chargement initial et rafraîchissement
  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData, lastRefresh]);

  // Rafraîchir quand l'app revient au premier plan (iOS fix)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Rafraîchir les données quand l'utilisateur revient sur la page
        setLastRefresh(Date.now());
      }
    };

    const handleFocus = () => {
      // Rafraîchir aussi quand la fenêtre regagne le focus
      setLastRefresh(Date.now());
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    
    // Pour iOS PWA - écouter les événements de resume
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        setLastRefresh(Date.now());
      }
    });

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-CA', { 
      weekday: 'short', 
      day: 'numeric', 
      month: 'short' 
    });
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-CA', { 
      day: 'numeric', 
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '50vh' 
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔄</div>
          <p>Chargement du tableau de bord...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page" style={{ maxWidth: '1400px', margin: '0 auto' }}>
      {/* En-tête */}
      <div className="dashboard-header" style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: '#1e293b' }}>
          👋 Bienvenue, {user?.prenom || 'Utilisateur'}
        </h1>
        <p style={{ color: '#64748b', marginTop: '0.5rem' }}>
          {tenant?.nom || 'ProFireManager'} - {new Date().toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* ===================== SECTION PERSONNELLE ===================== */}
      <div style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ 
          fontSize: '1.25rem', 
          fontWeight: '600', 
          color: '#374151', 
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          👤 Mon Espace Personnel
        </h2>

        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
          gap: '1rem'
        }}>
          {/* Heures travaillées ce mois */}
          <Card>
            <CardHeader style={{ paddingBottom: '0.5rem' }}>
              <CardTitle style={{ fontSize: '0.9rem', color: '#6b7280' }}>
                ⏱️ Heures ce mois
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1e293b' }}>
                {heuresTravaillees.total}h
              </div>
              {(heuresTravaillees.internes > 0 || heuresTravaillees.externes > 0) && (
                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  {heuresTravaillees.internes > 0 && <span>Internes: {heuresTravaillees.internes}h</span>}
                  {heuresTravaillees.internes > 0 && heuresTravaillees.externes > 0 && ' • '}
                  {heuresTravaillees.externes > 0 && <span>Externes: {heuresTravaillees.externes}h</span>}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Taux de présence formations */}
          <Card>
            <CardHeader style={{ paddingBottom: '0.5rem' }}>
              <CardTitle style={{ fontSize: '0.9rem', color: '#6b7280' }}>
                📊 Taux de présence formations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ 
                fontSize: '2rem', 
                fontWeight: '700', 
                color: tauxPresence >= 80 ? '#10b981' : tauxPresence >= 60 ? '#f59e0b' : '#ef4444'
              }}>
                {tauxPresence}%
              </div>
              <div style={{ 
                fontSize: '0.8rem', 
                color: tauxPresence >= 80 ? '#10b981' : '#6b7280',
                marginTop: '0.25rem'
              }}>
                {tauxPresence >= 80 ? '✅ Conforme' : tauxPresence >= 60 ? '⚠️ À améliorer' : '❌ Non conforme'}
              </div>
            </CardContent>
          </Card>

          {/* Prochain garde */}
          <Card>
            <CardHeader style={{ paddingBottom: '0.5rem' }}>
              <CardTitle style={{ fontSize: '0.9rem', color: '#6b7280' }}>
                📅 Prochaine garde
              </CardTitle>
            </CardHeader>
            <CardContent>
              {prochainGarde ? (
                <>
                  <div style={{ fontSize: '1.25rem', fontWeight: '600', color: '#1e293b' }}>
                    {formatDate(prochainGarde.date)}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    {prochainGarde.type_garde || prochainGarde.poste || 'Garde'}
                  </div>
                </>
              ) : (
                <div style={{ color: '#9ca3af', fontStyle: 'italic' }}>
                  Aucune garde planifiée
                </div>
              )}
            </CardContent>
          </Card>

          {/* Formations à venir */}
          <Card>
            <CardHeader style={{ paddingBottom: '0.5rem' }}>
              <CardTitle style={{ fontSize: '0.9rem', color: '#6b7280' }}>
                📚 Mes formations à venir
              </CardTitle>
            </CardHeader>
            <CardContent>
              {formationsInscrites.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {formationsInscrites.map((f, idx) => (
                    <div key={idx} style={{ 
                      fontSize: '0.85rem', 
                      padding: '0.5rem',
                      background: '#f1f5f9',
                      borderRadius: '6px'
                    }}>
                      <div style={{ fontWeight: '500' }}>{f.titre || f.nom}</div>
                      <div style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                        {formatDate(f.date_debut || f.date)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: '#9ca3af', fontStyle: 'italic' }}>
                  Aucune formation inscrite
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Alertes EPI */}
        {mesEPIAlerts.length > 0 && (
          <Card style={{ marginTop: '1rem', borderLeft: '4px solid #f59e0b' }}>
            <CardContent style={{ padding: '1rem' }}>
              <div style={{ fontWeight: '600', color: '#92400e', marginBottom: '0.5rem' }}>
                ⚠️ EPI nécessitant attention ({mesEPIAlerts.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {mesEPIAlerts.map((epi, idx) => (
                  <span key={idx} style={{
                    background: '#fef3c7',
                    color: '#92400e',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '999px',
                    fontSize: '0.8rem'
                  }}>
                    {epi.type || epi.nom} - Exp. {formatDate(epi.date_expiration || epi.date_fin_vie)}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ===================== SECTION ADMIN ===================== */}
      {isAdmin && (
        <div>
          <h2 style={{ 
            fontSize: '1.25rem', 
            fontWeight: '600', 
            color: '#374151', 
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            🏢 Vue Générale du Service
          </h2>

          {/* KPIs Admin */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
            gap: '1rem',
            marginBottom: '1.5rem'
          }}>
            <Card style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)' }}>
              <CardContent style={{ padding: '1.25rem', color: 'white' }}>
                <div style={{ fontSize: '2rem', fontWeight: '700' }}>{statsGenerales.personnel}</div>
                <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>👥 Personnel actif</div>
              </CardContent>
            </Card>

            <Card style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
              <CardContent style={{ padding: '1.25rem', color: 'white' }}>
                <div style={{ fontSize: '2rem', fontWeight: '700' }}>{tauxCouverture}%</div>
                <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>📅 Couverture planning</div>
              </CardContent>
            </Card>

            <Card style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
              <CardContent style={{ padding: '1.25rem', color: 'white' }}>
                <div style={{ fontSize: '2rem', fontWeight: '700' }}>{personnesAbsentes.length}</div>
                <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>🏥 Absents aujourd'hui</div>
              </CardContent>
            </Card>

            <Card style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }}>
              <CardContent style={{ padding: '1.25rem', color: 'white' }}>
                <div style={{ fontSize: '2rem', fontWeight: '700' }}>{statsGenerales.vehicules}</div>
                <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>🚒 Véhicules</div>
              </CardContent>
            </Card>
          </div>

          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', 
            gap: '1rem'
          }}>
            {/* Personnes en congé/maladie */}
            <Card>
              <CardHeader>
                <CardTitle style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>🏥 Personnes absentes</span>
                  {personnesAbsentes.length > 0 && (
                    <span style={{
                      background: '#fef3c7',
                      color: '#d97706',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '999px',
                      fontSize: '0.75rem',
                      fontWeight: '600'
                    }}>
                      {personnesAbsentes.length}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {personnesAbsentes.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {personnesAbsentes.map((absence, idx) => (
                      <div key={idx} style={{
                        padding: '0.75rem',
                        background: '#fefce8',
                        borderRadius: '8px',
                        borderLeft: `3px solid ${absence.type_conge === 'maladie' ? '#ef4444' : '#f59e0b'}`
                      }}>
                        <div style={{ fontWeight: '500', marginBottom: '0.25rem' }}>
                          {absence.user_nom || absence.nom_employe || 'Employé'}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                          {formatDate(absence.date_debut)} → {formatDate(absence.date_fin)}
                        </div>
                        <div style={{ 
                          fontSize: '0.75rem', 
                          color: absence.type_conge === 'maladie' ? '#dc2626' : '#d97706',
                          marginTop: '0.25rem',
                          fontWeight: '500'
                        }}>
                          {absence.type_conge === 'maladie' ? '🤒 Maladie' : 
                           absence.type_conge === 'vacances' ? '🌴 Vacances' :
                           absence.type_conge || absence.motif || 'Congé'}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '2rem',
                    color: '#9ca3af'
                  }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✅</div>
                    Tout le monde est présent
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Fil d'activité */}
            <Card>
              <CardHeader>
                <CardTitle style={{ fontSize: '1rem' }}>
                  📋 Activité récente
                </CardTitle>
              </CardHeader>
              <CardContent>
                {activitesRecentes.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {activitesRecentes.map((activite, idx) => (
                      <div key={idx} style={{
                        padding: '0.5rem',
                        borderBottom: idx < activitesRecentes.length - 1 ? '1px solid #e5e7eb' : 'none',
                        fontSize: '0.85rem'
                      }}>
                        <div style={{ color: '#374151' }}>
                          {activite.type === 'planning_assigne' && '📅 '}
                          {activite.type === 'conge_demande' && '📝 '}
                          {activite.type === 'formation_inscrit' && '📚 '}
                          {activite.type === 'remplacement_demande' && '🔄 '}
                          {activite.message}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                          {formatDateTime(activite.date)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '2rem',
                    color: '#9ca3af'
                  }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📭</div>
                    Aucune activité récente
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
