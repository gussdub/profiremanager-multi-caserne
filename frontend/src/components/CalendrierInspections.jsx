import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card } from './ui/card';

const CalendrierInspections = ({ tenantSlug, apiGet, user, toast }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [inspections, setInspections] = useState([]);
  const [batiments, setBatiments] = useState([]);
  const [filtreRisque, setFiltreRisque] = useState('tous');
  const [filtrePreventionniste, setFiltrePreventionniste] = useState('tous');
  const [preventionnistes, setPreventionnistes] = useState([]);
  const [loading, setLoading] = useState(false);

  // Charger les données
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [insp, bat, prev] = await Promise.all([
        apiGet(tenantSlug, '/prevention/inspections'),
        apiGet(tenantSlug, '/prevention/batiments'),
        apiGet(tenantSlug, '/prevention/preventionnistes').catch(() => [])
      ]);
      
      setInspections(insp);
      setBatiments(bat);
      setPreventionnistes(prev);
    } catch (error) {
      console.error('Erreur chargement données:', error);
      alert('Erreur: Impossible de charger les données du calendrier');
    } finally {
      setLoading(false);
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

  // Couleur selon le niveau de risque
  const getCouleurRisque = (niveau) => {
    switch (niveau) {
      case 'Faible': return '#10b981';
      case 'Moyen': return '#f59e0b';
      case 'Élevé': return '#ef4444';
      case 'Très élevé': return '#991b1b';
      default: return '#6b7280';
    }
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
                style={{
                  minHeight: '100px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  padding: '0.5rem',
                  background: !day.isCurrentMonth ? '#f9fafb' : 
                             isToday ? '#dbeafe' : 'white',
                  opacity: day.isCurrentMonth ? 1 : 0.5,
                  cursor: 'pointer'
                }}
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
                    const couleur = batiment ? getCouleurRisque(batiment.niveau_risque) : '#6b7280';
                    
                    return (
                      <div
                        key={insp.id}
                        title={batiment?.nom_etablissement || batiment?.adresse_civique || 'Inspection'}
                        style={{
                          fontSize: '0.7rem',
                          padding: '2px 4px',
                          borderRadius: '3px',
                          background: couleur,
                          color: 'white',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
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
          <div style={{ width: '16px', height: '16px', background: '#10b981', borderRadius: '3px' }}></div>
          <span>Risque faible</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '16px', height: '16px', background: '#f59e0b', borderRadius: '3px' }}></div>
          <span>Risque moyen</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '16px', height: '16px', background: '#ef4444', borderRadius: '3px' }}></div>
          <span>Risque élevé</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '16px', height: '16px', background: '#991b1b', borderRadius: '3px' }}></div>
          <span>Risque très élevé</span>
        </div>
      </div>
    </div>
  );
};

export default CalendrierInspections;
