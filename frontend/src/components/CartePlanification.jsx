import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip, useMap, LayersControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { apiGet } from '../utils/api';

const { BaseLayer } = LayersControl;

// Fix pour les icônes par défaut de Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Icônes personnalisées pour les marqueurs
const createIcon = (color) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      background-color: ${color};
      width: 30px;
      height: 30px;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 2px 5px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      font-size: 16px;
    ">🏠</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15]
  });
};

const redIcon = createIcon('#ef4444'); // Rouge - à faire
const orangeIcon = createIcon('#f97316'); // Orange - en cours
const greenIcon = createIcon('#22c55e'); // Vert - complété

// Composant pour ajuster le zoom de la carte
const MapBounds = ({ batiments }) => {
  const map = useMap();
  
  useEffect(() => {
    if (batiments && batiments.length > 0) {
      const bounds = batiments
        .filter(b => b.latitude && b.longitude)
        .map(b => [b.latitude, b.longitude]);
      
      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }
  }, [batiments, map]);
  
  return null;
};

const CartePlanification = ({ tenantSlug, onBatimentClick, parametres }) => {
  const [batiments, setBatiments] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ rouge: 0, orange: 0, vert: 0 });

  useEffect(() => {
    fetchData();
  }, [tenantSlug]);

  const fetchData = async () => {
    try {
      setLoading(true);
      console.log('🗺️ CartePlanification - Début fetchData, tenantSlug:', tenantSlug);
      
      // Récupérer les bâtiments et inspections
      const [batimentsData, inspectionsData] = await Promise.all([
        apiGet(tenantSlug, '/prevention/batiments'),
        apiGet(tenantSlug, '/prevention/inspections')
      ]);
      
      console.log('🗺️ Réponse API batiments:', batimentsData);
      console.log('🗺️ Réponse API inspections:', inspectionsData);
      console.log(`🗺️ Données récupérées: ${batimentsData?.length || 0} bâtiments, ${inspectionsData?.length || 0} inspections`);
      
      setBatiments(batimentsData);
      setInspections(inspectionsData);
      
      // Calculer les statistiques
      const batimentsAvecStatut = calculateBatimentStatut(batimentsData, inspectionsData, parametres);
      const rouge = batimentsAvecStatut.filter(b => b.couleur === 'rouge').length;
      const orange = batimentsAvecStatut.filter(b => b.couleur === 'orange').length;
      const vert = batimentsAvecStatut.filter(b => b.couleur === 'vert').length;
      
      console.log(`🗺️ Stats calculées - Rouge: ${rouge}, Orange: ${orange}, Vert: ${vert}`);
      setStats({ rouge, orange, vert });
    } catch (error) {
      console.error('❌ Erreur chargement données carte:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateBatimentStatut = (batiments, inspections, parametres) => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const recurrence = parametres?.frequence_inspections || 1;
    const nombreVisitesRequises = parametres?.nb_visites_max || 1;
    
    return batiments.map(batiment => {
      // Trouver les inspections de cette année pour ce bâtiment
      const inspectionsCetteAnnee = inspections.filter(insp => {
        const dateInsp = new Date(insp.date_inspection);
        return insp.batiment_id === batiment.id && 
               dateInsp.getFullYear() === currentYear;
      });
      
      // Trouver la dernière inspection validée
      const derniereInspectionValidee = inspections
        .filter(insp => insp.batiment_id === batiment.id && insp.statut === 'valide')
        .sort((a, b) => new Date(b.date_inspection) - new Date(a.date_inspection))[0];
      
      // Calculer la couleur
      let couleur = 'rouge';
      let tooltip = `${batiment.nom_etablissement}\n${batiment.adresse_civique}`;
      
      // Vert si inspection validée cette année
      if (inspectionsCetteAnnee.some(insp => insp.statut === 'valide')) {
        couleur = 'vert';
        tooltip += `\n✅ Dernière inspection: ${new Date(derniereInspectionValidee.date_inspection).toLocaleDateString('fr-FR')}`;
      }
      // Vert si nombre de visites atteint (peu importe statut)
      else if (inspectionsCetteAnnee.length >= nombreVisitesRequises) {
        couleur = 'vert';
        tooltip += `\n✅ ${inspectionsCetteAnnee.length} visite(s) effectuée(s)`;
      }
      // Orange si inspection en cours (absent, non disponible, personne mineure)
      else if (inspectionsCetteAnnee.some(insp => 
        ['absent', 'non_disponible', 'personne_mineure'].includes(insp.statut))) {
        couleur = 'orange';
        const derniereVisite = inspectionsCetteAnnee[inspectionsCetteAnnee.length - 1];
        tooltip += `\n🟠 Dernière visite: ${new Date(derniereVisite.date_inspection).toLocaleDateString('fr-FR')} - ${derniereVisite.statut}`;
      }
      // Rouge si aucune inspection ou seulement brouillons
      else {
        couleur = 'rouge';
        if (derniereInspectionValidee) {
          tooltip += `\n🔴 Dernière inspection validée: ${new Date(derniereInspectionValidee.date_inspection).toLocaleDateString('fr-FR')}`;
        } else {
          tooltip += '\n🔴 Aucune inspection effectuée';
        }
      }
      
      return {
        ...batiment,
        couleur,
        tooltip,
        inspectionsCetteAnnee: inspectionsCetteAnnee.length
      };
    });
  };

  const getIcon = (couleur) => {
    switch (couleur) {
      case 'rouge': return redIcon;
      case 'orange': return orangeIcon;
      case 'vert': return greenIcon;
      default: return redIcon;
    }
  };

  const batimentsAvecStatut = calculateBatimentStatut(batiments, inspections, parametres);
  
  // Filtrer les bâtiments avec coordonnées valides
  const batimentsValides = batimentsAvecStatut.filter(b => 
    b.latitude && b.longitude && 
    !isNaN(b.latitude) && !isNaN(b.longitude)
  );

  console.log(`🗺️ Bâtiments valides avec coordonnées: ${batimentsValides.length}/${batimentsAvecStatut.length}`);

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Chargement de la carte...</p>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Légende et statistiques */}
      <div style={{
        padding: '1rem',
        backgroundColor: 'white',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            📍 Carte des Inspections {new Date().getFullYear()}
          </h3>
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            Cliquez sur un bâtiment pour voir les détails et effectuer une inspection
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              backgroundColor: '#ef4444'
            }} />
            <span style={{ fontSize: '0.875rem', fontWeight: '500' }}>
              À faire: {stats.rouge}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              backgroundColor: '#f97316'
            }} />
            <span style={{ fontSize: '0.875rem', fontWeight: '500' }}>
              En cours: {stats.orange}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              backgroundColor: '#22c55e'
            }} />
            <span style={{ fontSize: '0.875rem', fontWeight: '500' }}>
              Complétés: {stats.vert}
            </span>
          </div>
        </div>
      </div>

      {/* Carte */}
      <div style={{ flex: 1, position: 'relative', minHeight: '500px', backgroundColor: '#e0e0e0' }}>
        {batimentsValides.length === 0 ? (
          <div style={{ 
            height: '100%', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            backgroundColor: '#f9fafb'
          }}>
            <p style={{ color: '#6b7280' }}>
              Aucun bâtiment avec coordonnées GPS disponible
            </p>
          </div>
        ) : (
          <MapContainer
            center={[45.4042, -72.9889]}
            zoom={13}
            style={{ height: '500px', width: '100%' }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            <MapBounds batiments={batimentsValides} />
            
            {batimentsValides.map(batiment => (
              <Marker
                key={batiment.id}
                position={[batiment.latitude, batiment.longitude]}
                icon={getIcon(batiment.couleur)}
                eventHandlers={{
                  click: () => onBatimentClick(batiment)
                }}
              >
                <Popup>
                  <div style={{ minWidth: '200px' }}>
                    <h4 style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>
                      {batiment.nom_etablissement}
                    </h4>
                    <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                      📍 {batiment.adresse_civique}
                    </p>
                    <div style={{ 
                      padding: '0.5rem',
                      backgroundColor: batiment.couleur === 'rouge' ? '#fee2e2' : 
                                      batiment.couleur === 'orange' ? '#ffedd5' : '#dcfce7',
                      borderRadius: '4px',
                      marginBottom: '0.5rem'
                    }}>
                      <p style={{ fontSize: '0.875rem', fontWeight: '500' }}>
                        {batiment.couleur === 'rouge' && '🔴 À inspecter'}
                        {batiment.couleur === 'orange' && `🟠 ${batiment.inspectionsCetteAnnee} visite(s)`}
                        {batiment.couleur === 'vert' && '✅ Complété'}
                      </p>
                    </div>
                    <button
                      onClick={() => onBatimentClick(batiment)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        backgroundColor: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: '500'
                      }}
                    >
                      {batiment.couleur === 'rouge' ? '🔍 Inspecter' : '👁️ Voir détails'}
                    </button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}
      </div>
    </div>
  );
};

export default CartePlanification;
