import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { useTenant } from '../contexts/TenantContext';
import { apiGet, apiPut, buildApiUrl, getTenantToken } from '../utils/api';
import { useToast } from '../hooks/use-toast';
import { ArrowRight, GripVertical, Image, ChevronDown, Check, Undo2, RefreshCw } from 'lucide-react';

const ReassignPhotos = ({ batiments }) => {
  const { tenantSlug } = useTenant();
  const { toast } = useToast();

  const [sourceBatId, setSourceBatId] = useState('');
  const [targetBatId, setTargetBatId] = useState('');
  const [sourcePhotos, setSourcePhotos] = useState([]);
  const [targetPhotos, setTargetPhotos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [draggedPhoto, setDraggedPhoto] = useState(null);
  const [dragOverTarget, setDragOverTarget] = useState(null);
  const [pendingMoves, setPendingMoves] = useState([]);
  const [saving, setSaving] = useState(false);

  const token = getTenantToken(tenantSlug);

  const fetchPhotos = useCallback(async (batimentId, setter) => {
    if (!batimentId) { setter([]); return; }
    setLoading(true);
    try {
      const [legacyRes, filesRes] = await Promise.all([
        apiGet(tenantSlug, `/prevention/batiments/${batimentId}/photos`).catch(() => []),
        apiGet(tenantSlug, `/files/by-entity/batiment/${batimentId}`).catch(() => ({ files: [] })),
      ]);

      const legacy = (Array.isArray(legacyRes) ? legacyRes : []).map(p => ({
        id: p.id,
        url: p.url,
        titre: p.titre || p.categorie || 'Photo',
        type: 'legacy',
        batimentId,
      }));

      const imported = (filesRes?.files || []).map(f => ({
        id: f.id,
        url: buildApiUrl(tenantSlug, `/files/${f.id}/download?auth=${token}`),
        titre: f.original_filename || 'Fichier importé',
        type: 'imported',
        batimentId,
      }));

      setter([...legacy, ...imported]);
    } catch (e) {
      console.error('Erreur chargement photos:', e);
      setter([]);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, token]);

  useEffect(() => { fetchPhotos(sourceBatId, setSourcePhotos); }, [sourceBatId, fetchPhotos]);
  useEffect(() => { fetchPhotos(targetBatId, setTargetPhotos); }, [targetBatId, fetchPhotos]);

  // Drag handlers
  const handleDragStart = (e, photo, fromPanel) => {
    setDraggedPhoto({ ...photo, fromPanel });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', photo.id);
  };

  const handleDragOver = (e, panel) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverTarget(panel);
  };

  const handleDragLeave = () => { setDragOverTarget(null); };

  const handleDrop = (e, toPanel) => {
    e.preventDefault();
    setDragOverTarget(null);
    if (!draggedPhoto || draggedPhoto.fromPanel === toPanel) return;

    const fromBatId = draggedPhoto.fromPanel === 'source' ? sourceBatId : targetBatId;
    const toBatId = toPanel === 'source' ? sourceBatId : targetBatId;

    if (!fromBatId || !toBatId || fromBatId === toBatId) return;

    // Déplacer localement
    const photo = draggedPhoto;
    if (photo.fromPanel === 'source') {
      setSourcePhotos(prev => prev.filter(p => p.id !== photo.id));
      setTargetPhotos(prev => [...prev, { ...photo, batimentId: toBatId }]);
    } else {
      setTargetPhotos(prev => prev.filter(p => p.id !== photo.id));
      setSourcePhotos(prev => [...prev, { ...photo, batimentId: toBatId }]);
    }

    setPendingMoves(prev => [...prev, {
      photoId: photo.id,
      photoType: photo.type,
      fromBatId,
      toBatId,
      photoTitre: photo.titre,
    }]);

    setDraggedPhoto(null);
  };

  const handleUndo = () => {
    if (pendingMoves.length === 0) return;
    const last = pendingMoves[pendingMoves.length - 1];
    setPendingMoves(prev => prev.slice(0, -1));

    // Recharger les deux panneaux
    fetchPhotos(sourceBatId, setSourcePhotos);
    fetchPhotos(targetBatId, setTargetPhotos);

    toast({ title: 'Annulé', description: `"${last.photoTitre}" replacée` });
  };

  const handleSaveAll = async () => {
    if (pendingMoves.length === 0) return;
    setSaving(true);
    let success = 0;
    let errors = 0;

    for (const move of pendingMoves) {
      try {
        if (move.photoType === 'imported') {
          await apiPut(tenantSlug, `/files/${move.photoId}/reassign`, {
            new_entity_id: move.toBatId,
          });
        } else {
          await apiPut(tenantSlug, `/prevention/batiments/photos/${move.photoId}/reassign`, {
            source_batiment_id: move.fromBatId,
            target_batiment_id: move.toBatId,
          });
        }
        success++;
      } catch (e) {
        console.error('Erreur reassignation:', e);
        errors++;
      }
    }

    setPendingMoves([]);
    setSaving(false);

    if (errors > 0) {
      toast({ title: 'Attention', description: `${success} photo(s) déplacée(s), ${errors} erreur(s)`, variant: 'destructive' });
    } else {
      toast({ title: 'Succès', description: `${success} photo(s) réassignée(s) avec succès` });
    }

    // Recharger
    fetchPhotos(sourceBatId, setSourcePhotos);
    fetchPhotos(targetBatId, setTargetPhotos);
  };

  const getBatimentNom = (id) => {
    const b = batiments.find(b => b.id === id);
    return b ? (b.nom || b.adresse || 'Sans nom') : '';
  };

  const renderPhotoGrid = (photos, panel) => {
    const isOver = dragOverTarget === panel;

    return (
      <div
        data-testid={`photo-drop-zone-${panel}`}
        onDragOver={(e) => handleDragOver(e, panel)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, panel)}
        style={{
          minHeight: 200,
          borderRadius: 12,
          border: `2px dashed ${isOver ? '#3b82f6' : '#e2e8f0'}`,
          background: isOver ? '#eff6ff' : '#fafafa',
          padding: 16,
          transition: 'all 0.2s ease',
        }}
      >
        {photos.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 150, color: '#94a3b8' }}>
            <Image size={32} />
            <p style={{ marginTop: 8, fontSize: 14 }}>Aucune photo</p>
            {isOver && <p style={{ fontSize: 13, color: '#3b82f6', fontWeight: 600 }}>Relâcher pour déposer ici</p>}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>
            {photos.map(photo => (
              <div
                key={photo.id}
                draggable
                data-testid={`draggable-photo-${photo.id}`}
                onDragStart={(e) => handleDragStart(e, photo, panel)}
                style={{
                  position: 'relative',
                  borderRadius: 10,
                  overflow: 'hidden',
                  border: '1px solid #e2e8f0',
                  cursor: 'grab',
                  background: '#fff',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)'; }}
              >
                <div style={{ position: 'absolute', top: 4, left: 4, zIndex: 2, background: 'rgba(0,0,0,0.5)', borderRadius: 6, padding: '2px 4px' }}>
                  <GripVertical size={14} color="#fff" />
                </div>
                <img
                  src={photo.url}
                  alt={photo.titre}
                  style={{ width: '100%', height: 90, objectFit: 'cover', display: 'block' }}
                  onError={e => { e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="90"><rect fill="%23f1f5f9" width="100%" height="100%"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%2394a3b8" font-size="12">Photo</text></svg>'; }}
                />
                <div style={{ padding: '6px 8px', fontSize: 11, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {photo.titre}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div data-testid="reassign-photos-view" style={{ padding: '0 0 24px' }}>
      {/* Actions bar */}
      {pendingMoves.length > 0 && (
        <div
          data-testid="pending-moves-bar"
          style={{
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: 12,
            padding: '12px 20px',
            marginBottom: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ color: '#1e40af', fontSize: 14, fontWeight: 500 }}>
            {pendingMoves.length} déplacement(s) en attente
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="outline" size="sm" onClick={handleUndo} data-testid="undo-move-btn">
              <Undo2 size={14} className="mr-1" /> Annuler dernier
            </Button>
            <Button size="sm" onClick={handleSaveAll} disabled={saving} data-testid="save-moves-btn">
              {saving ? <RefreshCw size={14} className="mr-1 animate-spin" /> : <Check size={14} className="mr-1" />}
              Enregistrer tout
            </Button>
          </div>
        </div>
      )}

      {/* Panels */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'start' }}>
        {/* Source panel */}
        <Card style={{ padding: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
              Bâtiment source
            </label>
            <select
              data-testid="source-batiment-select"
              value={sourceBatId}
              onChange={e => setSourceBatId(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8,
                border: '1px solid #d1d5db', fontSize: 14, background: '#fff',
              }}
            >
              <option value="">-- Sélectionner --</option>
              {batiments.map(b => (
                <option key={b.id} value={b.id} disabled={b.id === targetBatId}>
                  {b.nom || b.adresse || 'Sans nom'}
                </option>
              ))}
            </select>
          </div>
          {sourceBatId && (
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>
              {sourcePhotos.length} photo(s)
            </p>
          )}
          {loading && sourceBatId ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>
              <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 8px' }} /> Chargement...
            </div>
          ) : (
            renderPhotoGrid(sourcePhotos, 'source')
          )}
        </Card>

        {/* Arrow */}
        <div style={{ display: 'flex', alignItems: 'center', paddingTop: 60 }}>
          <ArrowRight size={28} color="#94a3b8" />
        </div>

        {/* Target panel */}
        <Card style={{ padding: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
              Bâtiment cible
            </label>
            <select
              data-testid="target-batiment-select"
              value={targetBatId}
              onChange={e => setTargetBatId(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8,
                border: '1px solid #d1d5db', fontSize: 14, background: '#fff',
              }}
            >
              <option value="">-- Sélectionner --</option>
              {batiments.map(b => (
                <option key={b.id} value={b.id} disabled={b.id === sourceBatId}>
                  {b.nom || b.adresse || 'Sans nom'}
                </option>
              ))}
            </select>
          </div>
          {targetBatId && (
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>
              {targetPhotos.length} photo(s)
            </p>
          )}
          {loading && targetBatId ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>
              <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 8px' }} /> Chargement...
            </div>
          ) : (
            renderPhotoGrid(targetPhotos, 'target')
          )}
        </Card>
      </div>

      {/* Help text */}
      <p style={{ textAlign: 'center', fontSize: 13, color: '#94a3b8', marginTop: 16 }}>
        Glissez-déposez les photos d'un bâtiment à l'autre, puis cliquez "Enregistrer tout" pour confirmer les changements.
      </p>
    </div>
  );
};

export default ReassignPhotos;
