import React, { useState, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useToast } from '../hooks/use-toast';
import { useConfirmDialog } from './ui/ConfirmDialog';
import { useTenant } from '../contexts/TenantContext';
import { useAuth } from '../contexts/AuthContext';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { PointEauModal, InspectionModal } from './PointEauModals';

const ApprovisionnementEau = () => {
  const { user, tenant } = useAuth();
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const { confirm } = useConfirmDialog();
  
  const [currentView, setCurrentView] = useState('carte');
  const [pointsEau, setPointsEau] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [showPointModal, setShowPointModal] = useState(false);
  const [showInspectionModal, setShowInspectionModal] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [statutFilter, setStatutFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [map, setMap] = useState(null);
  const [mapCenter, setMapCenter] = useState([45.5017, -73.5673]); // Montréal par défaut
  const [mapZoom, setMapZoom] = useState(12);
  const [mapLayer, setMapLayer] = useState('plan'); // 'plan' ou 'satellite'

  // Charger les points d'eau
  const fetchPointsEau = async () => {
    try {
      setLoading(true);
      let url = '/points-eau';
      const params = new URLSearchParams();
      
      if (typeFilter !== 'all') params.append('type', typeFilter);
      if (statutFilter !== 'all') params.append('etat', statutFilter);
      
      if (params.toString()) url += '?' + params.toString();
      
      const data = await apiGet(tenantSlug, url);
      setPointsEau(data);
      
      // Centrer la carte sur le premier point si disponible
      if (data.length > 0 && data[0].latitude && data[0].longitude) {
        setMapCenter([data[0].latitude, data[0].longitude]);
      }
    } catch (error) {
      console.error('Erreur chargement points d\'eau:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les points d'eau",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Charger les statistiques
  const fetchStats = async () => {
    try {
      const data = await apiGet(tenantSlug, '/points-eau-statistiques');
      setStats(data);
    } catch (error) {
      console.error('Erreur chargement statistiques:', error);
    }
  };

  useEffect(() => {
    fetchPointsEau();
    fetchStats();
  }, [tenantSlug, typeFilter, statutFilter]);

  // Filtrer les points selon la recherche
  const filteredPoints = pointsEau.filter(point => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      point.numero_identification?.toLowerCase().includes(term) ||
      point.adresse?.toLowerCase().includes(term) ||
      point.ville?.toLowerCase().includes(term)
    );
  });

  // Déterminer la couleur effective du point (priorité à l'état manuel)
  const getEffectiveColor = (point) => {
    // Priorité à l'état manuel
    if (point.etat === 'fonctionnelle') return 'vert';
    if (point.etat === 'en_reparation' || point.etat === 'attention') return 'orange';
    if (point.etat === 'hors_service') return 'rouge';
    // Sinon, utiliser statut_couleur
    return point.statut_couleur || 'gris';
  };

  // Déterminer la couleur du marqueur selon le statut
  const getMarkerColor = (statutCouleur) => {
    switch (statutCouleur) {
      case 'vert': return '#10b981';
      case 'orange': return '#f59e0b';
      case 'rouge': return '#ef4444';
      default: return '#9ca3af';
    }
  };

  // Déterminer l'icône selon le type
  const getTypeIcon = (type) => {
    switch (type) {
      case 'borne_fontaine': return '⛲';
      case 'borne_seche': return '🔥';
      case 'point_eau_statique': return '💧';
      default: return '📍';
    }
  };

  // Obtenir l'icône Leaflet personnalisée avec badge coloré
  const getLeafletIcon = (type, statutCouleur) => {
    const iconUrls = {
      borne_fontaine: 'https://customer-assets.emergentagent.com/job_1c79b284-3589-40f0-b5e3-5fa8640320ff/artifacts/opwhu1ma_Borne%20fontaine.png',
      borne_seche: 'https://customer-assets.emergentagent.com/job_1c79b284-3589-40f0-b5e3-5fa8640320ff/artifacts/wkhxcmid_Borne%20seche.png',
      point_eau_statique: 'https://customer-assets.emergentagent.com/job_1c79b284-3589-40f0-b5e3-5fa8640320ff/artifacts/1nhnxx97_eau.png'
    };

    const badgeColor = statutCouleur === 'vert' ? '#10b981' : statutCouleur === 'jaune' ? '#f59e0b' : statutCouleur === 'rouge' ? '#ef4444' : '#6b7280';

    return L.divIcon({
      html: `
        <div style="position: relative; width: 40px; height: 40px;">
          <img src="${iconUrls[type] || iconUrls.point_eau_statique}" style="width: 40px; height: 40px;" />
          <div style="
            position: absolute;
            bottom: 0px;
            right: 0px;
            width: 14px;
            height: 14px;
            background: ${badgeColor};
            border: 2px solid white;
            border-radius: 50%;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          "></div>
        </div>
      `,
      className: '',
      iconSize: [40, 40],
      iconAnchor: [20, 40],
      popupAnchor: [0, -40]
    });
  };

  // Ouvrir le modal d'ajout/modification
  const openPointModal = (point = null) => {
    setSelectedPoint(point);
    setShowPointModal(true);
  };

  // Ouvrir le modal d'inspection
  const openInspectionModal = (point) => {
    setSelectedPoint(point);
    setShowInspectionModal(true);
  };

  // Supprimer un point
  const deletePoint = async (pointId) => {
    const confirmed = await confirm({
      title: 'Supprimer le point d\'eau',
      message: 'Êtes-vous sûr de vouloir supprimer ce point d\'eau ?',
      variant: 'danger',
      confirmText: 'Supprimer'
    });
    if (!confirmed) return;
    
    try {
      await apiDelete(tenantSlug, `/points-eau/${pointId}`);
      toast({
        title: "Succès",
        description: "Point d'eau supprimé avec succès"
      });
      fetchPointsEau();
      fetchStats();
    } catch (error) {
      console.error('Erreur suppression:', error);
      toast({
        title: "Erreur",
        description: "Impossible de supprimer le point d'eau",
        variant: "destructive"
      });
    }
  };

  // Export Excel avec coordonnées GPS
  const exportToExcel = () => {
    const dataToExport = filteredPoints.map(point => ({
      'Numéro identification': point.numero_identification || '',
      'Type': point.type === 'borne_fontaine' ? 'Borne-fontaine' : 
              point.type === 'borne_seche' ? 'Borne sèche' : 'Point d\'eau statique',
      'État': point.etat === 'fonctionnelle' ? 'Fonctionnelle' :
              point.etat === 'en_reparation' ? 'En réparation' :
              point.etat === 'hors_service' ? 'Hors service' : point.etat || 'Non défini',
      'Adresse': point.adresse || '',
      'Ville': point.ville || '',
      'Débit (GPM)': point.debit_gpm || '',
      'Capacité (L)': point.capacite_litres || '',
      'Diamètre raccordement': point.diametre_raccordement || '',
      'Latitude': point.latitude || '',
      'Longitude': point.longitude || '',
      'Date dernier test': point.date_dernier_test || '',
      'Notes': point.notes || ''
    }));

    // Créer le contenu CSV
    const headers = Object.keys(dataToExport[0] || {});
    const csvContent = [
      headers.join(';'),
      ...dataToExport.map(row => 
        headers.map(h => {
          const val = row[h];
          // Échapper les guillemets et entourer de guillemets si nécessaire
          if (typeof val === 'string' && (val.includes(';') || val.includes('"') || val.includes('\n'))) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        }).join(';')
      )
    ].join('\n');

    // Télécharger
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `points_eau_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "Export réussi",
      description: `${dataToExport.length} point(s) d'eau exporté(s) en Excel/CSV`
    });
  };

  // Export PDF
  const exportToPDF = () => {
    const getEtatColor = (etat) => {
      if (etat === 'fonctionnelle') return '#10b981';
      if (etat === 'en_reparation') return '#f59e0b';
      if (etat === 'hors_service') return '#ef4444';
      return '#6b7280';
    };

    const getEtatLabel = (etat) => {
      if (etat === 'fonctionnelle') return '🟢 Fonctionnelle';
      if (etat === 'en_reparation') return '🟠 En réparation';
      if (etat === 'hors_service') return '🔴 Hors service';
      return etat || 'Non défini';
    };

    const getTypeLabel = (type) => {
      if (type === 'borne_fontaine') return 'Borne-fontaine';
      if (type === 'borne_seche') return 'Borne sèche';
      return 'Point d\'eau statique';
    };

    // Grouper par état pour le résumé
    const summary = {
      fonctionnelle: filteredPoints.filter(p => p.etat === 'fonctionnelle').length,
      en_reparation: filteredPoints.filter(p => p.etat === 'en_reparation').length,
      hors_service: filteredPoints.filter(p => p.etat === 'hors_service').length,
      autres: filteredPoints.filter(p => !['fonctionnelle', 'en_reparation', 'hors_service'].includes(p.etat)).length
    };

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Points d'eau - Export</title>
        <style>
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
          body { font-family: Arial, sans-serif; margin: 20px; font-size: 12px; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #2563eb; padding-bottom: 15px; }
          .header h1 { color: #1e40af; margin: 0; font-size: 24px; }
          .header p { color: #6b7280; margin: 5px 0 0; }
          .summary { display: flex; gap: 15px; justify-content: center; margin-bottom: 20px; flex-wrap: wrap; }
          .summary-item { padding: 10px 20px; border-radius: 8px; text-align: center; min-width: 100px; }
          .summary-item.vert { background: #d1fae5; border: 1px solid #10b981; }
          .summary-item.orange { background: #fef3c7; border: 1px solid #f59e0b; }
          .summary-item.rouge { background: #fee2e2; border: 1px solid #ef4444; }
          .summary-item .count { font-size: 24px; font-weight: bold; }
          .summary-item .label { font-size: 11px; color: #6b7280; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th { background: #1e40af; color: white; padding: 10px 8px; text-align: left; font-size: 11px; }
          td { padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px; }
          tr:nth-child(even) { background: #f9fafb; }
          .etat-badge { padding: 3px 8px; border-radius: 12px; font-weight: 600; font-size: 10px; display: inline-block; }
          .etat-fonctionnelle { background: #d1fae5; color: #065f46; }
          .etat-en_reparation { background: #fef3c7; color: #92400e; }
          .etat-hors_service { background: #fee2e2; color: #991b1b; }
          .footer { margin-top: 20px; text-align: center; color: #9ca3af; font-size: 10px; border-top: 1px solid #e5e7eb; padding-top: 10px; }
          @page { margin: 15mm; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🚒 Points d'eau - Approvisionnement</h1>
          <p>Export du ${new Date().toLocaleDateString('fr-CA')} • ${filteredPoints.length} point(s)</p>
        </div>
        
        <div class="summary">
          <div class="summary-item vert">
            <div class="count">${summary.fonctionnelle}</div>
            <div class="label">Fonctionnels</div>
          </div>
          <div class="summary-item orange">
            <div class="count">${summary.en_reparation}</div>
            <div class="label">En réparation</div>
          </div>
          <div class="summary-item rouge">
            <div class="count">${summary.hors_service}</div>
            <div class="label">Hors service</div>
          </div>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>N° Identification</th>
              <th>Type</th>
              <th>État</th>
              <th>Adresse</th>
              <th>Ville</th>
              <th>Débit (GPM)</th>
              <th>Dernier test</th>
            </tr>
          </thead>
          <tbody>
            ${filteredPoints.map(point => `
              <tr>
                <td><strong>${point.numero_identification || '-'}</strong></td>
                <td>${getTypeLabel(point.type)}</td>
                <td><span class="etat-badge etat-${point.etat || 'autre'}">${getEtatLabel(point.etat)}</span></td>
                <td>${point.adresse || '-'}</td>
                <td>${point.ville || '-'}</td>
                <td>${point.debit_gpm || '-'}</td>
                <td>${point.date_dernier_test || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <div class="footer">
          ProFireManager - Document généré automatiquement
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 500);

    toast({
      title: "Export PDF",
      description: "La fenêtre d'impression s'est ouverte"
    });
  };

  // Composant pour gérer le clic sur la carte
  const MapClickHandler = () => {
    const map = useMapEvents({
      click: (e) => {
        // Seulement pour admin/superviseur
        if (user?.role === 'admin' || user?.role === 'superviseur') {
          openPointModal({
            latitude: e.latlng.lat,
            longitude: e.latlng.lng,
            type: 'borne_fontaine',
            ville: 'Shefford'
          });
        }
      }
    });
    return null;
  };

  // Rendu de la carte
  const renderCarte = () => (
    <div style={{ height: 'calc(100vh - 300px)', minHeight: '500px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e5e7eb', position: 'relative' }}>
      {/* Toggle Plan/Satellite */}
      <div style={{
        position: 'absolute',
        top: '10px',
        right: '10px',
        zIndex: 100000,
        background: 'white',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        display: 'flex'
      }}>
        <button
          onClick={() => setMapLayer('plan')}
          style={{
            padding: '8px 16px',
            border: 'none',
            background: mapLayer === 'plan' ? '#3b82f6' : 'white',
            color: mapLayer === 'plan' ? 'white' : '#6b7280',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '0.875rem',
            borderRadius: '8px 0 0 8px',
            borderRight: '1px solid #e5e7eb'
          }}
        >
          🗺️ Plan
        </button>
        <button
          onClick={() => setMapLayer('satellite')}
          style={{
            padding: '8px 16px',
            border: 'none',
            background: mapLayer === 'satellite' ? '#3b82f6' : 'white',
            color: mapLayer === 'satellite' ? 'white' : '#6b7280',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '0.875rem',
            borderRadius: '0 8px 8px 0'
          }}
        >
          🛰️ Satellite
        </button>
      </div>
      <MapContainer 
        center={mapCenter} 
        zoom={mapZoom} 
        style={{ height: '100%', width: '100%' }}
        whenCreated={setMap}
      >
        {mapLayer === 'plan' ? (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        ) : (
          <TileLayer
            attribution='&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          />
        )}
        <MapClickHandler />
        {filteredPoints.map(point => (
          point.latitude && point.longitude && (
            <Marker
              key={point.id}
              position={[point.latitude, point.longitude]}
              icon={getLeafletIcon(point.type, getEffectiveColor(point))}
            >
              <Popup>
                <div style={{ minWidth: '250px' }}>
                  <h3 style={{ fontWeight: '600', marginBottom: '0.5rem', fontSize: '1rem' }}>
                    {getTypeIcon(point.type)} {point.numero_identification}
                  </h3>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.75rem' }}>
                    <p><strong>Type:</strong> {
                      point.type === 'borne_fontaine' ? 'Borne-fontaine' :
                      point.type === 'borne_seche' ? 'Borne sèche' :
                      'Point d\'eau statique'
                    }</p>
                    {point.adresse && <p><strong>Adresse:</strong> {point.adresse}</p>}
                    {point.ville && <p><strong>Ville:</strong> {point.ville}</p>}
                    {point.debit_gpm && <p><strong>Débit:</strong> {point.debit_gpm} GPM</p>}
                    <p><strong>État:</strong> <span style={{
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: '500',
                      background: getMarkerColor(getEffectiveColor(point)) + '20',
                      color: getMarkerColor(getEffectiveColor(point))
                    }}>
                      {point.etat === 'fonctionnelle' ? '🟢 Fonctionnelle' :
                       point.etat === 'en_reparation' ? '🟠 En réparation' :
                       point.etat === 'hors_service' ? '🔴 Hors service' :
                       point.etat || 'Non défini'}
                    </span></p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${point.latitude},${point.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        // Sur iOS, essayer d'ouvrir Apple Plans si disponible
                        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
                        if (isIOS) {
                          e.preventDefault();
                          // Utiliser le schéma maps:// pour iOS
                          window.location.href = `maps://maps.apple.com/?daddr=${point.latitude},${point.longitude}&dirflg=d`;
                        }
                      }}
                      style={{
                        padding: '0.5rem',
                        background: '#059669',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        textAlign: 'center',
                        textDecoration: 'none',
                        fontWeight: '500'
                      }}
                    >
                      🗺️ Navigation GPS
                    </a>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => {
                          openPointModal(point);
                        }}
                        style={{
                          flex: 1,
                          padding: '0.5rem',
                          background: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.875rem'
                        }}
                      >
                        Modifier
                      </button>
                      {point.type === 'borne_seche' && (
                        <button
                          onClick={() => openInspectionModal(point)}
                          style={{
                            flex: 1,
                            padding: '0.5rem',
                            background: '#dc2626',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.875rem'
                          }}
                        >
                          Inspecter
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          )
        ))}
      </MapContainer>
    </div>
  );

  // Rendu de la vue liste
  const renderListe = () => (
    <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
            <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem' }}>Type</th>
            <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem' }}>N° Identification</th>
            <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem' }}>Adresse</th>
            <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem' }}>Débit</th>
            <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem' }}>État</th>
            <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem' }}>Dernière Inspection</th>
            <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600', fontSize: '0.875rem' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredPoints.length === 0 ? (
            <tr>
              <td colSpan="7" style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>
                Aucun point d'eau trouvé
              </td>
            </tr>
          ) : (
            filteredPoints.map(point => (
              <tr key={point.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '1rem', fontSize: '1.5rem' }}>
                  {getTypeIcon(point.type)}
                </td>
                <td style={{ padding: '1rem', fontSize: '0.875rem', fontWeight: '500' }}>
                  {point.numero_identification}
                </td>
                <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                  {point.adresse || '-'}<br/>
                  <span style={{ fontSize: '0.75rem' }}>{point.ville || ''}</span>
                </td>
                <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                  {point.debit_gpm ? `${point.debit_gpm} GPM` : '-'}
                </td>
                <td style={{ padding: '1rem' }}>
                  <span style={{
                    padding: '4px 12px',
                    borderRadius: '12px',
                    fontSize: '0.75rem',
                    fontWeight: '500',
                    background: getMarkerColor(point.statut_couleur) + '20',
                    color: getMarkerColor(point.statut_couleur)
                  }}>
                    {point.statut_couleur === 'vert' && '✓ Conforme'}
                    {point.statut_couleur === 'orange' && '⚠ À venir'}
                    {point.statut_couleur === 'rouge' && '✗ En défaut'}
                    {point.statut_couleur === 'gris' && '◯ Non inspecté'}
                  </span>
                </td>
                <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                  {point.date_derniere_inspection ? 
                    new Date(point.date_derniere_inspection).toLocaleDateString('fr-FR') : 
                    'Jamais'}
                </td>
                <td style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                    <button
                      onClick={() => openPointModal(point)}
                      style={{
                        padding: '0.5rem',
                        background: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.875rem'
                      }}
                      title="Modifier"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => openInspectionModal(point)}
                      style={{
                        padding: '0.5rem',
                        background: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.875rem'
                      }}
                      title="Inspecter"
                    >
                      📋
                    </button>
                    {(user?.role === 'admin' || user?.role === 'superviseur') && (
                      <button
                        onClick={() => deletePoint(point.id)}
                        style={{
                          padding: '0.5rem',
                          background: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.875rem'
                        }}
                        title="Supprimer"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* En-tête */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '0.5rem', color: '#1f2937' }}>
          💧 Approvisionnement en Eau
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.95rem' }}>
          Gestion des points d'eau et inspections
        </p>
      </div>

      {/* Statistiques */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⛲</div>
            <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#1f2937', marginBottom: '0.25rem' }}>
              {stats.par_type?.bornes_fontaines || 0}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Bornes-fontaines</div>
          </div>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔥</div>
            <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#1f2937', marginBottom: '0.25rem' }}>
              {stats.par_type?.bornes_seches || 0}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Bornes sèches</div>
          </div>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>💧</div>
            <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#1f2937', marginBottom: '0.25rem' }}>
              {stats.par_type?.points_statiques || 0}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Points statiques</div>
          </div>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✓</div>
            <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#10b981', marginBottom: '0.25rem' }}>
              {stats.par_etat?.fonctionnels || 0}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Fonctionnels</div>
          </div>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</div>
            <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#3b82f6', marginBottom: '0.25rem' }}>
              {stats.inspections_30_jours || 0}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Inspections (30j)</div>
          </div>
        </div>
      )}

      {/* Barre d'outils */}
      <div style={{ 
        background: 'white', 
        padding: '1rem', 
        borderRadius: '12px', 
        marginBottom: '1.5rem',
        border: '1px solid #e5e7eb',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '1rem',
        alignItems: 'center'
      }}>
        {/* Bouton Ajouter */}
        {(user?.role === 'admin' || user?.role === 'superviseur') && (
          <button
            onClick={() => openPointModal(null)}
            style={{
              background: '#3b82f6',
              color: 'white',
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.95rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            ➕ Ajouter un point d'eau
          </button>
        )}

        {/* Filtre Type */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{
            padding: '0.75rem',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
            fontSize: '0.95rem',
            minWidth: '180px'
          }}
        >
          <option value="all">Tous les types</option>
          <option value="borne_fontaine">Bornes-fontaines</option>
          <option value="borne_seche">Bornes sèches</option>
          <option value="point_eau_statique">Points statiques</option>
        </select>

        {/* Filtre Statut */}
        <select
          value={statutFilter}
          onChange={(e) => setStatutFilter(e.target.value)}
          style={{
            padding: '0.75rem',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
            fontSize: '0.95rem',
            minWidth: '180px'
          }}
        >
          <option value="all">Tous les états</option>
          <option value="fonctionnel">Fonctionnel</option>
          <option value="defectueux">Défectueux</option>
          <option value="inaccessible">Inaccessible</option>
        </select>

        {/* Recherche */}
        <input
          type="text"
          placeholder="Rechercher (n°, adresse, ville)..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            flex: 1,
            minWidth: '250px',
            padding: '0.75rem',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
            fontSize: '0.95rem'
          }}
        />

        {/* Spacer pour pousser le toggle à droite */}
        <div style={{ flex: 1, minWidth: '50px' }}></div>

        {/* Toggle Vue */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setCurrentView('carte')}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              border: currentView === 'carte' ? '2px solid #3b82f6' : '1px solid #d1d5db',
              background: currentView === 'carte' ? '#eff6ff' : 'white',
              color: currentView === 'carte' ? '#3b82f6' : '#6b7280',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.95rem',
              whiteSpace: 'nowrap'
            }}
          >
            🗺️ Carte
          </button>
          <button
            onClick={() => setCurrentView('liste')}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              border: currentView === 'liste' ? '2px solid #3b82f6' : '1px solid #d1d5db',
              background: currentView === 'liste' ? '#eff6ff' : 'white',
              color: currentView === 'liste' ? '#3b82f6' : '#6b7280',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.95rem',
              whiteSpace: 'nowrap'
            }}
          >
            📋 Liste
          </button>
        </div>
      </div>

      {/* Contenu principal */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
          Chargement...
        </div>
      ) : (
        <>
          {currentView === 'carte' ? renderCarte() : renderListe()}
        </>
      )}

      {/* Modals (à implémenter avec les formulaires complets) */}
      {showPointModal && (
        <PointEauModal
          point={selectedPoint}
          onClose={() => {
            setShowPointModal(false);
            setSelectedPoint(null);
          }}
          onSave={() => {
            fetchPointsEau();
            fetchStats();
            setShowPointModal(false);
            setSelectedPoint(null);
          }}
        />
      )}

      {showInspectionModal && (
        <InspectionModal
          point={selectedPoint}
          onClose={() => {
            setShowInspectionModal(false);
            setSelectedPoint(null);
          }}
          onSave={() => {
            fetchPointsEau();
            fetchStats();
            setShowInspectionModal(false);
            setSelectedPoint(null);
          }}
        />
      )}
    </div>
  );
};



export default ApprovisionnementEau;
