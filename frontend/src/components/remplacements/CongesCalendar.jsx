import React, { useState, useMemo } from 'react';
import { Button } from '../ui/button';
import { ChevronLeft, ChevronRight, Calendar, CalendarDays, X, Check, XCircle } from 'lucide-react';

const typesConge = [
  { value: 'maladie', label: '🏥 Maladie' },
  { value: 'vacances', label: '🏖️ Vacances' },
  { value: 'parental', label: '👶 Parental' },
  { value: 'personnel', label: '👤 Personnel' }
];

const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const DAYS_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

const CongesCalendar = ({
  conges,
  users,
  getUserName,
  onApprouverConge,
  isAdminOrSuperviseur
}) => {
  const [viewMode, setViewMode] = useState('annuel'); // 'annuel' ou 'mensuel'
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [selectedConge, setSelectedConge] = useState(null);
  
  // Filtres
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatut, setFilterStatut] = useState('');

  // Filtrer les congés
  const filteredConges = useMemo(() => {
    return conges.filter(conge => {
      if (filterEmployee && conge.demandeur_id !== filterEmployee) return false;
      if (filterType && conge.type_conge !== filterType) return false;
      if (filterStatut && conge.statut !== filterStatut) return false;
      // Ne montrer que les approuvés et en attente
      if (conge.statut !== 'approuve' && conge.statut !== 'en_attente') return false;
      return true;
    });
  }, [conges, filterEmployee, filterType, filterStatut]);

  // Obtenir les jours d'un mois
  const getDaysInMonth = (year, month) => {
    return new Date(year, month + 1, 0).getDate();
  };

  // Vérifier si une date est dans une période de congé
  const getCongesForDate = (date) => {
    return filteredConges.filter(conge => {
      const debut = new Date(conge.date_debut);
      const fin = new Date(conge.date_fin);
      debut.setHours(0, 0, 0, 0);
      fin.setHours(23, 59, 59, 999);
      return date >= debut && date <= fin;
    });
  };

  // Calculer les barres de congés pour un mois (vue Gantt)
  const getCongesBarsForMonth = (year, month) => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    return filteredConges.filter(conge => {
      const debut = new Date(conge.date_debut);
      const fin = new Date(conge.date_fin);
      // Le congé chevauche ce mois
      return debut <= lastDay && fin >= firstDay;
    }).map(conge => {
      const debut = new Date(conge.date_debut);
      const fin = new Date(conge.date_fin);
      
      // Calculer le début et la fin visibles dans ce mois
      const startDay = debut < firstDay ? 1 : debut.getDate();
      const endDay = fin > lastDay ? lastDay.getDate() : fin.getDate();
      
      return {
        ...conge,
        startDay,
        endDay,
        startsThisMonth: debut >= firstDay,
        endsThisMonth: fin <= lastDay
      };
    });
  };

  // Couleur selon le statut
  const getStatusColor = (statut) => {
    return statut === 'approuve' ? '#22C55E' : '#F59E0B';
  };

  // Navigation
  const navigateYear = (delta) => {
    setCurrentYear(prev => prev + delta);
  };

  const navigateMonth = (delta) => {
    let newMonth = currentMonth + delta;
    let newYear = currentYear;
    
    if (newMonth > 11) {
      newMonth = 0;
      newYear++;
    } else if (newMonth < 0) {
      newMonth = 11;
      newYear--;
    }
    
    setCurrentMonth(newMonth);
    setCurrentYear(newYear);
  };

  // Rendu d'un mois en miniature (vue annuelle)
  const renderMiniMonth = (month) => {
    const daysInMonth = getDaysInMonth(currentYear, month);
    const firstDayOfWeek = new Date(currentYear, month, 1).getDay();
    const congeBars = getCongesBarsForMonth(currentYear, month);
    
    // Grouper les congés par employé pour éviter les chevauchements visuels
    const employeeRows = {};
    congeBars.forEach(conge => {
      const empId = conge.demandeur_id;
      if (!employeeRows[empId]) {
        employeeRows[empId] = [];
      }
      employeeRows[empId].push(conge);
    });

    return (
      <div 
        key={month} 
        className="mini-month"
        onClick={() => {
          setCurrentMonth(month);
          setViewMode('mensuel');
        }}
        style={{
          cursor: 'pointer',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '8px',
          backgroundColor: 'white',
          minHeight: '140px'
        }}
      >
        <div style={{ 
          fontWeight: '600', 
          fontSize: '0.85rem', 
          marginBottom: '8px',
          color: '#374151',
          textAlign: 'center'
        }}>
          {MONTHS_FR[month]}
        </div>
        
        {/* Barres de congés */}
        <div style={{ position: 'relative', minHeight: '60px' }}>
          {Object.entries(employeeRows).map(([empId, empConges], rowIndex) => (
            empConges.map((conge, idx) => {
              const totalDays = daysInMonth;
              const left = ((conge.startDay - 1) / totalDays) * 100;
              const width = ((conge.endDay - conge.startDay + 1) / totalDays) * 100;
              
              return (
                <div
                  key={conge.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedConge(conge);
                  }}
                  title={`${getUserName(conge.demandeur_id)} - ${typesConge.find(t => t.value === conge.type_conge)?.label || conge.type_conge}`}
                  style={{
                    position: 'absolute',
                    top: `${(rowIndex * 16) + 2}px`,
                    left: `${left}%`,
                    width: `${Math.max(width, 3)}%`,
                    height: '12px',
                    backgroundColor: getStatusColor(conge.statut),
                    borderRadius: '3px',
                    opacity: 0.85,
                    cursor: 'pointer',
                    transition: 'opacity 0.2s',
                    border: conge.statut === 'en_attente' ? '1px dashed #000' : 'none'
                  }}
                />
              );
            })
          ))}
        </div>
        
        {/* Compteur */}
        {congeBars.length > 0 && (
          <div style={{ 
            fontSize: '0.7rem', 
            color: '#6b7280', 
            textAlign: 'center',
            marginTop: '4px'
          }}>
            {congeBars.length} congé(s)
          </div>
        )}
      </div>
    );
  };

  // Rendu vue mensuelle détaillée
  const renderMonthlyView = () => {
    const daysInMonth = getDaysInMonth(currentYear, currentMonth);
    const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();
    const congeBars = getCongesBarsForMonth(currentYear, currentMonth);
    
    // Grouper par employé
    const employeeRows = {};
    congeBars.forEach(conge => {
      const empId = conge.demandeur_id;
      if (!employeeRows[empId]) {
        employeeRows[empId] = { name: getUserName(empId), conges: [] };
      }
      employeeRows[empId].conges.push(conge);
    });

    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    return (
      <div style={{ overflowX: 'auto' }}>
        {/* En-tête avec les jours */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: `150px repeat(${daysInMonth}, minmax(28px, 1fr))`,
          gap: '1px',
          backgroundColor: '#e5e7eb',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          overflow: 'hidden'
        }}>
          {/* Header row */}
          <div style={{ 
            backgroundColor: '#f3f4f6', 
            padding: '8px', 
            fontWeight: '600',
            fontSize: '0.8rem'
          }}>
            Employé
          </div>
          {days.map(day => {
            const date = new Date(currentYear, currentMonth, day);
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            const isToday = new Date().toDateString() === date.toDateString();
            
            return (
              <div 
                key={day}
                style={{ 
                  backgroundColor: isToday ? '#DBEAFE' : (isWeekend ? '#f9fafb' : '#f3f4f6'),
                  padding: '4px',
                  textAlign: 'center',
                  fontSize: '0.75rem',
                  fontWeight: isToday ? '700' : '500'
                }}
              >
                <div>{day}</div>
                <div style={{ fontSize: '0.65rem', color: '#9ca3af' }}>
                  {DAYS_FR[date.getDay()]}
                </div>
              </div>
            );
          })}

          {/* Rows par employé */}
          {Object.entries(employeeRows).map(([empId, { name, conges: empConges }]) => (
            <React.Fragment key={empId}>
              <div style={{ 
                backgroundColor: 'white', 
                padding: '8px',
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                fontWeight: '500'
              }}>
                {name}
              </div>
              
              {days.map(day => {
                const congeForDay = empConges.find(c => day >= c.startDay && day <= c.endDay);
                const isStart = congeForDay && day === congeForDay.startDay;
                const isEnd = congeForDay && day === congeForDay.endDay;
                const date = new Date(currentYear, currentMonth, day);
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                
                return (
                  <div 
                    key={day}
                    onClick={() => congeForDay && setSelectedConge(congeForDay)}
                    style={{ 
                      backgroundColor: isWeekend ? '#f9fafb' : 'white',
                      position: 'relative',
                      cursor: congeForDay ? 'pointer' : 'default',
                      minHeight: '32px'
                    }}
                  >
                    {congeForDay && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          left: isStart ? '2px' : '0',
                          right: isEnd ? '2px' : '0',
                          height: '20px',
                          backgroundColor: getStatusColor(congeForDay.statut),
                          borderRadius: isStart && isEnd ? '4px' : (isStart ? '4px 0 0 4px' : (isEnd ? '0 4px 4px 0' : '0')),
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: congeForDay.statut === 'en_attente' ? '1px dashed rgba(0,0,0,0.3)' : 'none'
                        }}
                      >
                        {isStart && (
                          <span style={{ 
                            fontSize: '0.65rem', 
                            color: 'white', 
                            fontWeight: '600',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            padding: '0 4px'
                          }}>
                            {typesConge.find(t => t.value === congeForDay.type_conge)?.label?.split(' ')[0] || ''}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}

          {/* Message si aucun congé */}
          {Object.keys(employeeRows).length === 0 && (
            <>
              <div style={{ 
                backgroundColor: 'white', 
                padding: '20px',
                gridColumn: `span ${daysInMonth + 1}`,
                textAlign: 'center',
                color: '#9ca3af'
              }}>
                Aucun congé pour ce mois
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // Modal de détails du congé
  const renderCongeModal = () => {
    if (!selectedConge) return null;

    return (
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }}
        onClick={() => setSelectedConge(null)}
      >
        <div 
          style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '450px',
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto'
          }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', margin: 0 }}>
              Détails du congé
            </h3>
            <button 
              onClick={() => setSelectedConge(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <X size={20} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>Employé</span>
              <p style={{ fontWeight: '500', margin: '4px 0 0 0' }}>{getUserName(selectedConge.demandeur_id)}</p>
            </div>
            
            <div>
              <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>Type</span>
              <p style={{ fontWeight: '500', margin: '4px 0 0 0' }}>
                {typesConge.find(t => t.value === selectedConge.type_conge)?.label || selectedConge.type_conge}
              </p>
            </div>
            
            <div>
              <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>Période</span>
              <p style={{ fontWeight: '500', margin: '4px 0 0 0' }}>
                {new Date(selectedConge.date_debut).toLocaleDateString('fr-FR')} - {new Date(selectedConge.date_fin).toLocaleDateString('fr-FR')}
                <span style={{ color: '#6b7280', marginLeft: '8px' }}>
                  ({selectedConge.nombre_jours} jour{selectedConge.nombre_jours > 1 ? 's' : ''})
                </span>
              </p>
            </div>
            
            <div>
              <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>Statut</span>
              <p style={{ margin: '4px 0 0 0' }}>
                <span style={{
                  display: 'inline-block',
                  padding: '4px 12px',
                  borderRadius: '20px',
                  backgroundColor: getStatusColor(selectedConge.statut),
                  color: 'white',
                  fontSize: '0.85rem',
                  fontWeight: '500'
                }}>
                  {selectedConge.statut === 'approuve' ? '✅ Approuvé' : '⏳ En attente'}
                </span>
              </p>
            </div>
            
            {selectedConge.raison && (
              <div>
                <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>Raison</span>
                <p style={{ margin: '4px 0 0 0' }}>{selectedConge.raison}</p>
              </div>
            )}
          </div>

          {/* Actions pour approuver/refuser si en attente */}
          {isAdminOrSuperviseur && selectedConge.statut === 'en_attente' && (
            <div style={{ 
              display: 'flex', 
              gap: '8px', 
              marginTop: '20px', 
              paddingTop: '16px',
              borderTop: '1px solid #e5e7eb'
            }}>
              <Button
                onClick={() => {
                  onApprouverConge(selectedConge.id, 'approuver');
                  setSelectedConge(null);
                }}
                style={{ flex: 1, backgroundColor: '#22C55E' }}
              >
                <Check size={16} style={{ marginRight: '4px' }} />
                Approuver
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  onApprouverConge(selectedConge.id, 'refuser');
                  setSelectedConge(null);
                }}
                style={{ flex: 1 }}
              >
                <XCircle size={16} style={{ marginRight: '4px' }} />
                Refuser
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Liste unique des employés ayant des congés
  const employeesWithConges = useMemo(() => {
    const empIds = [...new Set(conges.map(c => c.demandeur_id))];
    return empIds.map(id => ({ id, name: getUserName(id) })).sort((a, b) => a.name.localeCompare(b.name));
  }, [conges, getUserName]);

  return (
    <div style={{ marginTop: '20px' }}>
      {/* Header avec navigation et filtres */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        marginBottom: '16px'
      }}>
        {/* Toggle vue */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button
            variant={viewMode === 'annuel' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('annuel')}
          >
            <Calendar size={16} style={{ marginRight: '4px' }} />
            Vue Annuelle
          </Button>
          <Button
            variant={viewMode === 'mensuel' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('mensuel')}
          >
            <CalendarDays size={16} style={{ marginRight: '4px' }} />
            Vue Mensuelle
          </Button>
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Button variant="outline" size="sm" onClick={() => viewMode === 'annuel' ? navigateYear(-1) : navigateMonth(-1)}>
            <ChevronLeft size={16} />
          </Button>
          <span style={{ fontWeight: '600', minWidth: '150px', textAlign: 'center' }}>
            {viewMode === 'annuel' ? currentYear : `${MONTHS_FR[currentMonth]} ${currentYear}`}
          </span>
          <Button variant="outline" size="sm" onClick={() => viewMode === 'annuel' ? navigateYear(1) : navigateMonth(1)}>
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>

      {/* Filtres */}
      <div style={{ 
        display: 'flex', 
        gap: '12px', 
        marginBottom: '16px',
        flexWrap: 'wrap'
      }}>
        <select
          value={filterEmployee}
          onChange={(e) => setFilterEmployee(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            fontSize: '0.9rem'
          }}
        >
          <option value="">Tous les employés</option>
          {employeesWithConges.map(emp => (
            <option key={emp.id} value={emp.id}>{emp.name}</option>
          ))}
        </select>

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            fontSize: '0.9rem'
          }}
        >
          <option value="">Tous les types</option>
          {typesConge.map(type => (
            <option key={type.value} value={type.value}>{type.label}</option>
          ))}
        </select>

        <select
          value={filterStatut}
          onChange={(e) => setFilterStatut(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            fontSize: '0.9rem'
          }}
        >
          <option value="">Tous les statuts</option>
          <option value="approuve">✅ Approuvés</option>
          <option value="en_attente">⏳ En attente</option>
        </select>
      </div>

      {/* Légende */}
      <div style={{ 
        display: 'flex', 
        gap: '16px', 
        marginBottom: '16px',
        fontSize: '0.85rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '20px', height: '12px', backgroundColor: '#22C55E', borderRadius: '3px' }} />
          <span>Approuvé</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '20px', height: '12px', backgroundColor: '#F59E0B', borderRadius: '3px', border: '1px dashed #000' }} />
          <span>En attente</span>
        </div>
      </div>

      {/* Calendrier */}
      {viewMode === 'annuel' ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '12px'
        }}>
          {Array.from({ length: 12 }, (_, i) => renderMiniMonth(i))}
        </div>
      ) : (
        renderMonthlyView()
      )}

      {/* Modal de détails */}
      {renderCongeModal()}
    </div>
  );
};

export default CongesCalendar;
