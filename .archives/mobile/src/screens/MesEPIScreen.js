import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const PRIMARY_COLOR = '#D9072B';

export default function MesEPIScreen() {
  const { tenant, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [epis, setEpis] = useState([]);

  useEffect(() => {
    loadEPIs();
  }, []);

  async function loadEPIs() {
    try {
      setLoading(true);
      const response = await api.get(`/api/${tenant.slug}/epi/employe/${user.id}`);
      setEpis(response.data || []);
    } catch (error) {
      console.error('Erreur chargement EPIs:', error);
      Alert.alert('Erreur', 'Impossible de charger vos équipements');
    } finally {
      setLoading(false);
    }
  }

  const onRefresh = async () => {
    setRefreshing(true);
    await loadEPIs();
    setRefreshing(false);
  };

  const getStatutColor = (statut) => {
    const colors = {
      'bon': '#4caf50',
      'usage': '#ff9800',
      'remplacer': '#f44336',
      'retire': '#999',
    };
    return colors[statut] || '#999';
  };

  const getTypeIcon = (type) => {
    const icons = {
      'casque': 'hardware-chip',
      'bottes': 'footsteps',
      'gants': 'hand-left',
      'veste': 'shirt',
      'pantalon': 'body',
      'masque': 'medical',
    };
    return icons[type?.toLowerCase()] || 'cube';
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={PRIMARY_COLOR} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {epis.length > 0 ? (
        epis.map((epi) => (
          <View key={epi.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.iconContainer}>
                <Ionicons name={getTypeIcon(epi.type_epi)} size={32} color={PRIMARY_COLOR} />
              </View>
              <View style={styles.epiInfo}>
                <Text style={styles.epiType}>{epi.type_epi}</Text>
                {epi.marque && <Text style={styles.epiMarque}>{epi.marque} {epi.modele}</Text>}
              </View>
              <View style={[styles.statutBadge, { backgroundColor: getStatutColor(epi.statut) }]}>
                <Text style={styles.statutText}>{epi.statut}</Text>
              </View>
            </View>

            <View style={styles.detailsContainer}>
              {epi.taille && (
                <View style={styles.detailRow}>
                  <Ionicons name="resize-outline" size={16} color="#666" />
                  <Text style={styles.detailLabel}>Taille :</Text>
                  <Text style={styles.detailValue}>{epi.taille}</Text>
                </View>
              )}
              {epi.numero_serie && (
                <View style={styles.detailRow}>
                  <Ionicons name="barcode-outline" size={16} color="#666" />
                  <Text style={styles.detailLabel}>N° Série :</Text>
                  <Text style={styles.detailValue}>{epi.numero_serie}</Text>
                </View>
              )}
              {epi.date_mise_en_service && (
                <View style={styles.detailRow}>
                  <Ionicons name="calendar-outline" size={16} color="#666" />
                  <Text style={styles.detailLabel}>Mise en service :</Text>
                  <Text style={styles.detailValue}>
                    {new Date(epi.date_mise_en_service).toLocaleDateString('fr-FR')}
                  </Text>
                </View>
              )}
              {epi.norme_certification && (
                <View style={styles.detailRow}>
                  <Ionicons name="shield-checkmark-outline" size={16} color="#666" />
                  <Text style={styles.detailLabel}>Norme :</Text>
                  <Text style={styles.detailValue}>{epi.norme_certification}</Text>
                </View>
              )}
            </View>

            {epi.notes && (
              <View style={styles.notesContainer}>
                <Text style={styles.notesText}>{epi.notes}</Text>
              </View>
            )}
          </View>
        ))
      ) : (
        <View style={styles.emptyState}>
          <Ionicons name="shirt-outline" size={64} color="#ccc" />
          <Text style={styles.emptyText}>Aucun équipement assigné</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 15,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  epiInfo: {
    flex: 1,
  },
  epiType: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    textTransform: 'capitalize',
  },
  epiMarque: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  statutBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
  },
  statutText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
    textTransform: 'capitalize',
  },
  detailsContainer: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 13,
    color: '#666',
    marginLeft: 8,
    width: 120,
  },
  detailValue: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
    flex: 1,
  },
  notesContainer: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 6,
  },
  notesText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
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
