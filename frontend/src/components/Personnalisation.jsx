import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { apiGet, apiPut, apiPost } from '../utils/api';
import { useToast } from '../hooks/use-toast';

const Personnalisation = ({ tenantSlug }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [personnalisation, setPersonnalisation] = useState({
    logo_url: '',
    nom_service: '',
    afficher_profiremanager: true
  });
  const [previewLogo, setPreviewLogo] = useState('');

  useEffect(() => {
    loadPersonnalisation();
  }, [tenantSlug]);

  const loadPersonnalisation = async () => {
    try {
      setLoading(true);
      const data = await apiGet(tenantSlug, '/personnalisation');
      setPersonnalisation(data);
      setPreviewLogo(data.logo_url);
    } catch (error) {
      console.error('Erreur chargement personnalisation:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les paramètres",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Vérifier la taille (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "Erreur",
        description: "Le fichier est trop volumineux (max 2MB)",
        variant: "destructive"
      });
      return;
    }

    // Vérifier le type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Erreur",
        description: "Le fichier doit être une image",
        variant: "destructive"
      });
      return;
    }

    // Lire et convertir en base64
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target.result;
      setPreviewLogo(base64);

      try {
        setSaving(true);
        await apiPost(tenantSlug, '/personnalisation/upload-logo', {
          logo_base64: base64
        });

        setPersonnalisation(prev => ({ ...prev, logo_url: base64 }));

        toast({
          title: "Succès",
          description: "Logo uploadé avec succès"
        });
      } catch (error) {
        console.error('Erreur upload logo:', error);
        toast({
          title: "Erreur",
          description: "Impossible d'uploader le logo",
          variant: "destructive"
        });
      } finally {
        setSaving(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await apiPut(tenantSlug, '/personnalisation', personnalisation);

      toast({
        title: "Succès",
        description: "Paramètres enregistrés avec succès"
      });

      // Recharger la page pour appliquer les changements dans le header
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error('Erreur sauvegarde:', error);
      toast({
        title: "Erreur",
        description: "Impossible d'enregistrer les paramètres",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveLogo = async () => {
    try {
      setSaving(true);
      await apiPut(tenantSlug, '/personnalisation', {
        logo_url: ''
      });

      setPersonnalisation(prev => ({ ...prev, logo_url: '' }));
      setPreviewLogo('');

      toast({
        title: "Succès",
        description: "Logo supprimé"
      });
    } catch (error) {
      console.error('Erreur suppression logo:', error);
      toast({
        title: "Erreur",
        description: "Impossible de supprimer le logo",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div className="spinner">Chargement...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '0.5rem' }}>
          🎨 Personnalisation
        </h2>
        <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
          Personnalisez l'apparence de l'application avec votre logo et le nom de votre service
        </p>
      </div>

      {/* Section Logo */}
      <div style={{
        backgroundColor: 'white',
        border: '2px solid #e5e7eb',
        borderRadius: '12px',
        padding: '1.5rem',
        marginBottom: '1.5rem'
      }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem' }}>
          Logo du Service
        </h3>

        <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
          {/* Preview */}
          <div style={{
            width: '200px',
            height: '200px',
            border: '2px dashed #d1d5db',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#f9fafb',
            flexShrink: 0
          }}>
            {previewLogo ? (
              <img
                src={previewLogo}
                alt="Logo du service"
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain'
                }}
              />
            ) : (
              <div style={{ textAlign: 'center', color: '#9ca3af' }}>
                <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🏢</div>
                <div style={{ fontSize: '0.875rem' }}>Aucun logo</div>
              </div>
            )}
          </div>

          {/* Upload Controls */}
          <div style={{ flex: 1 }}>
            <label style={{
              fontWeight: '500',
              fontSize: '0.875rem',
              marginBottom: '0.5rem',
              display: 'block'
            }}>
              Charger un logo
            </label>
            <p style={{
              fontSize: '0.875rem',
              color: '#6b7280',
              marginBottom: '1rem'
            }}>
              Format recommandé: PNG ou JPG, dimensions carrées (minimum 200x200px), max 2MB
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <Button
                onClick={() => document.getElementById('logo-upload').click()}
                disabled={saving}
              >
                📁 Choisir un fichier
              </Button>
              <input
                id="logo-upload"
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                style={{ display: 'none' }}
              />

              {previewLogo && (
                <Button
                  variant="outline"
                  onClick={handleRemoveLogo}
                  disabled={saving}
                >
                  🗑️ Supprimer
                </Button>
              )}
            </div>

            <div style={{
              marginTop: '1rem',
              padding: '0.75rem',
              backgroundColor: '#f0f9ff',
              border: '1px solid #bae6fd',
              borderRadius: '6px',
              fontSize: '0.75rem',
              color: '#0369a1'
            }}>
              ℹ️ Le logo s'affichera dans le header de l'application et sur tous les documents PDF exportés
            </div>
          </div>
        </div>
      </div>

      {/* Section Nom du Service */}
      <div style={{
        backgroundColor: 'white',
        border: '2px solid #e5e7eb',
        borderRadius: '12px',
        padding: '1.5rem',
        marginBottom: '1.5rem'
      }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem' }}>
          Nom du Service
        </h3>

        <div>
          <label style={{
            fontWeight: '500',
            fontSize: '0.875rem',
            marginBottom: '0.5rem',
            display: 'block'
          }}>
            Nom complet du service d'incendie
          </label>
          <input
            type="text"
            value={personnalisation.nom_service}
            onChange={(e) => setPersonnalisation(prev => ({
              ...prev,
              nom_service: e.target.value
            }))}
            placeholder="Ex: Service Incendie de Ville-X"
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '2px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '1rem'
            }}
          />
          <p style={{
            fontSize: '0.75rem',
            color: '#6b7280',
            marginTop: '0.5rem'
          }}>
            Ce nom apparaîtra sur tous les documents PDF et rapports officiels
          </p>
        </div>
      </div>

      {/* Section Branding ProFireManager */}
      <div style={{
        backgroundColor: 'white',
        border: '2px solid #e5e7eb',
        borderRadius: '12px',
        padding: '1.5rem',
        marginBottom: '1.5rem'
      }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem' }}>
          Branding ProFireManager
        </h3>

        <label style={{
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          gap: '0.75rem'
        }}>
          <input
            type="checkbox"
            checked={personnalisation.afficher_profiremanager}
            onChange={(e) => setPersonnalisation(prev => ({
              ...prev,
              afficher_profiremanager: e.target.checked
            }))}
            style={{
              width: '20px',
              height: '20px',
              cursor: 'pointer'
            }}
          />
          <span style={{ fontWeight: '500' }}>
            Afficher le branding ProFireManager
          </span>
        </label>

        <div style={{
          marginTop: '1rem',
          padding: '0.75rem',
          backgroundColor: personnalisation.afficher_profiremanager ? '#f0fdf4' : '#fef3c7',
          border: `1px solid ${personnalisation.afficher_profiremanager ? '#bbf7d0' : '#fcd34d'}`,
          borderRadius: '6px',
          fontSize: '0.75rem',
          color: personnalisation.afficher_profiremanager ? '#15803d' : '#92400e'
        }}>
          {personnalisation.afficher_profiremanager ? (
            <>
              ✅ <strong>Recommandé</strong> : La marque "ProFireManager" apparaîtra discrètement en haut à droite de l'application et en pied de page des documents PDF. Cela aide pour le support technique et la reconnaissance du logiciel.
            </>
          ) : (
            <>
              ⚠️ <strong>Non recommandé</strong> : Masquer le branding peut rendre le support technique plus difficile. Les utilisateurs ne sauront pas quel logiciel ils utilisent.
            </>
          )}
        </div>
      </div>

      {/* Boutons d'action */}
      <div style={{
        display: 'flex',
        gap: '0.75rem',
        justifyContent: 'flex-end'
      }}>
        <Button
          variant="outline"
          onClick={loadPersonnalisation}
          disabled={saving}
        >
          🔄 Annuler
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? '💾 Enregistrement...' : '✅ Enregistrer'}
        </Button>
      </div>

      {/* Info supplémentaire */}
      <div style={{
        marginTop: '2rem',
        padding: '1rem',
        backgroundColor: '#f0f9ff',
        border: '1px solid #bae6fd',
        borderRadius: '8px',
        fontSize: '0.875rem',
        color: '#0369a1'
      }}>
        <strong>ℹ️ À propos de la personnalisation</strong>
        <ul style={{ marginTop: '0.5rem', marginLeft: '1.5rem', lineHeight: '1.6' }}>
          <li>Le logo et le nom du service sont isolés par tenant (chaque service a ses propres paramètres)</li>
          <li>Les changements s'appliquent immédiatement dans toute l'application</li>
          <li>Les documents PDF générés incluront automatiquement votre logo et nom</li>
          <li>Le branding ProFireManager reste visible pour assurer un support de qualité</li>
        </ul>
      </div>
    </div>
  );
};

export default Personnalisation;
