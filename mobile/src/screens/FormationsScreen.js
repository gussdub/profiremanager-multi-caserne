import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const PRIMARY_COLOR = '#D9072B';

export default function FormationsScreen() {
  const { tenant, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [formations, setFormations] = useState([]);
  const [mesFormations, setMesFormations] = useState([]);
  const [activeTab, setActiveTab] = useState('disponibles');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      
      // Charger toutes les formations
      const formationsResponse = await api.get(`/api/${tenant.slug}/formations`);
      setFormations(formationsResponse.data || []);

      // Charger mes participations
      const mesFormationsResponse = await api.get(`/api/${tenant.slug}/formations/participations/user/${user.id}`);
      setMesFormations(mesFormationsResponse.data || []);

    } catch (error) {
      console.error('Erreur chargement formations:', error);
      Alert.alert('Erreur', 'Impossible de charger les formations');
    } finally {
      setLoading(false);
    }
  }

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleInscription = async (formationId) => {
    Alert.alert(
      'Inscription',
      'Voulez-vous vous inscrire à cette formation ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: async () => {
            try {
              await api.post(`/api/${tenant.slug}/formations/${formationId}/participer`, {
                user_id: user.id,
                statut: 'inscrit',
              });
              Alert.alert('Succès', 'Inscription confirmée');
              loadData();
            } catch (error) {
              Alert.alert('Erreur', error.response?.data?.detail || 'Impossible de s\'inscrire');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={PRIMARY_COLOR} />
      </View>
    );
  }

  const formationsDisponibles = formations.filter(f => {
    const formationDate = new Date(f.date);
    const today = new Date();
    return formationDate >= today && !mesFormations.find(mf => mf.formation_id === f.id);
  });

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'disponibles' && styles.tabActive]}
          onPress={() => setActiveTab('disponibles')}
        >
          <Text style={[styles.tabText, activeTab === 'disponibles' && styles.tabTextActive]}>
            Disponibles
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'mes' && styles.tabActive]}
          onPress={() => setActiveTab('mes')}
        >
          <Text style={[styles.tabText, activeTab === 'mes' && styles.tabTextActive]}>
            Mes formations
          </Text>
          {mesFormations.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{mesFormations.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {activeTab === 'disponibles' ? (
          formationsDisponibles.length > 0 ? (
            formationsDisponibles.map((formation) => (
              <View key={formation.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.formationTitle}>{formation.nom}</Text>
                  {formation.obligatoire && (
                    <View style={styles.obligatoireBadge}>
                      <Text style={styles.obligatoireText}>Obligatoire</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.formationDescription}>{formation.description}</Text>
                <View style={styles.formationDetails}>
                  <View style={styles.detailRow}>
                    <Ionicons name="calendar-outline" size={16} color="#666" />
                    <Text style={styles.detailText}>
                      {new Date(formation.date).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric'
                      })}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Ionicons name="time-outline" size={16} color="#666" />
                    <Text style={styles.detailText}>{formation.duree_heures}h</Text>
                  </View>
                  {formation.lieu && (
                    <View style={styles.detailRow}>
                      <Ionicons name="location-outline" size={16} color="#666" />
                      <Text style={styles.detailText}>{formation.lieu}</Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.inscriptionButton}
                  onPress={() => handleInscription(formation.id)}
                >
                  <Text style={styles.inscriptionText}>S'inscrire</Text>
                </TouchableOpacity>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="school-outline" size={64} color="#ccc" />
              <Text style={styles.emptyText}>Aucune formation disponible</Text>
            </View>
          )
        ) : (
          mesFormations.length > 0 ? (
            mesFormations.map((participation) => {
              const formation = formations.find(f => f.id === participation.formation_id);
              if (!formation) return null;
              
              return (
                <View key={participation.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.formationTitle}>{formation.nom}</Text>
                    <View style={[
                      styles.statutBadge,
                      { backgroundColor: getStatutColor(participation.statut) }
                    ]}>
                      <Text style={styles.statutText}>{getStatutLabel(participation.statut)}</Text>
                    </View>
                  </View>
                  <View style={styles.formationDetails}>
                    <View style={styles.detailRow}>
                      <Ionicons name="calendar-outline" size={16} color="#666" />
                      <Text style={styles.detailText}>
                        {new Date(formation.date).toLocaleDateString('fr-FR')}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Ionicons name="time-outline" size={16} color="#666" />
                      <Text style={styles.detailText}>{formation.duree_heures}h</Text>
                    </View>
                  </View>
                  {participation.note_obtenue !== null && (
                    <View style={styles.noteContainer}>
                      <Text style={styles.noteLabel}>Note obtenue :</Text>
                      <Text style={styles.noteValue}>{participation.note_obtenue}%</Text>
                    </View>
                  )}
                </View>
              );
            })
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="list-outline" size={64} color="#ccc" />
              <Text style={styles.emptyText}>Aucune formation inscrite</Text>
            </View>
          )
        )}
      </ScrollView>
    </View>
  );
}

function getStatutColor(statut) {
  const colors = {
    'inscrit': '#2196f3',
    'present': '#4caf50',
    'absent': '#f44336',
    'reussi': '#4caf50',
    'echoue': '#f44336',
  };
  return colors[statut] || '#999';
}

function getStatutLabel(statut) {
  const labels = {
    'inscrit': 'Inscrit',
    'present': 'Présent',
    'absent': 'Absent',
    'reussi': 'Réussi',
    'echoue': 'Échoué',
  };
  return labels[statut] || statut;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: PRIMARY_COLOR,
  },
  tabText: {
    fontSize: 16,
    color: '#666',
  },
  tabTextActive: {
    color: PRIMARY_COLOR,
    fontWeight: 'bold',
  },
  badge: {
    backgroundColor: PRIMARY_COLOR,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 5,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    padding: 15,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  formationTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    marginRight: 10,
  },
  obligatoireBadge: {
    backgroundColor: '#ff9800',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  obligatoireText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },
  statutBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statutText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  formationDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 10,
  },
  formationDetails: {
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  detailText: {
    fontSize: 13,
    color: '#666',
    marginLeft: 8,
  },
  inscriptionButton: {
    backgroundColor: PRIMARY_COLOR,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 5,
  },
  inscriptionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  noteContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  noteLabel: {
    fontSize: 14,
    color: '#666',
  },
  noteValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: PRIMARY_COLOR,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 100,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 10,
  },
});
