import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { useToast } from "../hooks/use-toast";
import { useTenant } from "../contexts/TenantContext";
import { useAuth } from "../contexts/AuthContext";
import { 
  StatCard,
  HeuresTravailleesCard,
  ProchaineGardeCard,
  EPIAlertesCard 
} from './dashboard/StatCards';
import { ActivitesRecentesCard } from './dashboard/ActivitesRecentes';

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
        axios.get(`${API}/${tenantSlug}/planning/assignations/${premierJourMoisCourant}?mode=mois`, { headers, timeout: 10000 }).catch(() => null),
        // 3. Mes EPI
        axios.get(`${API}/${tenantSlug}/mes-epi`, { headers, timeout: 10000 }).catch(() => null),
        // 4. Mes heures (nouvel endpoint accessible à tous les utilisateurs)
        axios.get(`${API}/${tenantSlug}/planning/mes-heures?date_debut=${debutMois}&date_fin=${finMois}`, { headers, timeout: 10000 }).catch(() => null),
        // 5. Mon taux de présence formations (endpoint existant)
        axios.get(`${API}/${tenantSlug}/formations/mon-taux-presence?annee=${now.getFullYear()}`, { headers, timeout: 10000 }).catch(() => null),
        // 6. Assignations mois suivant (backup si pas de garde ce mois-ci)
        axios.get(`${API}/${tenantSlug}/planning/assignations/${premierJourMoisSuivant}?mode=mois`, { headers, timeout: 10000 }).catch(() => null),
        // 7. Formations année suivante (backup)
        axios.get(`${API}/${tenantSlug}/formations?annee=${now.getFullYear() + 1}`, { headers, timeout: 10000 }).catch(() => null),
        // 8. Alertes équipements (visible selon rôle: admin voit tout, personne ressource voit ses catégories)
        axios.get(`${API}/${tenantSlug}/dashboard/alertes-equipements`, { headers, timeout: 10000 }).catch(() => null),
        // 9. Alertes maintenance véhicules (visible admins/superviseurs)
        axios.get(`${API}/${tenantSlug}/actifs/vehicules/alertes-maintenance`, { headers, timeout: 10000 }).catch(() => null),
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
      // Index 0: Formations année courante
      // Index 1: Assignations mois courant
      // Index 2: Mes EPI
      // Index 3: Mes heures
      // Index 4: Mon taux présence
      // Index 5: Assignations mois suivant
      // Index 6: Formations année suivante
      // Index 7: Alertes équipements (pour tous)
      // Index 8-12: Données admin (si isAdmin)
      
      // 8. Alertes équipements (index 7)
      if (results[7]?.data) {
        setAlertesEquipements(results[7].data);
      }
      
      // 9. Alertes maintenance véhicules (index 8)
      if (results[8]?.data) {
        setAlertesVehicules(results[8].data);
      }
      
      // Combiner les formations des deux années pour trouver les prochaines
      const formationsAnneeCourante = results[0]?.data || [];
      const formationsAnneeSuivante = results[6]?.data || [];
      const toutesFormations = [...formationsAnneeCourante, ...formationsAnneeSuivante];
      
      // Date d'aujourd'hui en format YYYY-MM-DD pour comparaison sans problème de fuseau horaire
      const todayStr = now.toISOString().split('T')[0];
      
      // 1. Formations inscrites - chercher la prochaine peu importe quand
      const formationsAVenir = toutesFormations
        .filter(f => (f.date_debut || f.date) >= todayStr)
        .filter(f => f.inscrits?.includes(user.id) || f.participants?.some(p => p.user_id === user.id))
        .sort((a, b) => (a.date_debut || a.date).localeCompare(b.date_debut || b.date))
        .slice(0, 3);
      setFormationsInscrites(formationsAVenir);
      
      // Combiner les assignations des deux mois pour trouver la prochaine garde
      const assignationsMoisCourant = results[1]?.data || [];
      const assignationsMoisSuivant = results[5]?.data || [];
      const toutesAssignations = [...assignationsMoisCourant, ...assignationsMoisSuivant];
      
      // 2. Prochaine garde - chercher la plus proche à partir d'aujourd'hui
      const mesAssignations = toutesAssignations
        .filter(a => a.user_id === user.id && a.date >= todayStr)
        .sort((a, b) => a.date.localeCompare(b.date));
      
      if (mesAssignations.length > 0) {
        setProchainGarde(mesAssignations[0]);
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
      // Index admin: 9=Users, 10=Véhicules, 11=Congés, 12=Planning, 13=Notifications
      if (isAdmin && results.length > 9) {
        const usersData = results[9]?.data;
        const vehiculesData = results[10]?.data;
        const congesData = results[11]?.data;
        const planningDataAdmin = results[12]?.data;
        const notificationsData = results[13]?.data;
        
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
        if (Array.isArray(planningDataAdmin)) {
          const now = new Date();
          const joursTotal = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
          const joursCouverts = new Set(planningDataAdmin.map(a => a.date)).size;
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
    // Parser la date en forçant l'heure locale pour éviter le décalage de fuseau horaire
    // "2026-01-28" doit rester le 28 janvier, pas le 27
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day); // Mois 0-indexé
    return date.toLocaleDateString('fr-CA', { 
      weekday: 'short', 
      day: 'numeric', 
      month: 'short' 
    });
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '';
    // Pour les datetime ISO, on peut utiliser new Date directement
    // Mais pour les dates simples YYYY-MM-DD, on doit parser manuellement
    if (dateStr.includes('T')) {
      const date = new Date(dateStr);
      return date.toLocaleDateString('fr-CA', { 
        day: 'numeric', 
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
    // Date simple sans heure
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('fr-CA', { 
      day: 'numeric', 
      month: 'short'
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

      {/* ===================== ALERTES ÉQUIPEMENTS ===================== */}
      {alertesEquipements.actif && alertesEquipements.total > 0 && (
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
            🔔 Alertes Équipements
            {alertesEquipements.en_retard > 0 && (
              <span style={{
                background: '#ef4444',
                color: 'white',
                fontSize: '0.75rem',
                padding: '2px 8px',
                borderRadius: '12px',
                fontWeight: '600'
              }}>
                {alertesEquipements.en_retard} en retard
              </span>
            )}
          </h2>

          {/* Compteurs par type */}
          <div style={{ 
            display: 'flex', 
            flexWrap: 'wrap',
            gap: '0.75rem',
            marginBottom: '1rem'
          }}>
            {alertesEquipements.compteurs.maintenance > 0 && (
              <div style={{
                background: '#fef3c7',
                border: '1px solid #f59e0b',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                🔧 <strong>{alertesEquipements.compteurs.maintenance}</strong> Maintenance
              </div>
            )}
            {alertesEquipements.compteurs.inspection > 0 && (
              <div style={{
                background: '#dbeafe',
                border: '1px solid #3b82f6',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                🔍 <strong>{alertesEquipements.compteurs.inspection}</strong> Inspection
              </div>
            )}
            {alertesEquipements.compteurs.fin_vie > 0 && (
              <div style={{
                background: '#fee2e2',
                border: '1px solid #ef4444',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                ⏰ <strong>{alertesEquipements.compteurs.fin_vie}</strong> Fin de vie
              </div>
            )}
            {alertesEquipements.compteurs.peremption > 0 && (
              <div style={{
                background: '#fce7f3',
                border: '1px solid #ec4899',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                📅 <strong>{alertesEquipements.compteurs.peremption}</strong> Péremption
              </div>
            )}
            {(alertesEquipements.compteurs.epi_expiration > 0 || 
              alertesEquipements.compteurs.epi_fin_vie > 0 ||
              alertesEquipements.compteurs.epi_inspection_mensuelle > 0) && (
              <div style={{
                background: '#ecfdf5',
                border: '1px solid #10b981',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                🦺 <strong>
                  {(alertesEquipements.compteurs.epi_expiration || 0) + 
                   (alertesEquipements.compteurs.epi_fin_vie || 0) +
                   (alertesEquipements.compteurs.epi_inspection_mensuelle || 0)}
                </strong> EPI
              </div>
            )}
          </div>

          {/* Liste des alertes */}
          <Card>
            <CardContent style={{ padding: '1rem' }}>
              <div style={{ 
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                maxHeight: '400px',
                overflowY: 'auto'
              }}>
                {alertesEquipements.alertes.slice(0, 15).map((alerte, index) => (
                  <div 
                    key={index}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px 12px',
                      background: alerte.en_retard ? '#fef2f2' : '#f8fafc',
                      border: `1px solid ${alerte.en_retard ? '#fecaca' : '#e2e8f0'}`,
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    onClick={() => {
                      if (alerte.lien) {
                        window.location.href = alerte.lien;
                      }
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = alerte.en_retard ? '#fee2e2' : '#f1f5f9';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = alerte.en_retard ? '#fef2f2' : '#f8fafc';
                    }}
                  >
                    <span style={{ fontSize: '1.5rem' }}>{alerte.icone}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ 
                        fontWeight: '600', 
                        fontSize: '0.9rem',
                        color: alerte.en_retard ? '#dc2626' : '#1e293b'
                      }}>
                        {alerte.titre}
                        {alerte.en_retard && (
                          <span style={{
                            marginLeft: '8px',
                            fontSize: '0.7rem',
                            background: '#ef4444',
                            color: 'white',
                            padding: '2px 6px',
                            borderRadius: '4px'
                          }}>
                            EN RETARD
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                        {alerte.description}
                        {alerte.categorie && <span style={{ marginLeft: '8px', color: '#94a3b8' }}>• {alerte.categorie}</span>}
                      </div>
                    </div>
                    {alerte.date_echeance && (
                      <div style={{
                        fontSize: '0.8rem',
                        color: alerte.en_retard ? '#dc2626' : '#64748b',
                        fontWeight: '500',
                        whiteSpace: 'nowrap'
                      }}>
                        {formatDate(alerte.date_echeance)}
                      </div>
                    )}
                  </div>
                ))}
                
                {alertesEquipements.total > 15 && (
                  <div style={{
                    textAlign: 'center',
                    padding: '10px',
                    color: '#64748b',
                    fontSize: '0.85rem'
                  }}>
                    Et {alertesEquipements.total - 15} autres alertes...
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() => window.location.href = '/actifs'}
                      style={{ marginLeft: '8px' }}
                    >
                      Voir tout →
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===================== ALERTES MAINTENANCE VÉHICULES ===================== */}
      {(isAdmin || user?.role === 'superviseur') && alertesVehicules.count > 0 && (
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
            🚗 Alertes Maintenance Véhicules
            {alertesVehicules.critiques > 0 && (
              <span style={{
                background: '#dc2626',
                color: 'white',
                fontSize: '0.75rem',
                padding: '2px 8px',
                borderRadius: '12px',
                fontWeight: '600'
              }}>
                {alertesVehicules.critiques} critique(s)
              </span>
            )}
            {alertesVehicules.urgentes > 0 && (
              <span style={{
                background: '#f97316',
                color: 'white',
                fontSize: '0.75rem',
                padding: '2px 8px',
                borderRadius: '12px',
                fontWeight: '600'
              }}>
                {alertesVehicules.urgentes} urgente(s)
              </span>
            )}
          </h2>

          <Card>
            <CardContent style={{ padding: '1rem' }}>
              <div style={{ 
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                maxHeight: '300px',
                overflowY: 'auto'
              }}>
                {alertesVehicules.alertes.slice(0, 10).map((alerte, index) => (
                  <div 
                    key={index}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px 12px',
                      background: alerte.niveau === 'critique' ? '#fef2f2' : alerte.niveau === 'urgent' ? '#fff7ed' : '#f8fafc',
                      border: `1px solid ${alerte.niveau === 'critique' ? '#fecaca' : alerte.niveau === 'urgent' ? '#fed7aa' : '#e2e8f0'}`,
                      borderRadius: '8px',
                      cursor: 'pointer'
                    }}
                    onClick={() => window.location.href = '/actifs'}
                  >
                    <span style={{ fontSize: '1.5rem' }}>
                      {alerte.type?.includes('vignette') ? '📋' : alerte.type?.includes('entretien') ? '🔧' : alerte.type?.includes('defectuosite') ? '⚠️' : '🚗'}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ 
                        fontWeight: '600', 
                        fontSize: '0.9rem',
                        color: alerte.niveau === 'critique' ? '#dc2626' : alerte.niveau === 'urgent' ? '#ea580c' : '#1e293b'
                      }}>
                        {alerte.vehicule_nom}
                        {alerte.niveau === 'critique' && (
                          <span style={{
                            marginLeft: '8px',
                            fontSize: '0.7rem',
                            background: '#dc2626',
                            color: 'white',
                            padding: '2px 6px',
                            borderRadius: '4px'
                          }}>
                            CRITIQUE
                          </span>
                        )}
                        {alerte.niveau === 'urgent' && (
                          <span style={{
                            marginLeft: '8px',
                            fontSize: '0.7rem',
                            background: '#f97316',
                            color: 'white',
                            padding: '2px 6px',
                            borderRadius: '4px'
                          }}>
                            URGENT
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                        {alerte.message}
                      </div>
                    </div>
                    {alerte.jours_restants !== undefined && (
                      <div style={{
                        fontSize: '0.8rem',
                        color: alerte.jours_restants < 0 ? '#dc2626' : alerte.jours_restants <= 7 ? '#ea580c' : '#64748b',
                        fontWeight: '500',
                        whiteSpace: 'nowrap'
                      }}>
                        {alerte.jours_restants < 0 ? `${Math.abs(alerte.jours_restants)}j retard` : `${alerte.jours_restants}j`}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

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
          {/* Heures travaillées ce mois - Nouveau composant */}
          <HeuresTravailleesCard heures={heuresTravaillees} />

          {/* Taux de présence formations */}
          <StatCard 
            title="Taux de présence formations"
            value={`${tauxPresence}%`}
            subtitle={tauxPresence >= 80 ? '✅ Conforme' : tauxPresence >= 60 ? '⚠️ À améliorer' : '❌ Non conforme'}
            color={tauxPresence >= 80 ? '#10b981' : tauxPresence >= 60 ? '#f59e0b' : '#ef4444'}
          />

          {/* Prochaine garde - Nouveau composant */}
          <ProchaineGardeCard garde={prochainGarde} />

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
                <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>🏥 Absents</div>
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

            {/* Fil d'activité - Utilisation du nouveau composant */}
            <ActivitesRecentesCard activites={activitesRecentes} maxItems={5} />
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
