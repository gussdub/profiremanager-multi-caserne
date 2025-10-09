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
    if (!newTenant.nom || !newTenant.slug || !newTenant.contact_email) {
      toast({
        title: "Champs requis",
        description: "Veuillez remplir tous les champs obligatoires",
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
    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer la caserne "${tenant.nom}" ?\n\nATTENTION: Toutes les données associées seront supprimées définitivement.`)) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
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

      toast({
        title: "Caserne supprimée",
        description: `La caserne ${tenant.nom} a été supprimée`,
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
        <Button variant="outline" onClick={onLogout}>
          Déconnexion
        </Button>
      </div>

      {/* Statistiques globales */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '30px' }}>
          <Card>
            <CardHeader>
              <CardTitle style={{ fontSize: '14px', color: '#666' }}>Total Casernes</CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#2563eb' }}>
                {stats.total_tenants}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle style={{ fontSize: '14px', color: '#666' }}>Total Utilisateurs</CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#10b981' }}>
                {stats.total_users}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle style={{ fontSize: '14px', color: '#666' }}>Casernes Actives</CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#f59e0b' }}>
                {stats.active_tenants}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle style={{ fontSize: '14px', color: '#666' }}>Total Gardes (ce mois)</CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#8b5cf6' }}>
                {stats.total_assignations_this_month || 0}
              </div>
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
                        style={{ minWidth: '120px' }}
                      >
                        🔗 Accéder
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={() => handleEditTenant(tenant)}
                        style={{ minWidth: '120px' }}
                      >
                        ✏️ Modifier
                      </Button>
                      <Button 
                        variant="destructive" 
                        onClick={() => handleDeleteTenant(tenant)}
                        style={{ minWidth: '120px' }}
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
    </div>
  );
};

export default SuperAdminDashboard;
