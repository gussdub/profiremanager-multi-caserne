import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card } from './ui/card';

const CalendrierInspections = ({ tenantSlug, apiGet, apiPost, user, toast, openBatimentModal }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [inspections, setInspections] = useState([]);
  const [batiments, setBatiments] = useState([]);
  const [filtreRisque, setFiltreRisque] = useState('tous');
  const [filtrePreventionniste, setFiltrePreventionniste] = useState('tous');
  const [preventionnistes, setPreventionnistes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [grilles, setGrilles] = useState([]);
  const [newInspection, setNewInspection] = useState({
    batiment_id: '',
    grille_inspection_id: '',
    preventionniste_id: '',
    date_inspection: '',
    heure_debut: '09:00',
    type_inspection: 'reguliere'
  });

  // Charger les données
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [insp, bat, prev, gril] = await Promise.all([
        apiGet(tenantSlug, '/prevention/inspections'),
        apiGet(tenantSlug, '/prevention/batiments'),
        apiGet(tenantSlug, '/prevention/preventionnistes').catch(() => []),
        apiGet(tenantSlug, '/prevention/grilles-inspection').catch(() => [])
      ]);
      
      setInspections(insp);
      setBatiments(bat);
      setPreventionnistes(prev);
      setGrilles(gril);
    } catch (error) {
      console.error('Erreur chargement données:', error);
      alert('Erreur: Impossible de charger les données du calendrier');
    } finally {
      setLoading(false);
    }
  };

  const handleDayClick = (date) => {
    // Vérifier si l'utilisateur est admin ou superviseur
    if (user.role !== 'admin' && user.role !== 'superviseur') {
      toast({
        title: "Accès refusé",
        description: "Seuls les administrateurs et superviseurs peuvent créer des inspections.",
        variant: "destructive"
      });
      return;
    }

    setSelectedDate(date);
    setNewInspection({
      ...newInspection,
      date_inspection: date.toISOString().split('T')[0],
      preventionniste_id: '' // Vide par défaut - non assigné
    });
    setShowCreateModal(true);
  };

  const handleCreateInspection = async () => {
    try {
      if (!newInspection.batiment_id || !newInspection.grille_inspection_id) {
        toast({
          title: "Erreur",
          description: "Veuillez remplir tous les champs requis (Bâtiment et Grille)",
          variant: "destructive"
        });
        return;
      }

      await apiPost(tenantSlug, '/prevention/inspections', newInspection);
      
      toast({
        title: "Succès",
        description: "Inspection planifiée avec succès"
      });
      
      setShowCreateModal(false);
      setNewInspection({
        batiment_id: '',
        grille_inspection_id: '',
        preventionniste_id: '',
        date_inspection: '',
        heure_debut: '09:00',
        type_inspection: 'reguliere'
      });
      
      // Recharger les inspections
      fetchData();
    } catch (error) {
      console.error('Erreur création inspection:', error);
      toast({
        title: "Erreur",
        description: "Impossible de créer l'inspection: " + (error.message || 'Erreur inconnue'),
        variant: "destructive"
      });
    }
  };

  // Générer les jours du mois
  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    
    // Jours du mois précédent pour compléter la première semaine
    for (let i = 0; i < startingDayOfWeek; i++) {
      const prevMonthDay = new Date(year, month, -i);
      days.unshift({
        date: prevMonthDay,
        isCurrentMonth: false,
        dayNumber: prevMonthDay.getDate()
      });
    }
    
    // Jours du mois courant
    for (let day = 1; day <= daysInMonth; day++) {
      days.push({
        date: new Date(year, month, day),
        isCurrentMonth: true,
        dayNumber: day
      });
    }
    
    // Jours du mois suivant pour compléter la dernière semaine
    const remainingDays = 42 - days.length; // 6 semaines de 7 jours
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false,
        dayNumber: i
      });
    }
    
    return days;
  };

  // Obtenir les inspections pour une date donnée
  const getInspectionsForDay = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    
    return inspections.filter(insp => {
      const inspDate = insp.date_inspection?.split('T')[0];
      if (inspDate !== dateStr) return false;
      
      // Filtrer par risque
      if (filtreRisque !== 'tous') {
        const batiment = batiments.find(b => b.id === insp.batiment_id);
        if (!batiment || batiment.niveau_risque !== filtreRisque) return false;
      }
      
      // Filtrer par préventionniste
      if (filtrePreventionniste !== 'tous') {
        if (insp.preventionniste_id !== filtrePreventionniste) return false;
      }
      
      return true;
    });
  };

  // Couleur selon le statut de l'inspection
  const getCouleurStatutInspection = (inspection) => {
    if (!inspection || !inspection.statut) {
      return '#ef4444'; // Rouge - À faire
    }
    
    const statut = inspection.statut.toLowerCase();
    
    // Vert - Complété
    if (statut === 'valide' || statut === 'validé' || statut === 'complété') {
      return '#22c55e';
    }
    
    // Orange - En cours
    if (statut === 'absent' || statut === 'non_disponible' || statut === 'personne_mineure') {
      return '#f97316';
    }
    
    // Rouge - À faire (brouillon, etc.)
    return '#ef4444';
  };

  // Navigation mois
  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const monthName = currentDate.toLocaleDateString('fr-CA', { month: 'long', year: 'numeric' });
  const days = getDaysInMonth(currentDate);

  // Statistiques du mois
  const statsMonth = inspections.filter(insp => {
    const inspDate = new Date(insp.date_inspection);
    return inspDate.getMonth() === currentDate.getMonth() &&
           inspDate.getFullYear() === currentDate.getFullYear();
  });

  const statsEnRetard = statsMonth.filter(insp => {
    const inspDate = new Date(insp.date_inspection);
    return inspDate < new Date() && !insp.statut_conformite;
  });

  if (loading) {
    return <div style={{padding: '2rem', textAlign: 'center'}}>Chargement du calendrier...</div>;
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      {/* Header avec navigation et filtres */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1.5rem',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <Button onClick={prevMonth} variant="outline">◀</Button>
          <h2 style={{ 
            fontSize: '1.5rem', 
            fontWeight: '600',
            textTransform: 'capitalize',
            margin: 0
          }}>
            {monthName}
          </h2>
          <Button onClick={nextMonth} variant="outline">▶</Button>
          <Button onClick={goToToday} variant="outline">Aujourd'hui</Button>
        </div>

        {/* Filtres */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={filtreRisque}
            onChange={(e) => setFiltreRisque(e.target.value)}
            style={{
              padding: '0.5rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              fontSize: '0.875rem'
            }}
          >
            <option value="tous">Tous les risques</option>
            <option value="Faible">Faible</option>
            <option value="Moyen">Moyen</option>
            <option value="Élevé">Élevé</option>
            <option value="Très élevé">Très élevé</option>
          </select>

          <select
            value={filtrePreventionniste}
            onChange={(e) => setFiltrePreventionniste(e.target.value)}
            style={{
              padding: '0.5rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              fontSize: '0.875rem'
            }}
          >
            <option value="tous">Tous les préventionnistes</option>
            {preventionnistes.map(prev => (
              <option key={prev.id} value={prev.id}>
                {prev.prenom} {prev.nom}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Statistiques du mois */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        <Card style={{ padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: '700', color: '#2563eb' }}>
            {statsMonth.length}
          </div>
          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            Inspections ce mois
          </div>
        </Card>

        <Card style={{ padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: '700', color: '#ef4444' }}>
            {statsEnRetard.length}
          </div>
          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            En retard
          </div>
        </Card>

        <Card style={{ padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: '700', color: '#10b981' }}>
            {statsMonth.filter(i => i.statut_conformite === 'Conforme').length}
          </div>
          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            Conformes
          </div>
        </Card>
      </div>

      {/* Calendrier */}
      <Card style={{ padding: '1rem', background: 'white' }}>
        {/* En-têtes jours de la semaine */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '4px',
          marginBottom: '0.5rem'
        }}>
          {['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'].map(day => (
            <div key={day} style={{
              textAlign: 'center',
              fontWeight: '600',
              fontSize: '0.875rem',
              padding: '0.5rem',
              color: '#6b7280'
            }}>
              {day}
            </div>
          ))}
        </div>

        {/* Grille des jours */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '4px'
        }}>
          {days.map((day, index) => {
            const dayInspections = getInspectionsForDay(day.date);
            const isToday = day.date.toDateString() === new Date().toDateString();
            
            return (
              <div
                key={index}
                onClick={() => day.isCurrentMonth && handleDayClick(day.date)}
                style={{
                  minHeight: '100px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  padding: '0.5rem',
                  background: !day.isCurrentMonth ? '#f9fafb' : 
                             isToday ? '#dbeafe' : 'white',
                  opacity: day.isCurrentMonth ? 1 : 0.5,
                  cursor: day.isCurrentMonth ? 'pointer' : 'default',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => day.isCurrentMonth && (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)')}
                onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
              >
                <div style={{
                  fontSize: '0.875rem',
                  fontWeight: isToday ? '700' : '500',
                  color: isToday ? '#2563eb' : '#374151',
                  marginBottom: '0.25rem'
                }}>
                  {day.dayNumber}
                </div>

                {/* Inspections du jour */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {dayInspections.slice(0, 3).map(insp => {
                    const batiment = batiments.find(b => b.id === insp.batiment_id);
                    const couleur = getCouleurStatutInspection(insp);
                    
                    return (
                      <div
                        key={insp.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (batiment && openBatimentModal) {
                            openBatimentModal(batiment);
                          }
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.opacity = '0.8';
                          e.currentTarget.style.transform = 'scale(1.02)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.opacity = '1';
                          e.currentTarget.style.transform = 'scale(1)';
                        }}
                        title={`${batiment?.nom_etablissement || 'Inspection'}\n${batiment?.adresse_civique || ''}\nStatut: ${insp.statut || 'À faire'}`}
                        style={{
                          fontSize: '0.7rem',
                          padding: '2px 4px',
                          borderRadius: '3px',
                          background: couleur,
                          color: 'white',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        {batiment?.nom_etablissement?.substring(0, 15) || 'Inspection'}
                      </div>
                    );
                  })}
                  {dayInspections.length > 3 && (
                    <div style={{
                      fontSize: '0.65rem',
                      color: '#6b7280',
                      textAlign: 'center'
                    }}>
                      +{dayInspections.length - 3}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Légende */}
      <div style={{
        display: 'flex',
        gap: '1.5rem',
        marginTop: '1rem',
        fontSize: '0.875rem',
        justifyContent: 'center',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '16px', height: '16px', background: '#ef4444', borderRadius: '3px' }}></div>
          <span>À faire</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '16px', height: '16px', background: '#f97316', borderRadius: '3px' }}></div>
          <span>En cours</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '16px', height: '16px', background: '#22c55e', borderRadius: '3px' }}></div>
          <span>Complété</span>
        </div>
      </div>

      {/* Modal de création d'inspection */}
      {showCreateModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }} onClick={() => setShowCreateModal(false)}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '2rem',
            maxWidth: '500px',
            width: '90%',
            maxHeight: '90vh',
            overflow: 'auto'
          }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1.5rem', color: '#111827' }}>
              📅 Planifier une inspection
            </h2>
            
            <p style={{ color: '#6b7280', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
              Date: <strong>{selectedDate?.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong>
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Bâtiment */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                  Bâtiment *
                </label>
                <select
                  value={newInspection.batiment_id}
                  onChange={(e) => setNewInspection({...newInspection, batiment_id: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    fontSize: '0.875rem'
                  }}
                >
                  <option value="">Sélectionner un bâtiment</option>
                  {batiments.map(bat => (
                    <option key={bat.id} value={bat.id}>
                      {bat.nom_etablissement} - {bat.adresse_civique}
                    </option>
                  ))}
                </select>
              </div>

              {/* Grille d'inspection */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                  Grille d'inspection *
                </label>
                <select
                  value={newInspection.grille_inspection_id}
                  onChange={(e) => setNewInspection({...newInspection, grille_inspection_id: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    fontSize: '0.875rem'
                  }}
                >
                  <option value="">Sélectionner une grille</option>
                  {grilles.map(grille => (
                    <option key={grille.id} value={grille.id}>
                      {grille.nom}
                    </option>
                  ))}
                </select>
              </div>

              {/* Préventionniste */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                  Préventionniste <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>(optionnel)</span>
                </label>
                <select
                  value={newInspection.preventionniste_id}
                  onChange={(e) => setNewInspection({...newInspection, preventionniste_id: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    fontSize: '0.875rem'
                  }}
                >
                  <option value="">Non assigné - Disponible pour tous</option>
                  {preventionnistes.map(prev => (
                    <option key={prev.id} value={prev.id}>
                      {prev.prenom} {prev.nom}
                    </option>
                  ))}
                </select>
              </div>

              {/* Heure de début */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                  Heure de début
                </label>
                <input
                  type="time"
                  value={newInspection.heure_debut}
                  onChange={(e) => setNewInspection({...newInspection, heure_debut: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    fontSize: '0.875rem'
                  }}
                />
              </div>

              {/* Type d'inspection */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                  Type d'inspection
                </label>
                <select
                  value={newInspection.type_inspection}
                  onChange={(e) => setNewInspection({...newInspection, type_inspection: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    fontSize: '0.875rem'
                  }}
                >
                  <option value="reguliere">Régulière</option>
                  <option value="suivi">Suivi</option>
                  <option value="plainte">Plainte</option>
                </select>
              </div>
            </div>

            {/* Boutons */}
            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
              <Button
                onClick={() => setShowCreateModal(false)}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                Annuler
              </Button>
              <Button
                onClick={handleCreateInspection}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  background: '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                ✅ Planifier
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendrierInspections;
