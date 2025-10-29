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
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const PRIMARY_COLOR = '#D9072B';

export default function DisponibilitesScreen() {
  const { tenant, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disponibilites, setDisponibilites] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedType, setSelectedType] = useState('disponible');
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    loadDisponibilites();
  }, []);

  async function loadDisponibilites() {
    try {
      setLoading(true);
      const response = await api.get(`/api/${tenant.slug}/disponibilites/user/${user.id}`);
      setDisponibilites(response.data || []);
    } catch (error) {
      console.error('Erreur chargement disponibilités:', error);
      Alert.alert('Erreur', 'Impossible de charger les disponibilités');
    } finally {
      setLoading(false);
    }
  }

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDisponibilites();
    setRefreshing(false);
  };

  const handleSubmit = async () => {
    try {
      const data = {
        user_id: user.id,
        date: selectedDate.toISOString().split('T')[0],
        statut: selectedType,
        heure_debut: '00:00',
        heure_fin: '23:59',
        origine: 'manuelle',
      };

      await api.post(`/api/${tenant.slug}/disponibilites`, data);
      Alert.alert('Succès', 'Disponibilité ajoutée avec succès');
      setModalVisible(false);
      loadDisponibilites();
    } catch (error) {
      console.error('Erreur ajout disponibilité:', error);
      Alert.alert('Erreur', error.response?.data?.detail || 'Impossible d\'ajouter la disponibilité');
    }
  };

  const handleDelete = async (id) => {
    Alert.alert(
      'Confirmer',
      'Êtes-vous sûr de vouloir supprimer cette disponibilité ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/api/${tenant.slug}/disponibilites/${id}`);
              Alert.alert('Succès', 'Disponibilité supprimée');
              loadDisponibilites();
            } catch (error) {
              Alert.alert('Erreur', 'Impossible de supprimer');
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
      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {disponibilites.length > 0 ? (
          disponibilites.map((dispo) => (
            <View key={dispo.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardDate}>
                    {new Date(dispo.date).toLocaleDateString('fr-FR', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })}
                  </Text>
                  <Text style={styles.cardTime}>
                    {dispo.heure_debut} - {dispo.heure_fin}
                  </Text>
                </View>
                <View style={[
                  styles.statusBadge,
                  dispo.statut === 'disponible' ? styles.statusDisponible : styles.statusIndisponible
                ]}>
                  <Text style={styles.statusText}>
                    {dispo.statut === 'disponible' ? 'Disponible' : 'Indisponible'}
                  </Text>
                </View>
              </View>
              {dispo.origine !== 'manuelle' && (
                <Text style={styles.origineText}>Généré auto ({dispo.origine})</Text>
              )}
              {dispo.origine === 'manuelle' && (
                <TouchableOpacity
                  onPress={() => handleDelete(dispo.id)}
                  style={styles.deleteButton}
                >
                  <Ionicons name="trash-outline" size={20} color="#ff3b30" />
                </TouchableOpacity>
              )}
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>Aucune disponibilité</Text>
          </View>
        )}
      </ScrollView>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setModalVisible(true)}
      >
        <Ionicons name="add" size={30} color="#fff" />
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Nouvelle disponibilité</Text>

            <Text style={styles.label}>Date</Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowDatePicker(true)}
            >
              <Text>{selectedDate.toLocaleDateString('fr-FR')}</Text>
            </TouchableOpacity>

            {showDatePicker && (
              <DateTimePicker
                value={selectedDate}
                mode="date"
                onChange={(event, date) => {
                  setShowDatePicker(false);
                  if (date) setSelectedDate(date);
                }}
              />
            )}

            <Text style={styles.label}>Type</Text>
            <View style={styles.typeButtons}>
              <TouchableOpacity
                style={[
                  styles.typeButton,
                  selectedType === 'disponible' && styles.typeButtonActive,
                ]}
                onPress={() => setSelectedType('disponible')}
              >
                <Text style={[
                  styles.typeButtonText,
                  selectedType === 'disponible' && styles.typeButtonTextActive,
                ]}>Disponible</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.typeButton,
                  selectedType === 'indisponible' && styles.typeButtonActive,
                ]}
                onPress={() => setSelectedType('indisponible')}
              >
                <Text style={[
                  styles.typeButtonText,
                  selectedType === 'indisponible' && styles.typeButtonTextActive,
                ]}>Indisponible</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.submitButton]}
                onPress={handleSubmit}
              >
                <Text style={styles.submitButtonText}>Ajouter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
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
  },
  cardInfo: {
    flex: 1,
  },
  cardDate: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    textTransform: 'capitalize',
  },
  cardTime: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  statusDisponible: {
    backgroundColor: '#e8f5e9',
  },
  statusIndisponible: {
    backgroundColor: '#ffebee',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  origineText: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
    fontStyle: 'italic',
  },
  deleteButton: {
    position: 'absolute',
    top: 15,
    right: 15,
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
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: PRIMARY_COLOR,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    minHeight: 300,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginTop: 10,
    marginBottom: 8,
  },
  dateButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#f9f9f9',
  },
  typeButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  typeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  typeButtonActive: {
    backgroundColor: PRIMARY_COLOR,
    borderColor: PRIMARY_COLOR,
  },
  typeButtonText: {
    color: '#666',
    fontWeight: '600',
  },
  typeButtonTextActive: {
    color: '#fff',
  },
  modalButtons: {
    flexDirection: 'row',
    marginTop: 20,
    gap: 10,
  },
  modalButton: {
    flex: 1,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  submitButton: {
    backgroundColor: PRIMARY_COLOR,
  },
  cancelButtonText: {
    color: '#666',
    fontWeight: '600',
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
