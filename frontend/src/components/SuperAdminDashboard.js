import React, { useState, useEffect } from 'react';
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useToast } from "../hooks/use-toast";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const SuperAdminDashboard = ({ onLogout }) => {
  const [tenants, setTenants] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCreateAdminModal, setShowCreateAdminModal] = useState(false);
  const [showCreateSuperAdminModal, setShowCreateSuperAdminModal] = useState(false);
  const [showManageSuperAdminsModal, setShowManageSuperAdminsModal] = useState(false);
  const [showEditSuperAdminModal, setShowEditSuperAdminModal] = useState(false);
  const [superAdmins, setSuperAdmins] = useState([]);
  const [editingSuperAdmin, setEditingSuperAdmin] = useState(null);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [newTenant, setNewTenant] = useState({
    nom: '',
    slug: '',
    contact_email: '',
    contact_telephone: '',
    adresse: '',
    date_creation: ''
  });
  const [newAdmin, setNewAdmin] = useState({
    email: '',
    prenom: '',
    nom: '',
    mot_de_passe: ''
  });
  const [newSuperAdmin, setNewSuperAdmin] = useState({
    email: '',
    prenom: '',
    nom: '',
    mot_de_passe: ''
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      
      const [tenantsResponse, statsResponse] = await Promise.all([
        fetch(`${API}/admin/tenants`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }),
        fetch(`${API}/admin/stats`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        })
      ]);

      const tenantsData = await tenantsResponse.json();
      const statsData = await statsResponse.json();

      setTenants(tenantsData);
      setStats(statsData);
    } catch (error) {
      console.error('Erreur chargement données:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les données",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTenant = async () => {
    if (!newTenant.nom || !newTenant.slug) {
      toast({
        title: "Champs requis",
        description: "Veuillez remplir le nom et le slug",
        variant: "destructive"
      });
      return;
    }

    // Valider le slug (alphanumerique et tirets seulement)
    if (!/^[a-z0-9-]+$/.test(newTenant.slug)) {
      toast({
        title: "Slug invalide",
        description: "Le slug doit contenir uniquement des lettres minuscules, chiffres et tirets",
        variant: "destructive"
      });
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/admin/tenants`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newTenant)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Erreur création');
      }

      toast({
        title: "Caserne créée",
        description: `La caserne ${newTenant.nom} a été créée avec succès`,
        variant: "success"
      });

      setShowCreateModal(false);
      resetNewTenant();
      fetchData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message || "Impossible de créer la caserne",
        variant: "destructive"
      });
    }
  };

  const handleEditTenant = (tenant) => {
    setSelectedTenant(tenant);
    setNewTenant({
      nom: tenant.nom,
      slug: tenant.slug,
      contact_email: tenant.contact_email,
      contact_telephone: tenant.contact_telephone || '',
      adresse: tenant.adresse || '',
      is_active: tenant.is_active !== undefined ? tenant.is_active : true
    });
    setShowEditModal(true);
  };

  const handleUpdateTenant = async () => {
    if (!newTenant.nom || !newTenant.contact_email) {
      toast({
        title: "Champs requis",
        description: "Veuillez remplir tous les champs obligatoires",
        variant: "destructive"
      });
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/admin/tenants/${selectedTenant.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          nom: newTenant.nom,
          contact_email: newTenant.contact_email,
          contact_telephone: newTenant.contact_telephone,
          adresse: newTenant.adresse,
          is_active: newTenant.is_active
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Erreur modification');
      }

      toast({
        title: "Caserne modifiée",
        description: "Les informations ont été mises à jour",
        variant: "success"
      });

      setShowEditModal(false);
      setSelectedTenant(null);
      resetNewTenant();
      fetchData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message || "Impossible de modifier la caserne",
        variant: "destructive"
      });
    }
  };

  const handleDeleteTenant = async (tenant) => {
    try {
      // Récupérer l'impact de la suppression
      const token = localStorage.getItem('token');
      const impactResponse = await fetch(`${API}/admin/tenants/${tenant.id}/deletion-impact`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!impactResponse.ok) {
        throw new Error('Impossible de récupérer les informations');
      }

      const impactData = await impactResponse.json();
      const impact = impactData.impact;

      // Construire le message de confirmation détaillé
      let message = `⚠️ SUPPRESSION DÉFINITIVE DE LA CASERNE "${tenant.nom}"\n\n`;
      message += `Cette action est IRRÉVERSIBLE et supprimera:\n\n`;
      message += `• ${impact.utilisateurs} utilisateur(s)\n`;
      message += `• ${impact.assignations} assignation(s)\n`;
      message += `• ${impact.formations} formation(s)\n`;
      message += `• ${impact.epi} EPI\n`;
      message += `• ${impact.gardes} garde(s)\n`;
      message += `• ${impact.disponibilites} disponibilité(s)\n`;
      message += `• ${impact.conges} congé(s)\n`;
      message += `\n❌ TOUTES CES DONNÉES SERONT PERDUES DÉFINITIVEMENT!\n\n`;
      message += `Tapez "${tenant.nom}" pour confirmer la suppression.`;

      const confirmation = window.prompt(message);
      
      if (confirmation !== tenant.nom) {
        toast({
          title: "Suppression annulée",
          description: "La confirmation ne correspond pas au nom de la caserne",
          variant: "default"
        });
        return;
      }

      // Procéder à la suppression
      const response = await fetch(`${API}/admin/tenants/${tenant.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Erreur suppression');
      }

      const result = await response.json();

      toast({
        title: "✅ Caserne supprimée définitivement",
        description: `${result.deleted.users} utilisateur(s) et toutes les données associées ont été supprimés`,
        variant: "success"
      });

      fetchData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message || "Impossible de supprimer la caserne",
        variant: "destructive"
      });
    }
  };

  const handleCreateAdmin = (tenant) => {
    setSelectedTenant(tenant);
    setNewAdmin({
      email: '',
      prenom: '',
      nom: '',
      mot_de_passe: ''
    });
    setShowCreateAdminModal(true);
  };

  const handleSubmitCreateAdmin = async () => {
    if (!newAdmin.email || !newAdmin.prenom || !newAdmin.nom || !newAdmin.mot_de_passe) {
      toast({
        title: "Erreur",
        description: "Tous les champs sont requis",
        variant: "destructive"
      });
      return;
    }

    if (newAdmin.mot_de_passe.length < 6) {
      toast({
        title: "Erreur",
        description: "Le mot de passe doit contenir au moins 6 caractères",
        variant: "destructive"
      });
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/admin/tenants/${selectedTenant.id}/create-admin`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newAdmin)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Erreur création admin');
      }

      toast({
        title: "Administrateur créé",
        description: `L'admin ${newAdmin.prenom} ${newAdmin.nom} a été créé avec succès. Un email de bienvenue a été envoyé.`,
        variant: "success"
      });

      setShowCreateAdminModal(false);
      setNewAdmin({ email: '', prenom: '', nom: '', mot_de_passe: '' });
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleAccessTenant = (tenant) => {
    // Rediriger vers l'interface du tenant
    window.location.href = `/${tenant.slug}`;
  };

  const resetNewTenant = () => {
    setNewTenant({
      nom: '',
      slug: '',
      contact_email: '',
      contact_telephone: '',
      adresse: ''
    });
  };

  // Fonctions pour gérer les super admins
  const fetchSuperAdmins = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/admin/super-admins`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la récupération des super admins');
      }

      const data = await response.json();
      setSuperAdmins(data);
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleCreateSuperAdmin = async () => {
    if (!newSuperAdmin.email || !newSuperAdmin.prenom || !newSuperAdmin.nom || !newSuperAdmin.mot_de_passe) {
      toast({
        title: "Erreur",
        description: "Tous les champs sont obligatoires",
        variant: "destructive"
      });
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/admin/super-admins`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newSuperAdmin)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Erreur lors de la création du super admin');
      }

      toast({
        title: "Succès",
        description: "Super admin créé avec succès"
      });

      setShowCreateSuperAdminModal(false);
      setNewSuperAdmin({ email: '', prenom: '', nom: '', mot_de_passe: '' });
      fetchSuperAdmins();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleDeleteSuperAdmin = async (superAdminId) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce super admin ?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/admin/super-admins/${superAdminId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Erreur lors de la suppression');
      }

      toast({
        title: "Succès",
        description: "Super admin supprimé avec succès"
      });

      fetchSuperAdmins();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  if (loading) {
    return (
      <div className="loading-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Chargement...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', margin: '0 0 5px 0' }}>
            🔧 Administration Multi-Tenant
          </h1>
          <p style={{ color: '#666', margin: 0 }}>Gestion centralisée des casernes ProFireManager</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Button 
            variant="default" 
            onClick={() => {
              setShowCreateSuperAdminModal(true);
            }}
            style={{ background: '#10b981' }}
          >
            ➕ Ajouter un super admin
          </Button>
          <Button 
            variant="default" 
            onClick={() => {
              fetchSuperAdmins();
              setShowManageSuperAdminsModal(true);
            }}
            style={{ background: '#3b82f6' }}
          >
            👥 Gérer les super admins
          </Button>
          <Button variant="outline" onClick={onLogout}>
            Déconnexion
          </Button>
        </div>
      </div>

      {/* Statistiques globales */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '30px' }}>
          <Card>
            <CardHeader>
              <CardTitle style={{ fontSize: '14px', color: '#666' }}>Casernes Actives</CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#10b981' }}>
                {stats.casernes_actives || 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle style={{ fontSize: '14px', color: '#666' }}>Casernes Inactives</CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#ef4444' }}>
                {stats.casernes_inactives || 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle style={{ fontSize: '14px', color: '#666' }}>Total Pompiers</CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#2563eb' }}>
                {stats.total_pompiers || 0}
              </div>
            </CardContent>
          </Card>

          <Card style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: 'none' }}>
            <CardHeader>
              <CardTitle style={{ fontSize: '14px', color: 'white' }}>💰 Revenus Mensuels</CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: 'white' }}>
                {stats.revenus_mensuels ? `${stats.revenus_mensuels}$` : '0$'}
              </div>
              <small style={{ color: 'rgba(255,255,255,0.8)', fontSize: '12px' }}>
                Basé sur {stats.total_pompiers || 0} pompiers actifs
              </small>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Liste des casernes */}
      <Card>
        <CardHeader style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <CardTitle>Casernes</CardTitle>
          <Button onClick={() => setShowCreateModal(true)}>
            ➕ Créer une caserne
          </Button>
        </CardHeader>
        <CardContent>
          {tenants.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
              Aucune caserne créée. Créez votre première caserne pour commencer.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '15px' }}>
              {tenants.map(tenant => (
                <Card key={tenant.id} style={{ padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ fontSize: '20px', fontWeight: 'bold', margin: '0 0 10px 0' }}>
                        🏢 {tenant.nom}
                      </h3>
                      <div style={{ display: 'grid', gap: '5px', fontSize: '14px', color: '#666' }}>
                        <div>
                          <strong>URL:</strong> /{tenant.slug}
                        </div>
                        <div>
                          <strong>Email:</strong> {tenant.contact_email}
                        </div>
                        {tenant.contact_telephone && (
                          <div>
                            <strong>Téléphone:</strong> {tenant.contact_telephone}
                          </div>
                        )}
                        {tenant.adresse && (
                          <div>
                            <strong>Adresse:</strong> {tenant.adresse}
                          </div>
                        )}
                        <div>
                          <strong>Créée le:</strong> {tenant.date_creation ? new Date(tenant.date_creation).toLocaleDateString('fr-FR') : tenant.created_at ? new Date(tenant.created_at).toLocaleDateString('fr-FR') : 'Non spécifiée'}
                        </div>
                        <div>
                          <strong>Statut:</strong>{' '}
                          <span style={{ 
                            color: (tenant.is_active !== undefined ? tenant.is_active : tenant.actif) ? '#10b981' : '#ef4444',
                            fontWeight: 'bold'
                          }}>
                            {(tenant.is_active !== undefined ? tenant.is_active : tenant.actif) ? '✓ Active' : '✗ Inactive'}
                          </span>
                        </div>
                        <div style={{ 
                          marginTop: '15px', 
                          padding: '15px', 
                          background: '#f8fafc', 
                          borderRadius: '8px',
                          border: '1px solid #e2e8f0'
                        }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#1e293b' }}>
                            📊 Facturation
                          </div>
                          <div style={{ display: 'grid', gap: '5px' }}>
                            <div>
                              <strong>Personnel:</strong> {tenant.nombre_employes || 0} / {
                                tenant.nombre_employes <= 30 ? 30 : tenant.nombre_employes <= 50 ? 50 : '∞'
                              }
                            </div>
                            <div>
                              <strong>Palier:</strong>{' '}
                              <span style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '12px',
                                fontWeight: 'bold',
                                background: tenant.nombre_employes <= 30 ? '#dbeafe' : tenant.nombre_employes <= 50 ? '#fef3c7' : '#fecaca',
                                color: tenant.nombre_employes <= 30 ? '#1e40af' : tenant.nombre_employes <= 50 ? '#92400e' : '#991b1b'
                              }}>
                                {tenant.nombre_employes <= 30 ? 'Basic (1-30)' : tenant.nombre_employes <= 50 ? 'Standard (31-50)' : 'Premium (51+)'}
                              </span>
                            </div>
                            <div>
                              <strong>Prix:</strong>{' '}
                              <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#dc2626' }}>
                                {tenant.nombre_employes <= 30 ? '12' : tenant.nombre_employes <= 50 ? '20' : '27'}$/mois
                              </span>
                            </div>
                            {tenant.nombre_employes >= 30 && (
                              <div style={{ 
                                marginTop: '8px', 
                                padding: '8px', 
                                background: '#fef2f2', 
                                borderRadius: '4px',
                                fontSize: '12px',
                                color: '#991b1b'
                              }}>
                                ⚠️ Limite de palier atteinte
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', flexDirection: 'column' }}>
                      <Button 
                        variant="default" 
                        onClick={() => handleAccessTenant(tenant)}
                        style={{ minWidth: '140px' }}
                      >
                        🔗 Accéder
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={() => handleCreateAdmin(tenant)}
                        style={{ minWidth: '140px', background: '#10b981', color: 'white', border: 'none' }}
                      >
                        👤 Créer Admin
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={() => handleEditTenant(tenant)}
                        style={{ minWidth: '140px' }}
                      >
                        ✏️ Modifier
                      </Button>
                      <Button 
                        variant="destructive" 
                        onClick={() => handleDeleteTenant(tenant)}
                        style={{ minWidth: '140px' }}
                      >
                        🗑️ Supprimer
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Créer Caserne */}
      {showCreateModal && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="modal-content" style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '30px',
            maxWidth: '600px',
            width: '90%',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>
              Créer une nouvelle caserne
            </h2>

            <div style={{ display: 'grid', gap: '20px' }}>
              <div>
                <Label>Nom de la caserne *</Label>
                <Input
                  value={newTenant.nom}
                  onChange={(e) => setNewTenant({ ...newTenant, nom: e.target.value })}
                  placeholder="Ex: Caserne de Shefford"
                />
              </div>

              <div>
                <Label>Slug (URL) *</Label>
                <Input
                  value={newTenant.slug}
                  onChange={(e) => setNewTenant({ ...newTenant, slug: e.target.value.toLowerCase() })}
                  placeholder="Ex: shefford"
                />
                <p style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                  Lettres minuscules, chiffres et tirets uniquement. URL: /{newTenant.slug || 'slug'}
                </p>
              </div>

              <div>
                <Label>Email de contact *</Label>
                <Input
                  type="email"
                  value={newTenant.contact_email}
                  onChange={(e) => setNewTenant({ ...newTenant, contact_email: e.target.value })}
                  placeholder="contact@caserne.com"
                />
              </div>

              <div>
                <Label>Téléphone</Label>
                <Input
                  value={newTenant.contact_telephone}
                  onChange={(e) => setNewTenant({ ...newTenant, contact_telephone: e.target.value })}
                  placeholder="(450) 555-1234"
                />
              </div>

              <div>
                <Label>Adresse</Label>
                <Input
                  value={newTenant.adresse}
                  onChange={(e) => setNewTenant({ ...newTenant, adresse: e.target.value })}
                  placeholder="123 Rue Principale, Ville, Province"
                />
              </div>

              <div>
                <Label>Date de création (optionnel)</Label>
                <Input
                  type="date"
                  value={newTenant.date_creation}
                  onChange={(e) => setNewTenant({ ...newTenant, date_creation: e.target.value })}
                  placeholder="Laissez vide pour aujourd'hui"
                />
                <small style={{ color: '#64748b' }}>Laissez vide pour la date actuelle</small>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '30px', justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => {
                setShowCreateModal(false);
                resetNewTenant();
              }}>
                Annuler
              </Button>
              <Button onClick={handleCreateTenant}>
                Créer la caserne
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Modifier Caserne */}
      {showEditModal && selectedTenant && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="modal-content" style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '30px',
            maxWidth: '600px',
            width: '90%',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>
              Modifier la caserne
            </h2>

            <div style={{ display: 'grid', gap: '20px' }}>
              <div>
                <Label>Nom de la caserne *</Label>
                <Input
                  value={newTenant.nom}
                  onChange={(e) => setNewTenant({ ...newTenant, nom: e.target.value })}
                  placeholder="Ex: Caserne de Shefford"
                />
              </div>

              <div>
                <Label>Slug (URL)</Label>
                <Input
                  value={newTenant.slug}
                  disabled
                  style={{ backgroundColor: '#f3f4f6', cursor: 'not-allowed' }}
                />
                <p style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                  Le slug ne peut pas être modifié après création
                </p>
              </div>

              <div>
                <Label>Email de contact *</Label>
                <Input
                  type="email"
                  value={newTenant.contact_email}
                  onChange={(e) => setNewTenant({ ...newTenant, contact_email: e.target.value })}
                  placeholder="contact@caserne.com"
                />
              </div>

              <div>
                <Label>Téléphone</Label>
                <Input
                  value={newTenant.contact_telephone}
                  onChange={(e) => setNewTenant({ ...newTenant, contact_telephone: e.target.value })}
                  placeholder="(450) 555-1234"
                />
              </div>

              <div>
                <Label>Adresse</Label>
                <Input
                  value={newTenant.adresse}
                  onChange={(e) => setNewTenant({ ...newTenant, adresse: e.target.value })}
                  placeholder="123 Rue Principale, Ville, Province"
                />
              </div>

              <div>
                <Label>Date de création</Label>
                <Input
                  type="date"
                  value={newTenant.date_creation?.split('T')[0] || ''}
                  onChange={(e) => setNewTenant({ ...newTenant, date_creation: e.target.value })}
                />
                <small style={{ color: '#64748b' }}>Date d'activation de la caserne</small>
              </div>

              <div style={{ 
                padding: '20px', 
                background: '#f8fafc', 
                borderRadius: '8px',
                border: '1px solid #e2e8f0'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <Label style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '5px' }}>
                      Statut de la caserne
                    </Label>
                    <p style={{ fontSize: '13px', color: '#64748b', margin: '5px 0 0 0' }}>
                      {newTenant.is_active 
                        ? "✅ Caserne active - Les utilisateurs peuvent se connecter" 
                        : "⚠️ Caserne inactive - Les utilisateurs ne peuvent pas se connecter"}
                    </p>
                  </div>
                  <label style={{ 
                    position: 'relative', 
                    display: 'inline-block', 
                    width: '60px', 
                    height: '34px',
                    cursor: 'pointer'
                  }}>
                    <input
                      type="checkbox"
                      checked={newTenant.is_active}
                      onChange={(e) => setNewTenant({ ...newTenant, is_active: e.target.checked })}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span style={{
                      position: 'absolute',
                      cursor: 'pointer',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: newTenant.is_active ? '#10b981' : '#ef4444',
                      transition: '0.4s',
                      borderRadius: '34px'
                    }}>
                      <span style={{
                        position: 'absolute',
                        content: '',
                        height: '26px',
                        width: '26px',
                        left: newTenant.is_active ? '30px' : '4px',
                        bottom: '4px',
                        backgroundColor: 'white',
                        transition: '0.4s',
                        borderRadius: '50%'
                      }}></span>
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '30px', justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => {
                setShowEditModal(false);
                setSelectedTenant(null);
                resetNewTenant();
              }}>
                Annuler
              </Button>
              <Button onClick={handleUpdateTenant}>
                Enregistrer les modifications
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Créer Admin pour Caserne */}
      {showCreateAdminModal && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div className="modal-content" style={{
            backgroundColor: 'white',
            padding: '30px',
            borderRadius: '10px',
            maxWidth: '500px',
            width: '90%',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <h2 style={{ marginBottom: '20px', fontSize: '24px', fontWeight: 'bold' }}>
              👤 Créer un Administrateur
            </h2>
            <p style={{ marginBottom: '20px', color: '#666', fontSize: '14px' }}>
              Créer le premier administrateur pour <strong>{selectedTenant?.nom}</strong>
            </p>

            <div style={{ display: 'grid', gap: '15px' }}>
              <div>
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={newAdmin.email}
                  onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })}
                  placeholder="admin@caserne.ca"
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div>
                  <Label>Prénom *</Label>
                  <Input
                    value={newAdmin.prenom}
                    onChange={(e) => setNewAdmin({ ...newAdmin, prenom: e.target.value })}
                    placeholder="Jean"
                    required
                  />
                </div>

                <div>
                  <Label>Nom *</Label>
                  <Input
                    value={newAdmin.nom}
                    onChange={(e) => setNewAdmin({ ...newAdmin, nom: e.target.value })}
                    placeholder="Dupont"
                    required
                  />
                </div>
              </div>

              <div>
                <Label>Mot de passe *</Label>
                <Input
                  type="password"
                  value={newAdmin.mot_de_passe}
                  onChange={(e) => setNewAdmin({ ...newAdmin, mot_de_passe: e.target.value })}
                  placeholder="Minimum 6 caractères"
                  required
                />
                <small style={{ color: '#64748b', fontSize: '12px' }}>
                  Ce mot de passe sera envoyé par email à l'administrateur
                </small>
              </div>

              <div style={{
                padding: '15px',
                background: '#f0f9ff',
                borderRadius: '8px',
                border: '1px solid #bae6fd',
                fontSize: '13px',
                color: '#0369a1'
              }}>
                ℹ️ L'administrateur recevra un email de bienvenue avec ses identifiants de connexion et pourra créer d'autres utilisateurs depuis le module Personnel.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '30px', justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => {
                setShowCreateAdminModal(false);
                setSelectedTenant(null);
                setNewAdmin({ email: '', prenom: '', nom: '', mot_de_passe: '' });
              }}>
                Annuler
              </Button>
              <Button onClick={handleSubmitCreateAdmin} style={{ background: '#10b981' }}>
                ✅ Créer l'administrateur
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Créer un super admin */}
      {showCreateSuperAdminModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '30px',
            width: '500px',
            maxWidth: '90%',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <h2 style={{ margin: '0 0 20px 0', fontSize: '24px', fontWeight: 'bold' }}>
              👨‍💼 Créer un super admin
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <Label>Prénom *</Label>
                <Input
                  type="text"
                  value={newSuperAdmin.prenom}
                  onChange={(e) => setNewSuperAdmin({ ...newSuperAdmin, prenom: e.target.value })}
                  placeholder="Jean"
                  required
                />
              </div>

              <div>
                <Label>Nom *</Label>
                <Input
                  type="text"
                  value={newSuperAdmin.nom}
                  onChange={(e) => setNewSuperAdmin({ ...newSuperAdmin, nom: e.target.value })}
                  placeholder="Dupont"
                  required
                />
              </div>

              <div>
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={newSuperAdmin.email}
                  onChange={(e) => setNewSuperAdmin({ ...newSuperAdmin, email: e.target.value })}
                  placeholder="super.admin@exemple.com"
                  required
                />
              </div>

              <div>
                <Label>Mot de passe *</Label>
                <Input
                  type="password"
                  value={newSuperAdmin.mot_de_passe}
                  onChange={(e) => setNewSuperAdmin({ ...newSuperAdmin, mot_de_passe: e.target.value })}
                  placeholder="Minimum 8 caractères"
                  required
                />
                <small style={{ color: '#64748b', fontSize: '12px' }}>
                  Minimum 8 caractères, 1 majuscule, 1 chiffre, 1 caractère spécial
                </small>
              </div>

              <div style={{
                padding: '15px',
                background: '#fef3c7',
                borderRadius: '8px',
                border: '1px solid #fcd34d',
                fontSize: '13px',
                color: '#92400e'
              }}>
                ⚠️ Un super admin peut gérer TOUS les tenants et accéder à cette interface d'administration.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '30px', justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => {
                setShowCreateSuperAdminModal(false);
                setNewSuperAdmin({ email: '', prenom: '', nom: '', mot_de_passe: '' });
              }}>
                Annuler
              </Button>
              <Button onClick={handleCreateSuperAdmin} style={{ background: '#10b981' }}>
                ✅ Créer le super admin
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Gérer les super admins */}
      {showManageSuperAdminsModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '30px',
            width: '700px',
            maxWidth: '90%',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <h2 style={{ margin: '0 0 20px 0', fontSize: '24px', fontWeight: 'bold' }}>
              👥 Gestion des super admins
            </h2>

            {superAdmins.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                Aucun super admin trouvé
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {superAdmins.map((admin) => (
                  <div key={admin.id} style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '15px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '16px' }}>
                        {admin.prenom} {admin.nom}
                      </div>
                      <div style={{ color: '#64748b', fontSize: '14px' }}>
                        {admin.email}
                      </div>
                    </div>
                    <Button 
                      variant="destructive"
                      onClick={() => handleDeleteSuperAdmin(admin.id)}
                      style={{ background: '#dc2626' }}
                    >
                      🗑️ Supprimer
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '30px', justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => {
                setShowManageSuperAdminsModal(false);
              }}>
                Fermer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminDashboard;
