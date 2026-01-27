import React, { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { useToast } from '../hooks/use-toast';
import { useTenant } from '../contexts/TenantContext';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';

const ConfigurationSFTP = ({ user }) => {
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [config, setConfig] = useState(null);
  const [status, setStatus] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef(null);
  
  const [formData, setFormData] = useState({
    host: '',
    port: 22,
    username: '',
    password: '',
    remote_path: '/',
    polling_interval: 30,
    actif: true,
    description: ''
  });

  useEffect(() => {
    fetchConfig();
    fetchStatus();
    
    // Cleanup WebSocket on unmount
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [tenantSlug]);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const data = await apiGet(tenantSlug, '/sftp/config');
      if (data) {
        setConfig(data);
        setFormData({
          host: data.host || '',
          port: data.port || 22,
          username: data.username || '',
          password: '', // Ne pas afficher le mot de passe
          remote_path: data.remote_path || '/',
          polling_interval: data.polling_interval || 30,
          actif: data.actif !== false,
          description: data.description || ''
        });
      }
    } catch (error) {
      // Config n'existe pas encore, c'est OK
      console.log('Pas de configuration SFTP existante');
    } finally {
      setLoading(false);
    }
  };

  const fetchStatus = async () => {
    try {
      const data = await apiGet(tenantSlug, '/sftp/status');
      setStatus(data);
    } catch (error) {
      console.error('Erreur récupération statut SFTP:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.host || !formData.username) {
      toast({
        title: "Erreur",
        description: "L'hôte et le nom d'utilisateur sont requis",
        variant: "destructive"
      });
      return;
    }
    
    // Si pas de nouveau mot de passe et config existante, on ne l'envoie pas
    const dataToSend = { ...formData };
    if (!dataToSend.password && config) {
      delete dataToSend.password;
    }
    
    try {
      setSaving(true);
      
      if (config) {
        await apiPut(tenantSlug, '/sftp/config', dataToSend);
      } else {
        if (!formData.password) {
          toast({
            title: "Erreur",
            description: "Le mot de passe est requis pour une nouvelle configuration",
            variant: "destructive"
          });
          return;
        }
        await apiPost(tenantSlug, '/sftp/config', dataToSend);
      }
      
      toast({
        title: "Succès",
        description: "Configuration SFTP enregistrée"
      });
      
      fetchConfig();
      fetchStatus();
      
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message || "Erreur lors de l'enregistrement",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    const testData = { ...formData };
    
    // Si pas de mot de passe dans le formulaire mais config existe, on utilise la config existante
    if (!testData.password && config) {
      // Tester avec la config existante
      try {
        setTesting(true);
        const result = await apiPost(tenantSlug, '/sftp/test', null);
        
        if (result.success) {
          toast({
            title: "✅ Connexion réussie",
            description: result.message
          });
        } else {
          toast({
            title: "❌ Échec de connexion",
            description: result.message,
            variant: "destructive"
          });
        }
      } catch (error) {
        toast({
          title: "Erreur",
          description: error.message || "Erreur lors du test",
          variant: "destructive"
        });
      } finally {
        setTesting(false);
      }
      return;
    }
    
    // Tester avec les nouveaux paramètres
    if (!testData.host || !testData.username || !testData.password) {
      toast({
        title: "Erreur",
        description: "Tous les champs de connexion sont requis pour le test",
        variant: "destructive"
      });
      return;
    }
    
    try {
      setTesting(true);
      const result = await apiPost(tenantSlug, '/sftp/test', testData);
      
      if (result.success) {
        toast({
          title: "✅ Connexion réussie",
          description: result.message
        });
      } else {
        toast({
          title: "❌ Échec de connexion",
          description: result.message,
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message || "Erreur lors du test",
        variant: "destructive"
      });
    } finally {
      setTesting(false);
    }
  };

  const handleStartPolling = async () => {
    try {
      await apiPost(tenantSlug, '/sftp/start-polling');
      toast({
        title: "Succès",
        description: "Surveillance SFTP démarrée"
      });
      fetchStatus();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message || "Erreur lors du démarrage",
        variant: "destructive"
      });
    }
  };

  const handleStopPolling = async () => {
    try {
      await apiPost(tenantSlug, '/sftp/stop-polling');
      toast({
        title: "Succès",
        description: "Surveillance SFTP arrêtée"
      });
      fetchStatus();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message || "Erreur lors de l'arrêt",
        variant: "destructive"
      });
    }
  };

  const handleCheckNow = async () => {
    try {
      setTesting(true);
      const result = await apiPost(tenantSlug, '/sftp/check-now');
      
      toast({
        title: "Vérification terminée",
        description: result.message
      });
      
      fetchStatus();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message || "Erreur lors de la vérification",
        variant: "destructive"
      });
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer la configuration SFTP ?")) {
      return;
    }
    
    try {
      await apiDelete(tenantSlug, '/sftp/config');
      toast({
        title: "Succès",
        description: "Configuration SFTP supprimée"
      });
      setConfig(null);
      setFormData({
        host: '',
        port: 22,
        username: '',
        password: '',
        remote_path: '/',
        polling_interval: 30,
        actif: true,
        description: ''
      });
      fetchStatus();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message || "Erreur lors de la suppression",
        variant: "destructive"
      });
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div className="loading-spinner"></div>
        <p>Chargement...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        📡 Configuration SFTP - Cartes d'appel 911
      </h2>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
        {/* Formulaire de configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Paramètres de connexion</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: '1rem' }}>
                <div>
                  <Label htmlFor="host">Serveur SFTP *</Label>
                  <Input
                    id="host"
                    value={formData.host}
                    onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                    placeholder="sftp.exemple.com"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="port">Port</Label>
                  <Input
                    id="port"
                    type="number"
                    value={formData.port}
                    onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 22 })}
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="username">Nom d'utilisateur *</Label>
                <Input
                  id="username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="user"
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="password">
                  Mot de passe {config ? '(laisser vide pour conserver)' : '*'}
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder={config ? '••••••••' : 'Mot de passe'}
                  required={!config}
                />
              </div>
              
              <div>
                <Label htmlFor="remote_path">Chemin du répertoire</Label>
                <Input
                  id="remote_path"
                  value={formData.remote_path}
                  onChange={(e) => setFormData({ ...formData, remote_path: e.target.value })}
                  placeholder="/cartes_appel"
                />
              </div>
              
              <div>
                <Label htmlFor="polling_interval">Intervalle de vérification (secondes)</Label>
                <Input
                  id="polling_interval"
                  type="number"
                  min="10"
                  max="300"
                  value={formData.polling_interval}
                  onChange={(e) => setFormData({ ...formData, polling_interval: parseInt(e.target.value) || 30 })}
                />
                <small style={{ color: '#666', marginTop: '0.25rem', display: 'block' }}>
                  Recommandé: 30 secondes
                </small>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  id="actif"
                  checked={formData.actif}
                  onChange={(e) => setFormData({ ...formData, actif: e.target.checked })}
                />
                <Label htmlFor="actif" style={{ marginBottom: 0 }}>Configuration active</Label>
              </div>
              
              <div>
                <Label htmlFor="description">Description (optionnel)</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="CAUCA - Chaudière-Appalaches"
                />
              </div>
              
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Enregistrement...' : (config ? 'Mettre à jour' : 'Créer')}
                </Button>
                <Button type="button" variant="outline" onClick={handleTest} disabled={testing}>
                  {testing ? 'Test...' : '🔌 Tester la connexion'}
                </Button>
                {config && (
                  <Button type="button" variant="destructive" onClick={handleDelete}>
                    🗑️ Supprimer
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
        
        {/* Statut et contrôle */}
        <Card>
          <CardHeader>
            <CardTitle>Statut du service</CardTitle>
          </CardHeader>
          <CardContent>
            {status ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ 
                  padding: '1rem', 
                  borderRadius: '8px', 
                  backgroundColor: status.polling_active ? '#dcfce7' : '#fef3c7',
                  border: `1px solid ${status.polling_active ? '#86efac' : '#fcd34d'}`
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '1.5rem' }}>
                      {status.polling_active ? '✅' : '⏸️'}
                    </span>
                    <strong>
                      {status.polling_active ? 'Surveillance active' : 'Surveillance inactive'}
                    </strong>
                  </div>
                  
                  <div style={{ fontSize: '0.9rem', color: '#666' }}>
                    <p>• Configuration: {status.configured ? 'Oui' : 'Non'}</p>
                    <p>• Configuration active: {status.config_active ? 'Oui' : 'Non'}</p>
                    {status.polling_interval && (
                      <p>• Intervalle: {status.polling_interval}s</p>
                    )}
                    {status.last_check && (
                      <p>• Dernière vérification: {new Date(status.last_check).toLocaleString('fr-FR')}</p>
                    )}
                    <p>• Connexions WebSocket: {status.websocket_connections}</p>
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {status.polling_active ? (
                    <Button variant="outline" onClick={handleStopPolling}>
                      ⏹️ Arrêter la surveillance
                    </Button>
                  ) : (
                    <Button onClick={handleStartPolling} disabled={!status.configured || !status.config_active}>
                      ▶️ Démarrer la surveillance
                    </Button>
                  )}
                  
                  <Button variant="outline" onClick={handleCheckNow} disabled={testing || !status.configured}>
                    {testing ? '⏳ Vérification...' : '🔄 Vérifier maintenant'}
                  </Button>
                </div>
                
                {/* Info WebSocket */}
                <div style={{ 
                  marginTop: '1rem', 
                  padding: '1rem', 
                  backgroundColor: '#f1f5f9', 
                  borderRadius: '8px',
                  fontSize: '0.9rem'
                }}>
                  <strong>💡 Notifications temps réel</strong>
                  <p style={{ marginTop: '0.5rem', color: '#666' }}>
                    Les nouvelles interventions seront affichées automatiquement dans le module 
                    "Interventions en attente" grâce à la connexion WebSocket.
                  </p>
                </div>
              </div>
            ) : (
              <p>Chargement du statut...</p>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Instructions */}
      <Card style={{ marginTop: '1.5rem' }}>
        <CardHeader>
          <CardTitle>📖 Instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ fontSize: '0.95rem', lineHeight: '1.6' }}>
            <p><strong>1. Configuration du serveur SFTP</strong></p>
            <p style={{ marginLeft: '1rem', color: '#666' }}>
              Entrez les informations de connexion au serveur SFTP de votre centrale 911.
              Le chemin du répertoire doit pointer vers le dossier où sont déposées les cartes d'appel XML.
            </p>
            
            <p style={{ marginTop: '1rem' }}><strong>2. Test de connexion</strong></p>
            <p style={{ marginLeft: '1rem', color: '#666' }}>
              Utilisez le bouton "Tester la connexion" pour vérifier que les paramètres sont corrects
              et que le système peut accéder au répertoire distant.
            </p>
            
            <p style={{ marginTop: '1rem' }}><strong>3. Surveillance automatique</strong></p>
            <p style={{ marginLeft: '1rem', color: '#666' }}>
              Une fois la configuration active, le système vérifiera automatiquement le serveur SFTP
              à l'intervalle défini. Les fichiers XML seront importés et supprimés du serveur.
            </p>
            
            <p style={{ marginTop: '1rem' }}><strong>4. Notifications temps réel</strong></p>
            <p style={{ marginLeft: '1rem', color: '#666' }}>
              Les nouvelles interventions apparaîtront instantanément dans le module Interventions
              grâce aux WebSockets, sans besoin de rafraîchir la page.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ConfigurationSFTP;
