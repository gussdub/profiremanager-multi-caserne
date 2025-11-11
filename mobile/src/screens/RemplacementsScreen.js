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

export default function RemplacementsScreen() {
  const { tenant, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [propositions, setPropositions] = useState([]);
  const [mesRemplacements, setMesRemplacements] = useState([]);
  const [activeTab, setActiveTab] = useState('propositions');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      // Charger les propositions de remplacement
      const propResponse = await api.get(`/api/${tenant.slug}/remplacements/propositions`);
      setPropositions(propResponse.data || []);

      // Charger mes remplacements acceptés
      const mesResponse = await api.get(`/api/${tenant.slug}/remplacements?user_id=${user.id}`);
      setMesRemplacements(mesResponse.data || []);
    } catch (error) {
      console.error('Erreur chargement remplacements:', error);
    } finally {
      setLoading(false);
    }
  }

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleAccept = async (remplacementId) => {
    Alert.alert(
      'Confirmer',
      'Êtes-vous sûr de vouloir accepter ce remplacement ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Accepter',
          onPress: async () => {
            try {
              await api.put(`/api/${tenant.slug}/remplacements/${remplacementId}/accepter`);
              Alert.alert('Succès', 'Remplacement accepté !');
              loadData();
            } catch (error) {
              Alert.alert('Erreur', error.response?.data?.detail || 'Impossible d\'accepter le remplacement');
            }
          },
        },
      ]
    );
  };

  const handleRefuse = async (remplacementId) => {
    Alert.alert(
      'Confirmer',
      'Êtes-vous sûr de vouloir refuser ce remplacement ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Refuser',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.put(`/api/${tenant.slug}/remplacements/${remplacementId}/refuser`);
              Alert.alert('Succès', 'Remplacement refusé');
              loadData();
            } catch (error) {
              Alert.alert('Erreur', 'Impossible de refuser le remplacement');
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

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'propositions' && styles.tabActive]}
          onPress={() => setActiveTab('propositions')}
        >
          <Text style={[styles.tabText, activeTab === 'propositions' && styles.tabTextActive]}>
            Propositions
          </Text>
          {propositions.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{propositions.length}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'mes' && styles.tabActive]}
          onPress={() => setActiveTab('mes')}
        >
          <Text style={[styles.tabText, activeTab === 'mes' && styles.tabTextActive]}>
            Mes remplacements
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {activeTab === 'propositions' ? (
          propositions.length > 0 ? (
            propositions.map((remplacement) => (
              <View key={remplacement.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.priorityBadge}>
                    <Text style={styles.priorityText}>
                      {remplacement.priorite === 'urgent' ? '⚠️ Urgent' : 'Normal'}
                    </Text>
                  </View>
                  <Text style={styles.dateText}>
                    {new Date(remplacement.date).toLocaleDateString('fr-FR')}
                  </Text>
                </View>
                <Text style={styles.typeGarde}>{remplacement.type_garde?.nom || 'Garde'}</Text>
                <Text style={styles.timeText}>
                  {remplacement.heure_debut} - {remplacement.heure_fin}
                </Text>
                {remplacement.raison && (
                  <Text style={styles.raison}>Raison: {remplacement.raison}</Text>
                )}
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.button, styles.refuseButton]}
                    onPress={() => handleRefuse(remplacement.id)}
                  >
                    <Ionicons name="close" size={20} color="#fff" />
                    <Text style={styles.buttonText}>Refuser</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.button, styles.acceptButton]}
                    onPress={() => handleAccept(remplacement.id)}
                  >
                    <Ionicons name="checkmark" size={20} color="#fff" />
                    <Text style={styles.buttonText}>Accepter</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="mail-open-outline" size={64} color="#ccc" />
              <Text style={styles.emptyText}>Aucune proposition</Text>
            </View>
          )
        ) : (
          mesRemplacements.length > 0 ? (
            mesRemplacements.map((remplacement) => (
              <View key={remplacement.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(remplacement.statut) }]}>
                    <Text style={styles.statusText}>{getStatusLabel(remplacement.statut)}</Text>
                  </View>
                  <Text style={styles.dateText}>
                    {new Date(remplacement.date).toLocaleDateString('fr-FR')}
                  </Text>
                </View>
                <Text style={styles.typeGarde}>{remplacement.type_garde?.nom || 'Garde'}</Text>
                <Text style={styles.timeText}>
                  {remplacement.heure_debut} - {remplacement.heure_fin}
                </Text>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="list-outline" size={64} color="#ccc" />
              <Text style={styles.emptyText}>Aucun remplacement</Text>
            </View>
          )
        )}
      </ScrollView>
    </View>
  );
}

function getStatusColor(statut) {
  const colors = {
    'en_attente': '#ff9800',
    'en_cours': '#2196f3',
    'accepte': '#4caf50',
    'expiree': '#999',
    'annulee': '#f44336',
  };
  return colors[statut] || '#999';
}

function getStatusLabel(statut) {
  const labels = {
    'en_attente': 'En attente',
    'en_cours': 'En cours',
    'accepte': 'Accepté',
    'expiree': 'Expirée',
    'annulee': 'Annulée',
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
    alignItems: 'center',
    marginBottom: 10,
  },
  priorityBadge: {
    backgroundColor: '#fff3cd',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
  },
  priorityText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#856404',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  dateText: {
    fontSize: 14,
    color: '#666',
  },
  typeGarde: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  timeText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  raison: {
    fontSize: 13,
    color: '#999',
    marginTop: 5,
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    marginTop: 15,
    gap: 10,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 5,
  },
  acceptButton: {
    backgroundColor: '#4caf50',
  },
  refuseButton: {
    backgroundColor: '#f44336',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
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
