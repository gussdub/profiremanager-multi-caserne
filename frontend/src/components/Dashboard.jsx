import React, { useState, useEffect } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { useToast } from "../hooks/use-toast";
import { useTenant } from "../contexts/TenantContext";
import { useAuth } from "../contexts/AuthContext";

const Dashboard = () => {
  const { user, tenant } = useAuth();
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const [stats, setStats] = useState({
    personnel: 0,
    vehicules: 0,
    formations: 0,
    epi: 0
  });
  const [loading, setLoading] = useState(true);

  const API = process.env.REACT_APP_BACKEND_URL 
    ? `${process.env.REACT_APP_BACKEND_URL}/api` 
    : '/api';

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = localStorage.getItem(`${tenantSlug}_token`);
        const headers = { Authorization: `Bearer ${token}` };

        // Fetch personnel count
        const usersResponse = await axios.get(`${API}/${tenantSlug}/users`, { headers });
        
        // Fetch vehicules count
        let vehiculesCount = 0;
        try {
          const vehiculesResponse = await axios.get(`${API}/${tenantSlug}/vehicules`, { headers });
          vehiculesCount = vehiculesResponse.data?.length || 0;
        } catch (e) {
          console.log('No vehicules endpoint or error');
        }

        setStats({
          personnel: usersResponse.data?.length || 0,
          vehicules: vehiculesCount,
          formations: 0,
          epi: 0
        });
      } catch (error) {
        console.error('Error fetching dashboard stats:', error);
      } finally {
        setLoading(false);
      }
    };

    if (tenantSlug) {
      fetchStats();
    }
  }, [tenantSlug, API]);

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '50vh' 
      }}>
        <div className="loading-spinner">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-header" style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: '#1e293b' }}>
          👋 Bienvenue, {user?.prenom || 'Utilisateur'}
        </h1>
        <p style={{ color: '#64748b', marginTop: '0.5rem' }}>
          {tenant?.nom || 'ProFireManager'} - Tableau de Bord
        </p>
      </div>

      <div className="stats-grid" style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '1.5rem',
        marginBottom: '2rem'
      }}>
        <Card style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)' }}>
          <CardContent style={{ padding: '1.5rem', color: 'white' }}>
            <div style={{ fontSize: '2.5rem', fontWeight: '700' }}>{stats.personnel}</div>
            <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>👥 Personnel</div>
          </CardContent>
        </Card>

        <Card style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
          <CardContent style={{ padding: '1.5rem', color: 'white' }}>
            <div style={{ fontSize: '2.5rem', fontWeight: '700' }}>{stats.vehicules}</div>
            <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>🚒 Véhicules</div>
          </CardContent>
        </Card>

        <Card style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
          <CardContent style={{ padding: '1.5rem', color: 'white' }}>
            <div style={{ fontSize: '2.5rem', fontWeight: '700' }}>{stats.formations}</div>
            <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>📚 Formations</div>
          </CardContent>
        </Card>

        <Card style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }}>
          <CardContent style={{ padding: '1.5rem', color: 'white' }}>
            <div style={{ fontSize: '2.5rem', fontWeight: '700' }}>{stats.epi}</div>
            <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>🦺 EPI Actifs</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>📋 Accès Rapide</CardTitle>
        </CardHeader>
        <CardContent>
          <p style={{ color: '#64748b' }}>
            Utilisez le menu latéral pour accéder aux différents modules de l'application.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
