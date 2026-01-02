import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useToast } from '../hooks/use-toast';
import { useTenant } from '../contexts/TenantContext';
import { useAuth } from '../contexts/AuthContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = BACKEND_URL ? `${BACKEND_URL}/api` : '/api';

const ForgotPassword = ({ onBack }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const { tenantSlug } = useTenant();
  const { toast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await axios.post(`${API}/${tenantSlug}/auth/forgot-password`, {
        email
      });

      setEmailSent(true);
      toast({
        title: "Email envoyé",
        description: "Si cet email existe, vous recevrez un lien de réinitialisation.",
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Une erreur est survenue",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  if (emailSent) {
    return (
      <div className="login-container">
        <div className="login-box">
          <div className="login-header">
            <div className="logo">
              <div className="logo-flame">
                <div className="flame-container">
                  <i className="fas fa-fire flame-icon"></i>
                </div>
              </div>
              <h1>ProFireManager</h1>
              <p className="version">v2.0 Avancé</p>
            </div>
          </div>
          
          <Card className="login-card">
            <CardHeader>
              <CardTitle>Email envoyé ✅</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-center text-gray-600">
                Si cet email existe dans notre système, vous recevrez un lien de réinitialisation dans quelques instants.
              </p>
              <p className="text-center text-sm text-gray-500">
                Vérifiez votre boîte de réception et vos courriers indésirables.
              </p>
              <Button 
                onClick={onBack}
                className="w-full"
                variant="outline"
              >
                Retour à la connexion
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-header">
          <div className="logo">
            <div className="logo-flame">
              <div className="flame-container">
                <i className="fas fa-fire flame-icon"></i>
              </div>
            </div>
            <h1>ProFireManager</h1>
            <p className="version">v2.0 Avancé</p>
          </div>
        </div>
        
        <Card className="login-card">
          <CardHeader>
            <CardTitle>Mot de passe oublié</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="votre@email.com"
                  required
                />
                <p className="text-sm text-gray-500 mt-2">
                  Nous vous enverrons un lien pour réinitialiser votre mot de passe.
                </p>
              </div>
              <Button 
                type="submit" 
                className="w-full" 
                disabled={loading}
              >
                {loading ? 'Envoi en cours...' : 'Envoyer le lien'}
              </Button>
              <Button 
                type="button"
                onClick={onBack}
                className="w-full"
                variant="outline"
              >
                Retour à la connexion
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// ResetPassword Component
const ResetPassword = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [tokenValid, setTokenValid] = useState(null);
  const [email, setEmail] = useState('');
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  
  // Extraire le token de l'URL
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');

  useEffect(() => {
    // Vérifier la validité du token au chargement
    const verifyToken = async () => {
      if (!token) {
        setTokenValid(false);
        return;
      }

      try {
        const response = await axios.get(`${API}/${tenantSlug}/auth/verify-reset-token/${token}`);
        setTokenValid(true);
        setEmail(response.data.email);
      } catch (error) {
        setTokenValid(false);
        toast({
          title: "Token invalide",
          description: error.response?.data?.detail || "Ce lien est invalide ou a expiré",
          variant: "destructive"
        });
      }
    };

    verifyToken();
  }, [token, tenantSlug]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({
        title: "Erreur",
        description: "Les mots de passe ne correspondent pas",
        variant: "destructive"
      });
      return;
    }

    if (password.length < 8) {
      toast({
        title: "Erreur",
        description: "Le mot de passe doit contenir au moins 8 caractères",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);

    try {
      await axios.post(`${API}/${tenantSlug}/auth/reset-password`, {
        token,
        nouveau_mot_de_passe: password
      });

      setSuccess(true);
      toast({
        title: "Succès",
        description: "Votre mot de passe a été réinitialisé avec succès",
      });

      // Rediriger vers la page de connexion après 3 secondes
      setTimeout(() => {
        window.location.href = `/${tenantSlug}`;
      }, 3000);
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Une erreur est survenue",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  if (tokenValid === null) {
    return (
      <div className="login-container">
        <div className="login-box">
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div className="loading-spinner"></div>
            <p>Vérification du lien...</p>
          </div>
        </div>
      </div>
    );
  }

  if (tokenValid === false) {
    return (
      <div className="login-container">
        <div className="login-box">
          <div className="login-header">
            <div className="logo">
              <div className="logo-flame">
                <div className="flame-container">
                  <i className="fas fa-fire flame-icon"></i>
                </div>
              </div>
              <h1>ProFireManager</h1>
              <p className="version">v2.0 Avancé</p>
            </div>
          </div>
          
          <Card className="login-card">
            <CardHeader>
              <CardTitle>Lien invalide ❌</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-center text-gray-600">
                Ce lien de réinitialisation est invalide ou a expiré.
              </p>
              <Button 
                onClick={() => window.location.href = `/${tenantSlug}`}
                className="w-full"
              >
                Retour à la connexion
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="login-container">
        <div className="login-box">
          <div className="login-header">
            <div className="logo">
              <div className="logo-flame">
                <div className="flame-container">
                  <i className="fas fa-fire flame-icon"></i>
                </div>
              </div>
              <h1>ProFireManager</h1>
              <p className="version">v2.0 Avancé</p>
            </div>
          </div>
          
          <Card className="login-card">
            <CardHeader>
              <CardTitle>Mot de passe réinitialisé ✅</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-center text-gray-600">
                Votre mot de passe a été réinitialisé avec succès.
              </p>
              <p className="text-center text-sm text-gray-500">
                Vous allez être redirigé vers la page de connexion...
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-header">
          <div className="logo">
            <div className="logo-flame">
              <div className="flame-container">
                <i className="fas fa-fire flame-icon"></i>
              </div>
            </div>
            <h1>ProFireManager</h1>
            <p className="version">v2.0 Avancé</p>
          </div>
        </div>
        
        <Card className="login-card">
          <CardHeader>
            <CardTitle>Nouveau mot de passe</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-4">
                  Email: <strong>{email}</strong>
                </p>
              </div>
              <div>
                <Label htmlFor="password">Nouveau mot de passe</Label>
                <div style={{position: 'relative'}}>
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    style={{paddingRight: '40px'}}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '1.2rem'
                    }}
                  >
                    {showPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Minimum 8 caractères, 1 majuscule, 1 chiffre, 1 caractère spécial
                </p>
              </div>
              <div>
                <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              <Button 
                type="submit" 
                className="w-full" 
                disabled={loading}
              >
                {loading ? 'Réinitialisation...' : 'Réinitialiser le mot de passe'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// Login Component
const Login = () => {
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [personnalisation, setPersonnalisation] = useState(null);
  const [rememberMe, setRememberMe] = useState(true);
  const [autoLoginDone, setAutoLoginDone] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [debugInfo, setDebugInfo] = useState(null);
  const { login } = useAuth();
  const { toast } = useToast();
  const { tenantSlug } = useTenant();

  // Import des fonctions de stockage robuste (async)
  const storageModule = React.useRef(null);
  
  // Charger le module de stockage au montage
  useEffect(() => {
    import('../utils/storage').then(module => {
      storageModule.current = module;
      console.log('[Login] ✅ Module de stockage chargé');
    });
  }, []);

  // Charger les identifiants sauvegardés (SANS auto-login)
  // L'utilisateur devra cliquer sur "Se connecter" manuellement
  useEffect(() => {
    if (!tenantSlug || autoLoginDone) {
      if (!tenantSlug) setLoading(false);
      return;
    }
    
    const loadSavedCredentials = async () => {
      setAutoLoginDone(true);
      
      // Attendre que le module de stockage soit chargé
      let attempts = 0;
      while (!storageModule.current && attempts < 20) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
      }
      
      if (!storageModule.current) {
        console.log('[Login] ⚠️ Module de stockage non disponible, utilisation localStorage');
        // Fallback localStorage - seulement pré-remplir les champs
        try {
          const savedCreds = localStorage.getItem('profiremanager_saved_credentials');
          if (savedCreds) {
            const allCreds = JSON.parse(savedCreds);
            const tenantCreds = allCreds[tenantSlug];
            if (tenantCreds?.email && tenantCreds?.password) {
              setEmail(tenantCreds.email);
              setMotDePasse(tenantCreds.password);
              console.log('[Login] ✅ Identifiants pré-remplis (localStorage) - Cliquez sur Se connecter');
            }
          }
        } catch (e) {}
        setLoading(false);
        return;
      }
      
      // Utiliser le stockage robuste - seulement pré-remplir les champs, PAS d'auto-login
      const tenantCreds = await storageModule.current.getCredentials(tenantSlug);
      console.log('[Login] Vérification identifiants pour:', tenantSlug, '- Trouvé:', !!tenantCreds);
      
      if (tenantCreds && tenantCreds.email && tenantCreds.password) {
        // Pré-remplir les champs sans se connecter automatiquement
        setEmail(tenantCreds.email);
        setMotDePasse(tenantCreds.password);
        console.log('[Login] ✅ Identifiants pré-remplis - Cliquez sur Se connecter');
      }
      
      setLoading(false);
    };
    
    loadSavedCredentials();
  }, [tenantSlug]);
  
  // Fonction de debug pour afficher l'état du stockage
  const showStorageDebug = async () => {
    if (storageModule.current) {
      const info = await storageModule.current.getStorageDebugInfo();
      setDebugInfo(info);
      setShowDebugPanel(true);
    }
  }

  // Charger la personnalisation du tenant
  useEffect(() => {
    const loadPersonnalisation = async () => {
      try {
        const response = await axios.get(`${API}/${tenantSlug}/public/branding`);
        setPersonnalisation(response.data);
      } catch (error) {
        setPersonnalisation({
          logo_url: '',
          nom_service: '',
          afficher_profiremanager: true
        });
      }
    };

    if (tenantSlug) {
      loadPersonnalisation();
    }
  }, [tenantSlug]);

  if (showForgotPassword) {
    return <ForgotPassword onBack={() => setShowForgotPassword(false)} />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    const result = await login(email, motDePasse);
    
    if (result.success) {
      // Sauvegarder les identifiants si "Se souvenir" est coché
      if (rememberMe && storageModule.current) {
        await storageModule.current.saveCredentials(tenantSlug, email, motDePasse);
        toast({
          title: "✅ Identifiants sauvegardés",
          description: "Vos identifiants seront pré-remplis lors de votre prochaine visite"
        });
      }
    } else {
      toast({
        title: "Erreur de connexion",
        description: result.error,
        variant: "destructive"
      });
      setLoading(false);
    }
  };

  // Afficher un loader pendant la tentative d'auto-login
  if (loading && !email) {
    return (
      <div className="login-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔄</div>
          <p>Connexion en cours...</p>
          {/* Bouton debug caché - triple tap pour activer */}
          <div 
            onClick={() => setShowDebugPanel(!showDebugPanel)}
            style={{ marginTop: '2rem', opacity: 0.3, fontSize: '0.75rem' }}
          >
            🔧 Debug
          </div>
        </div>
      </div>
    );
  }

  // Panneau de debug pour iOS
  const DebugPanel = () => (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: '#1a1a2e',
      color: '#00ff00',
      padding: '1rem',
      maxHeight: '50vh',
      overflow: 'auto',
      fontSize: '0.75rem',
      fontFamily: 'monospace',
      zIndex: 9999
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <strong>🔧 Debug Storage</strong>
        <button onClick={() => setShowDebugPanel(false)} style={{ background: 'red', color: 'white', border: 'none', padding: '2px 8px' }}>X</button>
      </div>
      <button onClick={showStorageDebug} style={{ background: '#333', color: 'white', padding: '4px 8px', marginBottom: '0.5rem' }}>
        Refresh Debug Info
      </button>
      {debugInfo && (
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {JSON.stringify(debugInfo, null, 2)}
        </pre>
      )}
    </div>
  )

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-header">
          <div className="logo">
            {personnalisation?.logo_url ? (
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <img 
                  src={personnalisation.logo_url} 
                  alt="Logo du service" 
                  style={{ 
                    maxHeight: '150px', 
                    maxWidth: '100%', 
                    objectFit: 'contain',
                    marginBottom: '1rem',
                    display: 'block',
                    marginLeft: 'auto',
                    marginRight: 'auto'
                  }}
                />
                {personnalisation.nom_service && (
                  <h2 style={{ fontSize: '1.75rem', fontWeight: '700', color: 'white', margin: '0', textAlign: 'center' }}>
                    {personnalisation.nom_service}
                  </h2>
                )}
              </div>
            ) : (
              <>
                <div className="logo-flame">
                  <div className="flame-container">
                    <i className="fas fa-fire flame-icon"></i>
                  </div>
                </div>
                <h1>ProFireManager</h1>
                <p className="version">v2.0 Avancé</p>
              </>
            )}
          </div>
        </div>
        
        <Card className="login-card">
          <CardHeader>
            <CardTitle>Connexion</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="username email"
                  data-testid="login-email-input"
                />
              </div>
              <div>
                <Label htmlFor="password">Mot de passe</Label>
                <div style={{position: 'relative'}}>
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={motDePasse}
                    onChange={(e) => setMotDePasse(e.target.value)}
                    required
                    autoComplete="current-password"
                    data-testid="login-password-input"
                    style={{paddingRight: '40px'}}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '1.2rem'
                    }}
                  >
                    {showPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>
              {/* Option "Se souvenir de moi" sur mobile */}
              {/* Option "Se souvenir de moi" - toujours visible */}
              <div className="flex items-center gap-2" style={{ marginBottom: '1rem' }}>
                <input
                  type="checkbox"
                  id="rememberMe"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor="rememberMe" style={{ fontSize: '0.9rem', cursor: 'pointer' }}>
                  Se souvenir de moi sur cet appareil
                </label>
              </div>
              <Button 
                type="submit" 
                className="w-full" 
                disabled={loading}
                data-testid="login-submit-btn"
              >
                {loading ? 'Connexion...' : 'Se connecter'}
              </Button>
              <div className="text-center mt-4">
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#dc2626',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    textDecoration: 'underline'
                  }}
                >
                  Mot de passe oublié ?
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
        
        {/* Footer ProFireManager - Discret */}
        {personnalisation?.logo_url && (
          <div style={{ 
            marginTop: '2rem', 
            paddingTop: '1.5rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            opacity: 0.85
          }}>
            <div style={{
              width: '32px',
              height: '32px',
              background: 'rgba(255, 255, 255, 0.15)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <div className="logo-flame" style={{ transform: 'scale(0.6)' }}>
                <div className="flame-container">
                  <i className="fas fa-fire flame-icon"></i>
                </div>
              </div>
            </div>
            <span style={{ 
              fontSize: '0.75rem', 
              color: 'white',
              fontWeight: '500'
            }}>
              Propulsé par ProFireManager
            </span>
          </div>
        )}
        
        {/* Lien debug discret - visible seulement en tapant plusieurs fois */}
        <div 
          onClick={showStorageDebug}
          style={{ 
            marginTop: '1rem', 
            textAlign: 'center',
            opacity: 0.3,
            fontSize: '0.65rem',
            color: 'rgba(255,255,255,0.5)',
            cursor: 'pointer'
          }}
        >
          🔧
        </div>
      </div>
      
      {/* Panneau de debug */}
      {showDebugPanel && <DebugPanel />}
    </div>
  );
};


export { ForgotPassword, ResetPassword, Login };
export default Login;
