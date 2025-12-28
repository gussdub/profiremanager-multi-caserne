import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useToast } from "../hooks/use-toast";
import { useTenant } from "../contexts/TenantContext";
import { useAuth } from "../contexts/AuthContext";
import CameraCapture, { isIOS } from "./CameraCapture";

const MonProfil = () => {
  const { user, setUser, tenant } = useAuth();
  const { tenantSlug } = useTenant();
  const [userProfile, setUserProfile] = useState(null);
  const [formations, setFormations] = useState([]);
  const [competences, setCompetences] = useState([]);
  const [monthlyStats, setMonthlyStats] = useState({
    gardes_ce_mois: 0,
    heures_travaillees: 0,
    certifications: 0
  });
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingEPI, setIsEditingEPI] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordData, setPasswordData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: ''
  });
  const [profileData, setProfileData] = useState({});
  const [myEPIs, setMyEPIs] = useState([]);
  const [epiTailles, setEpiTailles] = useState({});
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = React.useRef(null);
  const photoLibraryRef = React.useRef(null);
  
  // États pour le crop d'image
  const [showCropModal, setShowCropModal] = useState(false);
  const [imageToCrop, setImageToCrop] = useState(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const cropContainerRef = React.useRef(null);
  const cropImageRef = React.useRef(null);
  
  // État pour la capture caméra iOS
  const [showCameraCapture, setShowCameraCapture] = useState(false);
  // État pour le menu de modification photo
  const [showPhotoMenu, setShowPhotoMenu] = useState(false);
  
  const { toast } = useToast();

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!tenantSlug || !user?.id) {
        return;
      }
      
      console.log('🔍 Mon Profil - Début chargement:', {
        tenantSlug,
        userId: user.id,
        token: localStorage.getItem('token') ? 'Présent' : 'Absent'
      });
      
      try {
        const [userData, competencesData, statsData, episData] = await Promise.all([
          apiGet(tenantSlug, `/users/${user.id}`),
          apiGet(tenantSlug, '/competences'),
          apiGet(tenantSlug, `/users/${user.id}/stats-mensuelles`),
          apiGet(tenantSlug, `/epi/employe/${user.id}`)
        ]);
        
        console.log('📊 Mon Profil - userData chargé:', userData);
        console.log('🔍 Champs critiques:', {
          numero_employe: userData?.numero_employe,
          taux_horaire: userData?.taux_horaire,
          grade: userData?.grade,
          date_embauche: userData?.date_embauche,
          adresse: userData?.adresse
        });
        
        setUserProfile(userData);
        setCompetences(competencesData || []);
        setMonthlyStats(statsData);
        setMyEPIs(episData);
        
        // Créer un objet de tailles pour l'édition
        const tailles = {};
        episData.forEach(epi => {
          tailles[epi.type_epi] = epi.taille;
        });
        setEpiTailles(tailles);
        
        setProfileData({
          nom: userData.nom,
          prenom: userData.prenom,
          email: userData.email,
          telephone: userData.telephone,
          adresse: userData.adresse || '',
          contact_urgence: userData.contact_urgence || '',
          numero_employe: userData.numero_employe || '',
          taux_horaire: userData.taux_horaire || 0,
          heures_max_semaine: userData.heures_max_semaine || 25
        });

      } catch (error) {
        console.error('❌ Mon Profil - Erreur chargement:', {
          error: error.message,
          stack: error.stack,
          tenantSlug,
          userId: user?.id
        });
      } finally {
        setLoading(false);
      }
    };

    if (user?.id) {
      fetchUserProfile();
    }
  }, [user?.id, tenantSlug]);

  // Gestion de l'upload de photo de profil - Ouvre le modal de crop
  const handlePhotoSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Vérifier le type de fichier
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Format non supporté",
        description: "Veuillez choisir une image JPG, PNG ou WEBP",
        variant: "destructive"
      });
      event.target.value = '';
      return;
    }

    // Lire l'image et ouvrir le modal de crop
    const reader = new FileReader();
    reader.onload = (e) => {
      // Charger l'image pour obtenir ses dimensions
      const img = new Image();
      img.onload = () => {
        setImageSize({ width: img.width, height: img.height });
        setImageToCrop(e.target.result);
        setShowCropModal(true);
        setCropPosition({ x: 0, y: 0 });
        setZoom(1);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  // Gestion du drag pour déplacer l'image
  const handleCropMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    setDragStart({ x: clientX - cropPosition.x, y: clientY - cropPosition.y });
  };

  const handleCropMouseMove = (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    const container = cropContainerRef.current;
    if (!container) return;
    
    const containerSize = container.offsetWidth;
    const scaledWidth = imageSize.width * zoom;
    const scaledHeight = imageSize.height * zoom;
    
    // Calculer les limites de déplacement
    const minX = containerSize - scaledWidth;
    const minY = containerSize - scaledHeight;
    
    let newX = clientX - dragStart.x;
    let newY = clientY - dragStart.y;
    
    // Contraindre le déplacement pour que l'image couvre toujours le cercle
    newX = Math.min(0, Math.max(minX, newX));
    newY = Math.min(0, Math.max(minY, newY));
    
    setCropPosition({ x: newX, y: newY });
  };

  const handleCropMouseUp = () => {
    setIsDragging(false);
  };

  // Fonction pour recadrer et uploader l'image
  const handleCropComplete = async () => {
    if (!imageToCrop) return;
    
    setPhotoUploading(true);
    
    try {
      const img = new Image();
      img.src = imageToCrop;
      
      await new Promise((resolve) => {
        if (img.complete) resolve();
        else img.onload = resolve;
      });
      
      const canvas = document.createElement('canvas');
      const outputSize = 400; // Taille de sortie
      canvas.width = outputSize;
      canvas.height = outputSize;
      const ctx = canvas.getContext('2d');
      
      // Calculer la zone de crop basée sur la position et le zoom
      const container = cropContainerRef.current;
      const containerSize = container ? container.offsetWidth : 300;
      
      // Ratio entre la taille affichée et la taille réelle
      const displayRatio = containerSize / (Math.min(imageSize.width, imageSize.height) * zoom);
      
      // Position du crop dans l'image originale
      const sourceX = -cropPosition.x / displayRatio / zoom;
      const sourceY = -cropPosition.y / displayRatio / zoom;
      const sourceSize = containerSize / displayRatio / zoom;
      
      // Dessiner l'image croppée
      ctx.drawImage(
        img,
        sourceX, sourceY, sourceSize, sourceSize,
        0, 0, outputSize, outputSize
      );
      
      // Convertir en base64 JPEG
      const base64 = canvas.toDataURL('image/jpeg', 0.9);
      
      const response = await apiPost(tenantSlug, '/users/photo-profil', {
        photo_base64: base64
      });
      
      // Mettre à jour le profil local
      setUserProfile(prev => ({...prev, photo_profil: response.photo_profil}));
      
      // Mettre à jour le user global (pour la sidebar)
      setUser(prev => ({...prev, photo_profil: response.photo_profil}));
      
      setShowCropModal(false);
      setImageToCrop(null);
      
      toast({
        title: "Photo mise à jour",
        description: "Votre photo de profil a été enregistrée",
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message || "Impossible de sauvegarder la photo",
        variant: "destructive"
      });
    } finally {
      setPhotoUploading(false);
    }
  };

  // Gestionnaire de capture depuis le composant CameraCapture (iOS)
  const handleCameraCapture = async (file) => {
    setShowCameraCapture(false);
    
    if (!file) return;
    
    // Lire le fichier capturé et ouvrir le modal de crop
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        setImageSize({ width: img.width, height: img.height });
        setImageToCrop(e.target.result);
        setShowCropModal(true);
        setCropPosition({ x: 0, y: 0 });
        setZoom(1);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  // Fonction pour ouvrir la capture photo (détection iOS automatique)
  const openPhotoCapture = () => {
    if (isIOS()) {
      // Sur iOS, utiliser le composant caméra personnalisé
      setShowCameraCapture(true);
    } else {
      // Sur les autres plateformes, utiliser l'input file classique
      photoInputRef.current?.click();
    }
  };

  // Ancienne fonction de compression (gardée pour compatibilité mais pas utilisée)
  const handlePhotoSelectOld = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Vérifier le type de fichier
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Format non supporté",
        description: "Veuillez choisir une image JPG, PNG ou WEBP",
        variant: "destructive"
      });
      return;
    }

    setPhotoUploading(true);

    try {
      // Fonction pour compresser l'image côté client
      const compressImage = (file, maxWidth = 400, quality = 0.8) => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              let width = img.width;
              let height = img.height;
              
              // Redimensionner si nécessaire
              if (width > maxWidth) {
                height = (height * maxWidth) / width;
                width = maxWidth;
              }
              
              canvas.width = width;
              canvas.height = height;
              
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, width, height);
              
              // Convertir en JPEG compressé
              const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
              resolve(compressedBase64);
            };
            img.onerror = reject;
            img.src = e.target.result;
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      };

      // Compresser si > 500KB, sinon utiliser directement
      let base64;
      if (file.size > 500 * 1024) {
        toast({
          title: "Compression en cours...",
          description: "L'image est optimisée automatiquement",
        });
        base64 = await compressImage(file, 400, 0.85);
      } else {
        base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }
      
      const response = await apiPost(tenantSlug, '/users/photo-profil', {
        photo_base64: base64
      });
      
      // Mettre à jour le profil local
      setUserProfile(prev => ({...prev, photo_profil: response.photo_profil}));
      
      // Mettre à jour le user global (pour la sidebar)
      setUser(prev => ({...prev, photo_profil: response.photo_profil}));
      
      toast({
        title: "Photo mise à jour",
        description: "Votre photo de profil a été enregistrée",
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message || "Impossible de sauvegarder la photo",
        variant: "destructive"
      });
    } finally {
      setPhotoUploading(false);
    }
    
    // Reset l'input pour permettre de re-sélectionner le même fichier
    event.target.value = '';
  };

  const handleDeletePhoto = async () => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer votre photo de profil ?')) {
      return;
    }

    try {
      await apiDelete(tenantSlug, '/users/photo-profil');
      setUserProfile(prev => ({...prev, photo_profil: null}));
      // Mettre à jour le user global (pour la sidebar)
      setUser(prev => ({...prev, photo_profil: null}));
      toast({
        title: "Photo supprimée",
        description: "Votre photo de profil a été supprimée",
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de supprimer la photo",
        variant: "destructive"
      });
    }
  };

  const handleSaveProfile = async () => {
    try {
      // Valider heures_max_semaine avant sauvegarde
      let heuresMax = profileData.heures_max_semaine;
      if (heuresMax === '' || heuresMax === null || heuresMax === undefined) {
        heuresMax = 25;
      } else {
        heuresMax = parseInt(heuresMax);
        if (heuresMax < 5) heuresMax = 5;
        if (heuresMax > 168) heuresMax = 168;
      }

      // Utiliser l'endpoint spécial pour modification de son propre profil
      const updateData = {
        prenom: profileData.prenom,
        nom: profileData.nom,
        email: profileData.email,
        telephone: profileData.telephone,
        adresse: profileData.adresse,
        contact_urgence: profileData.contact_urgence,
        heures_max_semaine: heuresMax
      };

      const updatedData = await apiPut(tenantSlug, '/users/mon-profil', updateData);
      
      // Mettre à jour le profil local avec la réponse
      setUserProfile(updatedData);
      
      // Mettre à jour aussi profileData pour que les champs affichent les bonnes valeurs
      setProfileData({
        nom: updatedData.nom,
        prenom: updatedData.prenom,
        email: updatedData.email,
        telephone: updatedData.telephone,
        adresse: updatedData.adresse || '',
        contact_urgence: updatedData.contact_urgence || '',
        heures_max_semaine: updatedData.heures_max_semaine || 25
      });
      
      toast({
        title: "Profil mis à jour",
        description: "Vos informations ont été sauvegardées et sont maintenant visibles dans Personnel.",
        variant: "success"
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Erreur sauvegarde profil:', error);
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Impossible de sauvegarder les modifications.",
        variant: "destructive"
      });
    }
  };

  const handleSaveEPITailles = async () => {
    try {
      console.log('💾 [Mon Profil] Début sauvegarde tailles EPI');
      console.log('📋 [Mon Profil] Tailles actuelles:', epiTailles);
      console.log('📦 [Mon Profil] EPIs existants:', myEPIs);
      
      const allEPITypes = getAllEPITypes();
      const updatePromises = [];
      const createPromises = [];
      
      // Pour chaque type d'EPI
      for (const epiType of allEPITypes) {
        const taille = epiTailles[epiType.id];
        const existingEPI = myEPIs.find(e => e.type_epi === epiType.id);
        
        console.log(`🔍 [${epiType.nom}] Taille: ${taille}, EPI existant:`, existingEPI ? `Oui (${existingEPI.taille})` : 'Non');
        
        // Si une taille est saisie
        if (taille && taille.trim() !== '') {
          if (existingEPI) {
            // Mettre à jour l'EPI existant si la taille a changé
            if (taille !== existingEPI.taille) {
              console.log(`✏️ [${epiType.nom}] Mise à jour: ${existingEPI.taille} → ${taille}`);
              updatePromises.push(
                apiPut(tenantSlug, `/epi/${existingEPI.id}`, {
                  taille: taille
                }).catch(err => {
                  console.error(`❌ Erreur PUT /epi/${existingEPI.id}:`, err);
                  throw err;
                })
              );
            } else {
              console.log(`⏭️ [${epiType.nom}] Aucun changement, skip`);
            }
          } else {
            // Créer un nouvel EPI
            console.log(`➕ [${epiType.nom}] Création nouvel EPI avec taille: ${taille}`);
            createPromises.push(
              apiPost(tenantSlug, '/epi', {
                user_id: user.id,
                type_epi: epiType.id,
                taille: taille,
                numero_serie: `${epiType.id.toUpperCase()}-${user.id.substring(0, 8)}`,
                marque: 'N/A',
                modele: 'N/A',
                date_mise_en_service: new Date().toISOString().split('T')[0],
                statut: 'En service',
                notes: 'Taille déclarée par l\'employé'
              }).catch(err => {
                console.error(`❌ Erreur POST /epi:`, err);
                throw err;
              })
            );
          }
        }
      }

      console.log(`📊 [Mon Profil] ${updatePromises.length} mise(s) à jour, ${createPromises.length} création(s)`);
      
      // Exécuter toutes les mises à jour et créations
      await Promise.all([...updatePromises, ...createPromises]);

      // Recharger les EPI
      const episData = await apiGet(tenantSlug, `/epi/employe/${user.id}`);
      setMyEPIs(episData);
      
      // Mettre à jour l'objet de tailles
      const tailles = {};
      episData.forEach(epi => {
        tailles[epi.type_epi] = epi.taille;
      });
      setEpiTailles(tailles);

      toast({
        title: "Tailles mises à jour",
        description: "Vos tailles d'EPI ont été sauvegardées et sont maintenant visibles dans le module Personnel",
        variant: "success"
      });

      setIsEditingEPI(false);
    } catch (error) {
      console.error('Erreur sauvegarde EPI:', error);
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Impossible de sauvegarder les tailles",
        variant: "destructive"
      });
    }
  };

  const getEPINom = (typeEpi) => {
    const noms = {
      'casque': 'Casque',
      'bottes': 'Bottes',
      'veste_bunker': 'Veste Bunker',
      'pantalon_bunker': 'Pantalon Bunker',
      'gants': 'Gants',
      'masque_apria': 'Facial APRIA',
      'cagoule': 'Cagoule Anti-Particules'
    };
    return noms[typeEpi] || typeEpi;
  };

  const getAllEPITypes = () => {
    return [
      { id: 'casque', nom: 'Casque', icone: '🪖' },
      { id: 'bottes', nom: 'Bottes', icone: '👢' },
      { id: 'veste_bunker', nom: 'Veste Bunker', icone: '🧥' },
      { id: 'pantalon_bunker', nom: 'Pantalon Bunker', icone: '👖' },
      { id: 'gants', nom: 'Gants', icone: '🧤' },
      { id: 'masque_apria', nom: 'Facial APRIA', icone: '😷' },
      { id: 'cagoule', nom: 'Cagoule Anti-Particules', icone: '🎭' }
    ];
  };
  const getEPIIcone = (typeEpi) => {
    const icones = {
      'casque': '🪖',
      'bottes': '👢',
      'veste_bunker': '🧥',
      'pantalon_bunker': '👖',
      'gants': '🧤',
      'masque_apria': '😷',
      'cagoule': '🎭'
    };
    return icones[typeEpi] || '🛡️';
  };

  const handleChangePassword = async () => {
    if (!passwordData.current_password || !passwordData.new_password || !passwordData.confirm_password) {
      toast({
        title: "Champs requis",
        description: "Veuillez remplir tous les champs",
        variant: "destructive"
      });
      return;
    }

    if (passwordData.new_password !== passwordData.confirm_password) {
      toast({
        title: "Mots de passe différents",
        description: "Le nouveau mot de passe et la confirmation ne correspondent pas",
        variant: "destructive"
      });
      return;
    }

    try {
      // Appeler l'API backend pour changer le mot de passe
      await axios.put(`${API}/${tenantSlug}/users/${user.id}/password`, {
        current_password: passwordData.current_password,
        new_password: passwordData.new_password
      });
      
      toast({
        title: "Mot de passe modifié",
        description: "Votre mot de passe a été mis à jour avec succès",
        variant: "success"
      });
      setShowPasswordModal(false);
      setPasswordData({ current_password: '', new_password: '', confirm_password: '' });
    } catch (error) {
      const errorMessage = error.response?.data?.detail || "Impossible de modifier le mot de passe";
      toast({
        title: "Erreur",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  const getFormationName = (formationId) => {
    const formation = formations.find(f => f.id === formationId);
    return formation ? formation.nom : formationId;
  };

  const getCompetenceName = (competenceId) => {
    const competence = competences.find(c => c.id === competenceId);
    if (competence) return competence.nom;
    // Fallback pour compétences obsolètes/supprimées
    return "⚠️ Compétence obsolète";
  };

  if (loading) return <div className="loading" data-testid="profile-loading">Chargement du profil...</div>;
  
  // Debug : Vérifier si user est chargé
  if (!user || !user.id) {
    return (
      <div className="mon-profil">
        <div className="profile-header">
          <h1>Erreur</h1>
          <p style={{color: 'red'}}>
            ❌ Impossible de charger le profil utilisateur. user.id manquant.
            <br/>
            Debug: user = {JSON.stringify(user)}
            <br/>
            tenantSlug = {tenantSlug}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="module-epi-nfpa">
      <div className="module-header">
        <div>
          <h1>👤 Mon Profil</h1>
          <p>Gérez vos informations personnelles et paramètres de compte</p>
        </div>
      </div>

      {/* Layout en 2 colonnes */}
      <div className="profil-grid-layout">
        {/* Colonne gauche - Informations principales */}
        <div className="profil-main-column">
          
          {/* Section Photo de Profil */}
          <div className="formation-card" style={{ marginBottom: '1.5rem' }}>
            <div className="formation-header">
              <h3>📷 Photo de profil</h3>
            </div>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '1.5rem',
              padding: '1rem',
              flexWrap: 'wrap'
            }}>
              {/* Photo preview */}
              <div style={{
                width: '120px',
                height: '120px',
                borderRadius: '50%',
                overflow: 'hidden',
                background: '#f3f4f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '3px solid #e5e7eb',
                flexShrink: 0
              }}>
                {userProfile?.photo_profil ? (
                  <img 
                    src={userProfile.photo_profil} 
                    alt="Photo de profil"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{ 
                    fontSize: '3rem', 
                    color: '#9ca3af',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    👤
                  </div>
                )}
              </div>
              
              {/* Boutons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <input
                  type="file"
                  ref={photoInputRef}
                  onChange={handlePhotoSelect}
                  accept="image/jpeg,image/png,image/webp"
                  
                  style={{ 
                    position: 'absolute',
                    width: '1px',
                    height: '1px',
                    padding: '0',
                    margin: '-1px',
                    overflow: 'hidden',
                    clip: 'rect(0, 0, 0, 0)',
                    whiteSpace: 'nowrap',
                    border: '0'
                  }}
                />
                <Button
                  onClick={openPhotoCapture}
                  disabled={photoUploading}
                  style={{ minWidth: '160px' }}
                >
                  {photoUploading ? '⏳ Téléversement...' : '📷 Prendre une photo'}
                </Button>
                {userProfile?.photo_profil && (
                  <Button
                    variant="outline"
                    onClick={handleDeletePhoto}
                    style={{ minWidth: '160px', color: '#ef4444' }}
                  >
                    🗑️ Supprimer
                  </Button>
                )}
                <p style={{ 
                  fontSize: '0.75rem', 
                  color: '#6b7280',
                  margin: '0.5rem 0 0 0'
                }}>
                  JPG, PNG ou WEBP • Recadrage disponible
                </p>
              </div>
            </div>
          </div>

          {/* Modal de recadrage d'image avec drag-and-drop */}
          {showCropModal && imageToCrop && (
            <div 
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.85)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999,
                padding: '20px'
              }}
              onMouseUp={handleCropMouseUp}
              onMouseLeave={handleCropMouseUp}
              onTouchEnd={handleCropMouseUp}
            >
              <div 
                style={{
                  background: 'white',
                  borderRadius: '16px',
                  padding: '24px',
                  width: '100%',
                  maxWidth: '450px',
                  maxHeight: '90vh',
                  overflow: 'auto'
                }}
              >
                <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>
                  ✂️ Recadrer votre photo
                </h3>
                <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
                  Glissez l&apos;image pour la positionner dans le cercle
                </p>
                
                {/* Zone de crop avec drag */}
                <div 
                  ref={cropContainerRef}
                  style={{ 
                    position: 'relative',
                    width: '100%',
                    aspectRatio: '1',
                    background: '#1f2937',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    marginBottom: '16px',
                    cursor: isDragging ? 'grabbing' : 'grab',
                    touchAction: 'none'
                  }}
                  onMouseDown={handleCropMouseDown}
                  onMouseMove={handleCropMouseMove}
                  onTouchStart={handleCropMouseDown}
                  onTouchMove={handleCropMouseMove}
                >
                  <img
                    ref={cropImageRef}
                    src={imageToCrop}
                    alt="À recadrer"
                    draggable={false}
                    style={{
                      position: 'absolute',
                      width: imageSize.width > imageSize.height 
                        ? `${(imageSize.width / imageSize.height) * 100 * zoom}%` 
                        : `${100 * zoom}%`,
                      height: imageSize.height > imageSize.width 
                        ? `${(imageSize.height / imageSize.width) * 100 * zoom}%` 
                        : `${100 * zoom}%`,
                      minWidth: `${100 * zoom}%`,
                      minHeight: `${100 * zoom}%`,
                      objectFit: 'cover',
                      left: cropPosition.x,
                      top: cropPosition.y,
                      pointerEvents: 'none',
                      userSelect: 'none'
                    }}
                  />
                  {/* Overlay avec cercle transparent au centre */}
                  <svg 
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                  >
                    <defs>
                      <mask id="cropMask">
                        <rect x="0" y="0" width="100" height="100" fill="white"/>
                        <circle cx="50" cy="50" r="48" fill="black"/>
                      </mask>
                    </defs>
                    <rect x="0" y="0" width="100" height="100" fill="rgba(0,0,0,0.6)" mask="url(#cropMask)"/>
                    <circle cx="50" cy="50" r="48" fill="none" stroke="white" strokeWidth="0.5" strokeDasharray="2,2"/>
                  </svg>
                </div>
                
                {/* Contrôle de zoom */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '20px' }}>🔍</span>
                    <input
                      type="range"
                      min="1"
                      max="3"
                      step="0.05"
                      value={zoom}
                      onChange={(e) => {
                        const newZoom = parseFloat(e.target.value);
                        setZoom(newZoom);
                        // Recentrer après zoom
                        setCropPosition({ x: 0, y: 0 });
                      }}
                      style={{ flex: 1, height: '8px' }}
                    />
                    <span style={{ fontSize: '14px', color: '#6b7280', minWidth: '50px' }}>
                      {Math.round(zoom * 100)}%
                    </span>
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowCropModal(false);
                      setImageToCrop(null);
                    }}
                  >
                    Annuler
                  </Button>
                  <Button
                    onClick={handleCropComplete}
                    disabled={photoUploading}
                    style={{ background: '#10B981', color: 'white' }}
                  >
                    {photoUploading ? '⏳ Enregistrement...' : '✅ Valider'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Informations personnelles */}
          <div className="formation-card">
            <div className="formation-header">
              <h3>📋 Informations personnelles</h3>
              <Button
                onClick={() => setIsEditing(!isEditing)}
                variant={isEditing ? "outline" : "default"}
                data-testid="edit-profile-btn"
              >
                {isEditing ? 'Annuler' : '✏️ Modifier'}
              </Button>
            </div>

            <div className="profile-form">
              <div className="form-row">
                <div className="form-field">
                  <Label>Prénom</Label>
                  <Input
                    value={profileData.prenom || ''}
                    onChange={(e) => setProfileData({...profileData, prenom: e.target.value})}
                    disabled={!isEditing}
                    data-testid="profile-prenom-input"
                  />
                </div>
                <div className="form-field">
                  <Label>Nom</Label>
                  <Input
                    value={profileData.nom || ''}
                    onChange={(e) => setProfileData({...profileData, nom: e.target.value})}
                    disabled={!isEditing}
                    data-testid="profile-nom-input"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-field">
                  <Label>Email</Label>
                  <Input
                    value={profileData.email || ''}
                    onChange={(e) => setProfileData({...profileData, email: e.target.value})}
                    disabled={!isEditing}
                    data-testid="profile-email-input"
                  />
                </div>
                <div className="form-field">
                  <Label>Téléphone</Label>
                  <Input
                    value={profileData.telephone || ''}
                    onChange={(e) => setProfileData({...profileData, telephone: e.target.value})}
                    disabled={!isEditing}
                    data-testid="profile-phone-input"
                  />
                </div>
              </div>

              <div className="form-field">
                <Label>Adresse</Label>
                <Input
                  value={profileData.adresse || ''}
                  onChange={(e) => setProfileData({...profileData, adresse: e.target.value})}
                  disabled={!isEditing}
                  placeholder="123 Rue Principale, Ville, Province"
                  data-testid="profile-address-input"
                />
              </div>

              <div className="form-field">
                <Label>Contact d'urgence</Label>
                <Input
                  value={profileData.contact_urgence || ''}
                  onChange={(e) => setProfileData({...profileData, contact_urgence: e.target.value})}
                  disabled={!isEditing}
                  placeholder="Nom et téléphone du contact d'urgence"
                  data-testid="profile-emergency-input"
                />
              </div>

              {/* Heures maximum par semaine - Visible pour tous, modifiable pour temps partiel uniquement */}
              <div className="form-field">
                <Label>Heures maximum par semaine</Label>
                <div className="heures-max-input">
                  <Input
                    type="number"
                    min="5"
                    max="168"
                    value={profileData.heures_max_semaine !== null && profileData.heures_max_semaine !== undefined 
                      ? profileData.heures_max_semaine 
                      : (userProfile?.heures_max_semaine || 40)}
                    onChange={(e) => {
                      const value = e.target.value;
                      // Permettre champ vide ou nombre valide
                      if (value === '') {
                        setProfileData({...profileData, heures_max_semaine: ''});
                      } else {
                        const numValue = parseInt(value);
                        // Accepter toute valeur pendant la saisie pour permettre l'effacement
                        setProfileData({...profileData, heures_max_semaine: numValue});
                      }
                    }}
                    onBlur={(e) => {
                      // Valider à la sortie du champ
                      const value = e.target.value;
                      if (value === '' || value < 5) {
                        setProfileData({...profileData, heures_max_semaine: 5});
                      } else if (value > 168) {
                        setProfileData({...profileData, heures_max_semaine: 168});
                      }
                    }}
                    disabled={!isEditing || userProfile?.type_emploi === 'temps_plein'}
                    data-testid="profile-heures-max-input"
                  />
                  <span className="heures-max-unit">heures/semaine</span>
                </div>
                <small className="heures-max-help">
                  {userProfile?.type_emploi === 'temps_partiel' 
                    ? "Indiquez le nombre maximum d'heures que vous souhaitez travailler par semaine (5-168h)."
                    : "Limite d'heures hebdomadaires configurée par l'administrateur."}
                </small>
              </div>

              {isEditing && (
                <div className="form-actions">
                  <Button onClick={handleSaveProfile} data-testid="save-profile-btn">
                    💾 Sauvegarder les modifications
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Mes Tailles EPI */}
          <div className="formation-card">
            <div className="formation-header">
              <h3>🛡️ Mes Tailles EPI</h3>
              <Button
                onClick={() => {
                  console.log('🔘 [Mon Profil EPI] Bouton Modifier cliqué, isEditingEPI avant:', isEditingEPI);
                  setIsEditingEPI(!isEditingEPI);
                  console.log('🔘 [Mon Profil EPI] isEditingEPI après:', !isEditingEPI);
                }}
                variant={isEditingEPI ? "outline" : "default"}
                data-testid="edit-epi-tailles-btn"
              >
                {isEditingEPI ? 'Annuler' : '✏️ Modifier'}
              </Button>
            </div>

            <div className="epi-content-wrapper">
              <p style={{ marginBottom: '15px', fontSize: '14px', color: '#6B7280' }}>
                {isEditingEPI 
                  ? '✏️ Mode édition activé - Vous pouvez maintenant modifier les tailles' 
                  : '👉 Cliquez sur "Modifier" pour éditer vos tailles d\'EPI'}
              </p>

              <div className="epi-tailles-grid-profile">
                {getAllEPITypes().map(epiType => {
                  const existingEPI = myEPIs.find(e => e.type_epi === epiType.id);
                  const isDisabled = !isEditingEPI;
                  // Utiliser ?? au lieu de || pour permettre les chaînes vides
                  const currentValue = epiTailles[epiType.id] ?? (existingEPI ? existingEPI.taille : '');
                  
                  console.log(`[${epiType.nom}] disabled=${isDisabled}, value="${currentValue}", epiTailles[${epiType.id}]="${epiTailles[epiType.id]}"`);
                  
                  return (
                    <div key={epiType.id} className="epi-taille-item-profile">
                      <span className="epi-taille-icon-profile">{epiType.icone}</span>
                      <div className="epi-taille-info-profile">
                        <Label style={{fontSize: '13px'}}>{epiType.nom}</Label>
                        <Input
                          value={currentValue}
                          onChange={(e) => {
                            const newValue = e.target.value;
                            console.log(`✏️ [${epiType.nom}] onChange: "${currentValue}" → "${newValue}"`);
                            setEpiTailles({...epiTailles, [epiType.id]: newValue});
                          }}
                          disabled={isDisabled}
                          placeholder="Taille"
                          className="epi-taille-input-compact"
                          data-testid={`epi-taille-${epiType.id}`}
                          style={isDisabled ? {cursor: 'not-allowed', opacity: 0.6} : {}}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {isEditingEPI && (
                <div className="form-actions" style={{marginTop: '15px'}}>
                  <Button onClick={handleSaveEPITailles} data-testid="save-epi-tailles-btn">
                    💾 Sauvegarder les tailles
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Colonne droite - Infos complémentaires */}
        <div className="profil-side-column">
          {/* Informations d'emploi */}
          <div className="formation-card">
            <div className="formation-header">
              <h3>💼 Emploi</h3>
              <span className="statut-badge planifiee" style={{fontSize: '12px', background: '#FEE2E2', color: '#991B1B'}}>
                🔒 Verrouillé
              </span>
            </div>
            <div style={{padding: '1rem 1.5rem'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid #F3F4F6', gap: '1rem'}}>
                <span style={{fontSize: '0.813rem', fontWeight: '500', color: '#6B7280'}}>N° Employé</span>
                <span style={{fontSize: '0.875rem', fontWeight: '600', color: '#1F2937', textAlign: 'right'}} data-testid="profile-employee-id">{userProfile?.numero_employe}</span>
              </div>
              <div style={{display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid #F3F4F6', gap: '1rem'}}>
                <span style={{fontSize: '0.813rem', fontWeight: '500', color: '#6B7280'}}>Grade</span>
                <span style={{fontSize: '0.875rem', fontWeight: '600', color: '#1F2937', textAlign: 'right'}} data-testid="profile-grade">
                  {userProfile?.grade}
                  {userProfile?.fonction_superieur && <span style={{fontSize: '0.75rem', color: '#EF4444', marginLeft: '0.5rem'}}> + Fonction sup.</span>}
                </span>
              </div>
              <div style={{display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid #F3F4F6', gap: '1rem'}}>
                <span style={{fontSize: '0.813rem', fontWeight: '500', color: '#6B7280'}}>Type</span>
                <span style={{fontSize: '0.875rem', fontWeight: '600', color: '#1F2937', textAlign: 'right'}} data-testid="profile-employment-type">
                  {userProfile?.type_emploi === 'temps_plein' ? 'Temps plein' : 'Temps partiel'}
                </span>
              </div>
              <div style={{display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid #F3F4F6', gap: '1rem'}}>
                <span style={{fontSize: '0.813rem', fontWeight: '500', color: '#6B7280'}}>Embauche</span>
                <span style={{fontSize: '0.875rem', fontWeight: '600', color: '#1F2937', textAlign: 'right'}} data-testid="profile-hire-date">{userProfile?.date_embauche}</span>
              </div>
              <div style={{display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', gap: '1rem'}}>
                <span style={{fontSize: '0.813rem', fontWeight: '500', color: '#6B7280'}}>Taux horaire</span>
                <span style={{fontSize: '0.875rem', fontWeight: '600', color: '#1F2937', textAlign: 'right'}} data-testid="profile-taux-horaire">
                  {userProfile?.taux_horaire ? `${userProfile.taux_horaire.toFixed(2)} $/h` : 'Non défini'}
                </span>
              </div>
            </div>
          </div>

          {/* Formations et compétences */}
          <div className="formation-card">
            <div className="formation-header">
              <h3>📚 Compétences</h3>
              <span className="statut-badge planifiee" style={{fontSize: '11px', background: '#FEE2E2', color: '#991B1B'}}>
                {userProfile?.competences?.length || 0}
              </span>
            </div>
            <div style={{padding: '0.75rem 1.5rem'}}>
              {userProfile?.competences?.length > 0 ? (
                <div style={{display: 'flex', flexWrap: 'wrap', gap: '0.5rem'}}>
                  {userProfile.competences.map((competenceId, index) => (
                    <span key={index} className="formation-badge-compact">
                      {getCompetenceName(competenceId)} ✅
                    </span>
                  ))}
                </div>
              ) : (
                <p style={{textAlign: 'center', color: '#9CA3AF', fontSize: '14px', margin: 0}}>
                  Aucune compétence
                </p>
              )}
            </div>
          </div>

          {/* Sécurité du compte */}
          <div className="formation-card">
            <div className="formation-header">
              <h3>🔒 Sécurité</h3>
            </div>
            <div style={{padding: '1rem'}}>
              <Button 
                variant="outline" 
                onClick={() => setShowPasswordModal(true)}
                data-testid="change-password-btn"
                style={{width: '100%'}}
              >
                🔑 Changer le mot de passe
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de changement de mot de passe */}
      {showPasswordModal && (
        <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} data-testid="change-password-modal">
            <div className="modal-header">
              <h3>🔒 Changer le mot de passe</h3>
              <Button variant="ghost" onClick={() => setShowPasswordModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="password-form">
                <div className="form-field">
                  <Label>Mot de passe actuel *</Label>
                  <Input
                    type="password"
                    value={passwordData.current_password}
                    onChange={(e) => setPasswordData({...passwordData, current_password: e.target.value})}
                    data-testid="current-password-input"
                  />
                </div>

                <div className="form-field">
                  <Label>Nouveau mot de passe *</Label>
                  <Input
                    type="password"
                    value={passwordData.new_password}
                    onChange={(e) => setPasswordData({...passwordData, new_password: e.target.value})}
                    data-testid="new-password-input"
                  />
                </div>

                <div className="form-field">
                  <Label>Confirmer le nouveau mot de passe *</Label>
                  <Input
                    type="password"
                    value={passwordData.confirm_password}
                    onChange={(e) => setPasswordData({...passwordData, confirm_password: e.target.value})}
                    data-testid="confirm-password-input"
                  />
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <div className="modal-actions">
                <Button variant="outline" onClick={() => setShowPasswordModal(false)}>
                  Annuler
                </Button>
                <Button variant="default" onClick={handleChangePassword} data-testid="save-password-btn">
                  Modifier le mot de passe
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de capture caméra iOS */}
      {showCameraCapture && (
        <CameraCapture
          onCapture={handleCameraCapture}
          onClose={() => setShowCameraCapture(false)}
          maxWidth={800}
          quality={0.9}
          facingMode="user"
        />
      )}
    </div>
  );
};

export default MonProfil;
