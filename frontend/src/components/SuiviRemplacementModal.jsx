import React, { useState, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { apiGet } from '../utils/api';
import { X, Mail, MessageSquare, Bell, Clock, CheckCircle, XCircle, HelpCircle, User, Users, RefreshCw, Info, ChevronDown, ChevronUp, Shield, AlertTriangle } from 'lucide-react';

/**
 * Modal de suivi détaillé d'une demande de remplacement
 * Affiche la timeline des contacts, les canaux utilisés et les réponses
 * Auto-actualisation toutes les 30 secondes
 */
const SuiviRemplacementModal = ({ demande, tenantSlug, onClose, users = [] }) => {
  const [suivi, setSuivi] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  const fetchSuivi = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const data = await apiGet(tenantSlug, `/remplacements/${demande.id}/suivi`);
      setSuivi(data);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Erreur chargement suivi:', err);
      setError('Impossible de charger le suivi');
      // Fallback: utiliser les données de la demande si disponibles
      if (demande.tentatives_historique) {
        setSuivi({
          demande_id: demande.id,
          statut: demande.statut,
          tentatives: demande.tentatives_historique || [],
          notifications_envoyees: {
            email: demande.tentatives_historique?.length || 0,
            sms: demande.tentatives_historique?.length || 0,
            push: demande.tentatives_historique?.length || 0
          }
        });
        setError(null);
      }
    } finally {
      setLoading(false);
    }
  }, [demande?.id, demande?.tentatives_historique, demande?.statut, tenantSlug]);

  useEffect(() => {
    if (demande?.id) {
      fetchSuivi();
      
      // Auto-actualisation toutes les 30 secondes
      const interval = setInterval(() => {
        fetchSuivi(false); // false = ne pas afficher le loading spinner
      }, 30000);
      
      return () => clearInterval(interval);
    }
  }, [demande?.id, fetchSuivi]);

  const getUserName = (userId) => {
    const user = users.find(u => u.id === userId);
    return user ? `${user.prenom} ${user.nom}` : userId;
  };

  const getStatutIcon = (statut) => {
    switch (statut) {
      case 'accepted':
        return <CheckCircle size={18} className="text-green-500" />;
      case 'refused':
        return <XCircle size={18} className="text-red-500" />;
      case 'contacted':
        return <Clock size={18} className="text-blue-500" />;
      case 'expired':
        return <HelpCircle size={18} className="text-gray-400" />;
      default:
        return <Clock size={18} className="text-gray-400" />;
    }
  };

  const getStatutLabel = (statut) => {
    switch (statut) {
      case 'accepted':
        return 'Accepté';
      case 'refused':
        return 'Refusé';
      case 'contacted':
        return 'En attente de réponse';
      case 'expired':
        return 'Pas de réponse (expiré)';
      default:
        return statut;
    }
  };

  const getStatutColor = (statut) => {
    switch (statut) {
      case 'accepted':
        return '#22C55E';
      case 'refused':
        return '#EF4444';
      case 'contacted':
        return '#3B82F6';
      case 'expired':
        return '#9CA3AF';
      default:
        return '#6B7280';
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div 
      className="modal-overlay" 
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px'
      }}
    >
      <div 
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          maxWidth: '700px',
          width: '100%',
          maxHeight: '85vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #E5E7EB',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)'
        }}>
          <div>
            <h2 style={{ margin: 0, color: 'white', fontSize: '1.25rem', fontWeight: '600' }}>
              📋 Suivi de la demande
            </h2>
            <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.9)', fontSize: '0.9rem' }}>
              Demande du {formatDate(demande.created_at)?.split(' ')[0]}
            </p>
          </div>
          <button 
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '8px',
              padding: '8px',
              cursor: 'pointer',
              color: 'white'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#6B7280' }}>
              <div className="spinner" style={{ margin: '0 auto 16px' }}></div>
              Chargement du suivi...
            </div>
          ) : error ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#EF4444' }}>
              {error}
            </div>
          ) : (
            <>
              {/* Résumé */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '12px',
                marginBottom: '24px'
              }}>
                <div style={{
                  background: '#F0F9FF',
                  borderRadius: '12px',
                  padding: '16px',
                  textAlign: 'center'
                }}>
                  <Users size={24} style={{ color: '#3B82F6', marginBottom: '8px' }} />
                  <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1E40AF' }}>
                    {suivi?.tentatives?.length || 0}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#6B7280' }}>Personnes contactées</div>
                </div>
                
                <div style={{
                  background: '#F0FDF4',
                  borderRadius: '12px',
                  padding: '16px',
                  textAlign: 'center'
                }}>
                  <Mail size={24} style={{ color: '#22C55E', marginBottom: '8px' }} />
                  <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#166534' }}>
                    {suivi?.notifications_envoyees?.email || 0}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#6B7280' }}>Emails envoyés</div>
                </div>
                
                <div style={{
                  background: '#FEF3C7',
                  borderRadius: '12px',
                  padding: '16px',
                  textAlign: 'center'
                }}>
                  <MessageSquare size={24} style={{ color: '#F59E0B', marginBottom: '8px' }} />
                  <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#B45309' }}>
                    {suivi?.notifications_envoyees?.sms || 0}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#6B7280' }}>SMS envoyés</div>
                </div>
                
                <div style={{
                  background: '#F5F3FF',
                  borderRadius: '12px',
                  padding: '16px',
                  textAlign: 'center'
                }}>
                  <Bell size={24} style={{ color: '#8B5CF6', marginBottom: '8px' }} />
                  <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#6D28D9' }}>
                    {suivi?.notifications_envoyees?.push || 0}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#6B7280' }}>Push envoyés</div>
                </div>
              </div>

              {/* Timeline des contacts */}
              <h3 style={{ 
                fontSize: '1rem', 
                fontWeight: '600', 
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <Clock size={18} /> Historique des contacts
              </h3>

              {suivi?.tentatives?.length > 0 ? (
                <div style={{ position: 'relative' }}>
                  {/* Ligne verticale de timeline */}
                  <div style={{
                    position: 'absolute',
                    left: '15px',
                    top: '24px',
                    bottom: '24px',
                    width: '2px',
                    background: '#E5E7EB'
                  }} />

                  {suivi.tentatives.map((tentative, index) => (
                    <div 
                      key={index}
                      style={{
                        display: 'flex',
                        gap: '16px',
                        marginBottom: '16px',
                        position: 'relative'
                      }}
                    >
                      {/* Point de timeline */}
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: 'white',
                        border: `3px solid ${getStatutColor(tentative.statut)}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        zIndex: 1
                      }}>
                        {getStatutIcon(tentative.statut)}
                      </div>

                      {/* Carte de contact */}
                      <div style={{
                        flex: 1,
                        background: '#F9FAFB',
                        borderRadius: '12px',
                        padding: '16px',
                        border: '1px solid #E5E7EB'
                      }}>
                        <div style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'flex-start',
                          marginBottom: '8px'
                        }}>
                          <div>
                            <div style={{ 
                              fontWeight: '600', 
                              fontSize: '1rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }}>
                              <User size={16} />
                              {tentative.nom_complet || getUserName(tentative.user_id)}
                            </div>
                            <div style={{ fontSize: '0.85rem', color: '#6B7280', marginTop: '2px' }}>
                              Contacté le {formatDate(tentative.date_contact)}
                            </div>
                          </div>
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: '20px',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            background: getStatutColor(tentative.statut),
                            color: 'white'
                          }}>
                            {getStatutLabel(tentative.statut)}
                          </span>
                        </div>

                        {/* Canaux de notification */}
                        <div style={{ 
                          display: 'flex', 
                          gap: '8px', 
                          marginTop: '12px',
                          flexWrap: 'wrap'
                        }}>
                          {tentative.email_envoye !== false && (
                            <span style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 8px',
                              background: '#DCFCE7',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              color: '#166534'
                            }}>
                              <Mail size={12} /> Email ✓
                            </span>
                          )}
                          {tentative.sms_envoye !== false && (
                            <span style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 8px',
                              background: '#FEF9C3',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              color: '#854D0E'
                            }}>
                              <MessageSquare size={12} /> SMS ✓
                            </span>
                          )}
                          {tentative.push_envoye !== false && (
                            <span style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 8px',
                              background: '#EDE9FE',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              color: '#5B21B6'
                            }}>
                              <Bell size={12} /> Push ✓
                            </span>
                          )}
                        </div>

                        {/* Date limite ou date de réponse */}
                        {tentative.date_reponse && (
                          <div style={{ 
                            marginTop: '12px', 
                            fontSize: '0.85rem', 
                            color: tentative.statut === 'accepted' ? '#166534' : 
                                   tentative.statut === 'refused' ? '#991B1B' : '#6B7280',
                            fontStyle: 'italic'
                          }}>
                            {tentative.statut === 'accepted' ? 
                              `A accepté le ${formatDate(tentative.date_reponse)}` :
                             tentative.statut === 'refused' ? 
                              `A refusé le ${formatDate(tentative.date_reponse)}` :
                              `Devait répondre avant le ${formatDate(tentative.date_reponse)}`
                            }
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{
                  textAlign: 'center',
                  padding: '32px',
                  background: '#F9FAFB',
                  borderRadius: '12px',
                  color: '#6B7280'
                }}>
                  <Users size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
                  <p>Aucun contact effectué pour le moment</p>
                  <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>
                    La recherche de remplaçants n'a pas encore démarré ou est en attente.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #E5E7EB',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Button 
              onClick={() => fetchSuivi(true)} 
              variant="ghost" 
              size="sm"
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Actualiser
            </Button>
            {lastUpdate && (
              <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
                Mis à jour: {lastUpdate.toLocaleTimeString('fr-FR')}
              </span>
            )}
          </div>
          <Button onClick={onClose} variant="outline">
            Fermer
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SuiviRemplacementModal;
