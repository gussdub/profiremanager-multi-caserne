import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useToast } from "../hooks/use-toast";
import { useTenant } from "../contexts/TenantContext";
import { useAuth } from "../contexts/AuthContext";
import usePermissions from "../hooks/usePermissions";
import { 
  StatCard,
  HeuresTravailleesCard,
  ProchaineGardeCard
} from './dashboard/StatCards';
import { EquipementAlertesSection } from './dashboard/EquipementAlertesSection';
import { VehiculeAlertesSection } from './dashboard/VehiculeAlertesSection';
import { AdminSection } from './dashboard/AdminSection';
import { FormationsAVenirCard } from './dashboard/FormationsCard';
import { EPIAlertesInline } from './dashboard/EPIAlertesInline';
import { BroadcastBanner, BroadcastModal, BroadcastButton } from './BroadcastMessage';

const Dashboard = ({ setCurrentPage }) => {
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
  const [couvertureMoisSuivant, setCouvertureMoisSuivant] = useState(null);
  const [personnesAbsentes, setPersonnesAbsentes] = useState([]);
  const [activitesRecentes, setActivitesRecentes] = useState([]);
  const [statsGenerales, setStatsGenerales] = useState({
    personnel: 0,
    vehicules: 0,
    epiActifs: 0,
    formationsAVenir: 0
  });
  
  // État pour les alertes équipements (visible selon rôle)
  const [alertesEquipements, setAlertesEquipements] = useState({
    actif: false,
    total: 0,
    compteurs: {},
    en_retard: 0,
    alertes: []
  });
  
  // État pour les alertes maintenance véhicules (visible admins/superviseurs)
  const [alertesVehicules, setAlertesVehicules] = useState({
    alertes: [],
    count: 0,
    critiques: 0,
    urgentes: 0
  });
  
  // État pour les NC en retard (module prévention)
  const [ncEnRetard, setNcEnRetard] = useState({
    count: 0,
    items: [],
    loading: false
  });
  
  // État pour la modale de diffusion de message
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  
  // État pour les délégations reçues
  const [delegationsRecues, setDelegationsRecues] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  const API = process.env.REACT_APP_BACKEND_URL 
    ? `${process.env.REACT_APP_BACKEND_URL}/api` 
    : '/api';

  // Utiliser le hook de permissions RBAC
  const { hasTabAction, hasModuleAction, loading: permissionsLoading } = usePermissions(tenantSlug, user);
  
  // Permissions RBAC pour les sections du dashboard
  const canViewGeneralSection = hasTabAction('dashboard', 'general', 'voir');
  const canViewActivites = hasTabAction('dashboard', 'activites', 'voir');
  const canViewAlertes = hasTabAction('dashboard', 'alertes', 'voir');
  const canBroadcast = hasModuleAction('parametres', 'modifier');

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

      const premierJourMoisCourant = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const premierJourMoisSuivant = now.getMonth() === 11 
        ? `${now.getFullYear() + 1}-01-01`
        : `${now.getFullYear()}-${String(now.getMonth() + 2).padStart(2, '0')}-01`;
      
      const promises = [
        axios.get(`${API}/${tenantSlug}/formations?annee=${now.getFullYear()}`, { headers, timeout: 10000 }).catch(() => null),
        axios.get(`${API}/${tenantSlug}/planning/assignations/${premierJourMoisCourant}?mode=mois`, { headers, timeout: 10000 }).catch(() => null),
        axios.get(`${API}/${tenantSlug}/mes-epi`, { headers, timeout: 10000 }).catch(() => null),
        axios.get(`${API}/${tenantSlug}/planning/mes-heures?date_debut=${debutMois}&date_fin=${finMois}`, { headers, timeout: 10000 }).catch(() => null),
        axios.get(`${API}/${tenantSlug}/formations/mon-taux-presence?annee=${now.getFullYear()}`, { headers, timeout: 10000 }).catch(() => null),
        axios.get(`${API}/${tenantSlug}/planning/assignations/${premierJourMoisSuivant}?mode=mois`, { headers, timeout: 10000 }).catch(() => null),
        axios.get(`${API}/${tenantSlug}/formations?annee=${now.getFullYear() + 1}`, { headers, timeout: 10000 }).catch(() => null),
        axios.get(`${API}/${tenantSlug}/dashboard/alertes-equipements`, { headers, timeout: 10000 }).catch(() => null),
        axios.get(`${API}/${tenantSlug}/actifs/vehicules/alertes-maintenance`, { headers, timeout: 10000 }).catch(() => null),
      ];
      
      if (canViewGeneralSection) {
        const todayStr = now.toISOString().split('T')[0];
        promises.push(
          axios.get(`${API}/${tenantSlug}/users`, { headers, timeout: 10000 }).catch(() => null),
          axios.get(`${API}/${tenantSlug}/actifs/vehicules`, { headers, timeout: 10000 }).catch(() => null),
          axios.get(`${API}/${tenantSlug}/demandes-conge?statut=approuve&date_actuelle=${todayStr}`, { headers, timeout: 10000 }).catch(() => null),
          axios.get(`${API}/${tenantSlug}/planning/assignations/${premierJourMoisCourant}?mode=mois`, { headers, timeout: 10000 }).catch(() => null),
          axios.get(`${API}/${tenantSlug}/dashboard/activites-systeme?limit=20`, { headers, timeout: 10000 }).catch(() => null),
        );
      }

      const results = await Promise.all(promises);
      
      // Alertes équipements (index 7)
      if (results[7]?.data) setAlertesEquipements(results[7].data);
      
      // Alertes maintenance véhicules (index 8)
      if (results[8]?.data) setAlertesVehicules(results[8].data);
      
      // Formations (combiner année courante + suivante)
      const toutesFormations = [...(results[0]?.data || []), ...(results[6]?.data || [])];
      const todayStr = now.toISOString().split('T')[0];
      
      const formationsAVenir = toutesFormations
        .filter(f => (f.date_debut || f.date) >= todayStr)
        .filter(f => f.user_inscrit || f.inscrits?.includes(user.id) || f.participants?.some(p => p.user_id === user.id))
        .sort((a, b) => (a.date_debut || a.date).localeCompare(b.date_debut || b.date))
        .slice(0, 3);
      setFormationsInscrites(formationsAVenir);
      
      // Prochaine garde (combiner mois courant + suivant)
      const toutesAssignations = [...(results[1]?.data || []), ...(results[5]?.data || [])];
      const mesAssignations = toutesAssignations
        .filter(a => a.user_id === user.id && a.date >= todayStr)
        .sort((a, b) => a.date.localeCompare(b.date));
      if (mesAssignations.length > 0) setProchainGarde(mesAssignations[0]);
      
      // Alertes EPI (index 2)
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
      
      // Mes heures travaillées (index 3)
      if (results[3]?.data) {
        setHeuresTravaillees({
          internes: results[3].data.heures_internes || 0,
          externes: results[3].data.heures_externes || 0,
          total: results[3].data.total_heures || 0
        });
      }
      
      // Mon taux de présence formations (index 4)
      if (results[4]?.data) setTauxPresence(results[4].data.taux_presence || 0);

      // Données admin (indices 9-13)
      if (canViewGeneralSection && results.length > 9) {
        const usersData = results[9]?.data;
        const vehiculesData = results[10]?.data;
        const congesData = results[11]?.data;
        const planningDataAdmin = results[12]?.data;
        const activitesData = results[13]?.data;
        
        setStatsGenerales({
          personnel: Array.isArray(usersData) ? usersData.length : 0,
          vehicules: Array.isArray(vehiculesData) ? vehiculesData.length : 0,
          epiActifs: 0,
          formationsAVenir: 0
        });
        
        if (Array.isArray(congesData)) {
          setPersonnesAbsentes(
            congesData.filter(d => d.statut === 'approuve' || d.statut === 'approuvé').slice(0, 5)
          );
        }
        
        // Le taux de couverture est maintenant calculé via un endpoint dédié (voir plus bas)
        
        // Charger le taux de couverture précis (mois courant + mois suivant)
        try {
          const couvertureResponse = await axios.get(
            `${API}/${tenantSlug}/dashboard/couverture-precise`,
            { headers, timeout: 10000 }
          );
          if (couvertureResponse?.data?.taux_couverture !== undefined) {
            setTauxCouverture(couvertureResponse.data.taux_couverture);
          }
          if (couvertureResponse?.data?.mois_suivant) {
            setCouvertureMoisSuivant(couvertureResponse.data.mois_suivant);
          }
        } catch (err) {
          console.log('Couverture précise non disponible:', err.message);
          // Fallback: garder le taux à 0
        }
        
        // Activités système (audit log)
        if (activitesData?.activites && Array.isArray(activitesData.activites)) {
          setActivitesRecentes(
            activitesData.activites.map(a => ({
              id: a.id,
              titre: a.description || a.titre,
              message: a.description,
              description: a.user_nom ? `Par ${a.user_nom}` : '',
              date: a.created_at,
              type: a.type_activite || 'default',
              user: a.user_nom
            }))
          );
        }
      }

      // Charger les NC en retard si module prévention actif (admin/superviseur/préventionniste)
      if (tenant?.parametres?.module_prevention_active && 
          (user?.role === 'admin' || user?.role === 'superviseur' || user?.est_preventionniste)) {
        try {
          const ncResponse = await axios.get(
            `${API}/${tenantSlug}/prevention/non-conformites-en-retard`,
            { headers, timeout: 10000 }
          );
          if (ncResponse?.data) {
            setNcEnRetard({
              count: ncResponse.data.length,
              items: ncResponse.data.slice(0, 5),
              loading: false
            });
          }
        } catch (err) {
          console.log('NC en retard non disponible:', err.message);
        }
      }

      // Charger les délégations reçues (admin/superviseur)
      if (user?.role === 'admin' || user?.role === 'superviseur') {
        try {
          const delegationsResponse = await axios.get(
            `${API}/${tenantSlug}/delegations/recues`,
            { headers, timeout: 10000 }
          );
          if (delegationsResponse?.data?.delegations_recues) {
            setDelegationsRecues(delegationsResponse.data.delegations_recues);
          }
        } catch (err) {
          console.log('Délégations non disponibles:', err.message);
        }
      }

    } catch (error) {
      console.error('Erreur chargement dashboard:', error);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, user, API, canViewGeneralSection]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData, lastRefresh]);

  // Rafraîchir quand l'app revient au premier plan (iOS fix)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') setLastRefresh(Date.now());
    };
    const handleFocus = () => setLastRefresh(Date.now());
    const handlePageShow = (event) => {
      if (event.persisted) setLastRefresh(Date.now());
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []);

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔄</div>
          <p>Chargement du tableau de bord...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page" style={{ maxWidth: '1400px', margin: '0 auto' }}>
      {/* En-tête avec bouton de diffusion */}
      <div className="dashboard-header" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: '#1e293b' }}>
              👋 Bienvenue, {user?.prenom || 'Utilisateur'}
            </h1>
            <p style={{ color: '#64748b', marginTop: '0.5rem' }}>
              {tenant?.nom || 'ProFireManager'} - {new Date().toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          {/* Bouton de diffusion pour admins/superviseurs */}
          {canBroadcast && (
            <BroadcastButton 
              onClick={() => setShowBroadcastModal(true)} 
              currentUser={user} 
            />
          )}
        </div>
      </div>

      {/* Bannière de message broadcast */}
      <BroadcastBanner tenantSlug={tenantSlug} currentUser={user} />

      {/* Bannière des délégations reçues */}
      {delegationsRecues.length > 0 && (
        <div style={{ 
          marginBottom: '1.5rem',
          background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
          borderRadius: '12px',
          padding: '1rem 1.5rem',
          border: '1px solid #3b82f6'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '1.25rem' }}>📋</span>
            <strong style={{ color: '#1e40af' }}>Délégations actives</strong>
            <span style={{ 
              background: '#3b82f6', 
              color: 'white', 
              borderRadius: '9999px', 
              padding: '2px 8px', 
              fontSize: '0.75rem',
              fontWeight: '600'
            }}>
              {delegationsRecues.length}
            </span>
          </div>
          <div style={{ color: '#1e40af', fontSize: '0.875rem' }}>
            {delegationsRecues.map((delegation, idx) => (
              <div key={delegation.user_id || idx} style={{ marginBottom: idx < delegationsRecues.length - 1 ? '0.5rem' : 0 }}>
                <strong>{delegation.user_nom}</strong> est en congé jusqu'au {delegation.date_fin}. 
                <span style={{ color: '#64748b', marginLeft: '0.5rem' }}>
                  Vous recevez ses notifications pour: {delegation.responsibilities?.map(r => {
                    const labels = {
                      'actifs': 'Actifs',
                      'interventions': 'Interventions', 
                      'prevention': 'Prévention'
                    };
                    return labels[r.module] || r.module;
                  }).filter((v, i, a) => a.indexOf(v) === i).join(', ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modale de diffusion */}
      <BroadcastModal 
        isOpen={showBroadcastModal}
        onClose={() => setShowBroadcastModal(false)}
        tenantSlug={tenantSlug}
        currentUser={user}
      />

      {/* Alertes Équipements */}
      <EquipementAlertesSection alertesEquipements={alertesEquipements} formatDate={formatDate} onNavigate={(lien) => {
        // Gérer les différents types de liens
        let targetTab = 'materiel';
        
        if (lien === '/mes-epi') {
          targetTab = 'epi';
        } else if (lien && lien.includes('?tab=')) {
          const match = lien.match(/\?tab=(\w+)/);
          if (match) targetTab = match[1];
        }
        
        // Stocker le tab cible et émettre un event pour forcer la navigation
        localStorage.setItem('actifs_target_tab', targetTab);
        
        if (lien) {
          const equipementMatch = lien.match(/equipements\/(.+)/);
          if (equipementMatch) localStorage.setItem('actifs_target_equipement_id', equipementMatch[1]);
        }
        
        // Émettre un event custom pour forcer le changement de tab
        window.dispatchEvent(new CustomEvent('navigateToTab', { detail: { tab: targetTab } }));
        setCurrentPage('actifs');
      }} />

      {/* Alertes Maintenance Véhicules */}
      <VehiculeAlertesSection 
        alertesVehicules={alertesVehicules} 
        isVisible={canViewAlertes}
        onNavigate={() => {
          localStorage.setItem('actifs_target_tab', 'vehicules');
          setCurrentPage('actifs');
        }}
      />

      {/* Alertes NC en retard (Prévention) */}
      {ncEnRetard.count > 0 && (
        <div style={{ 
          marginBottom: '2rem',
          background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
          borderRadius: '12px',
          padding: '1.5rem',
          border: '1px solid #f59e0b'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#92400e', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              ⚠️ Non-conformités en retard
              <span style={{
                background: '#dc2626',
                color: 'white',
                padding: '0.25rem 0.75rem',
                borderRadius: '999px',
                fontSize: '0.875rem',
                fontWeight: '700'
              }}>
                {ncEnRetard.count}
              </span>
            </h3>
            <button
              onClick={() => setCurrentPage('prevention')}
              style={{
                background: '#f59e0b',
                color: 'white',
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '0.875rem'
              }}
            >
              Voir tout →
            </button>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {ncEnRetard.items.map(nc => (
              <div 
                key={nc.id}
                style={{
                  background: 'white',
                  padding: '1rem',
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                }}
              >
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: '600', color: '#1f2937', marginBottom: '0.25rem' }}>
                    {nc.titre || nc.section_grille || 'Non-conformité'}
                  </p>
                  <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                    🏢 {nc.batiment?.nom_etablissement || nc.batiment?.adresse_civique || 'Bâtiment'}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{
                    background: nc.jours_retard > 30 ? '#dc2626' : nc.jours_retard > 7 ? '#f59e0b' : '#eab308',
                    color: 'white',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: '600'
                  }}>
                    {nc.jours_retard} jour{nc.jours_retard > 1 ? 's' : ''} de retard
                  </span>
                </div>
              </div>
            ))}
          </div>
          
          {ncEnRetard.count > 5 && (
            <p style={{ textAlign: 'center', marginTop: '1rem', color: '#92400e', fontSize: '0.875rem' }}>
              + {ncEnRetard.count - 5} autres non-conformités en retard
            </p>
          )}
        </div>
      )}

      {/* Section Personnelle */}
      <div style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#374151', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          👤 Mon Espace Personnel
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
          <HeuresTravailleesCard heures={heuresTravaillees} />
          <StatCard 
            title="Taux de présence formations"
            value={`${tauxPresence}%`}
            subtitle={tauxPresence >= 80 ? '✅ Conforme' : tauxPresence >= 60 ? '⚠️ À améliorer' : '❌ Non conforme'}
            color={tauxPresence >= 80 ? '#10b981' : tauxPresence >= 60 ? '#f59e0b' : '#ef4444'}
          />
          <ProchaineGardeCard garde={prochainGarde} />
          <FormationsAVenirCard formations={formationsInscrites} formatDate={formatDate} />
        </div>

        <EPIAlertesInline alertes={mesEPIAlerts} formatDate={formatDate} />
      </div>

      {/* Section Admin */}
      {canViewGeneralSection && (
        <AdminSection 
          statsGenerales={statsGenerales}
          tauxCouverture={tauxCouverture}
          couvertureMoisSuivant={couvertureMoisSuivant}
          personnesAbsentes={personnesAbsentes}
          activitesRecentes={activitesRecentes}
          formatDate={formatDate}
        />
      )}
    </div>
  );
};

export default Dashboard;
