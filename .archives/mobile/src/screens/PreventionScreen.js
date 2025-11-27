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

export default function PreventionScreen() {
  const { tenant, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState(null);
  const [inspections, setInspections] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      
      // Charger les statistiques
      const statsResponse = await api.get(`/api/${tenant.slug}/prevention/dashboard/stats`);
      setStats(statsResponse.data);

      // Charger les inspections récentes
      const inspectionsResponse = await api.get(`/api/${tenant.slug}/prevention/inspections?limit=10`);
      setInspections(inspectionsResponse.data || []);
    } catch (error) {
      console.error('Erreur chargement prévention:', error);
      Alert.alert('Erreur', 'Impossible de charger les données de prévention');
    } finally {
      setLoading(false);
    }
  }

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
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
        {stats && (
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <Ionicons name="business-outline" size={32} color={PRIMARY_COLOR} />
              <Text style={styles.statValue}>{stats.total_batiments || 0}</Text>
              <Text style={styles.statLabel}>Bâtiments</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="clipboard-outline" size={32} color={PRIMARY_COLOR} />
              <Text style={styles.statValue}>{stats.total_inspections || 0}</Text>
              <Text style={styles.statLabel}>Inspections</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="alert-circle-outline" size={32} color={PRIMARY_COLOR} />
              <Text style={styles.statValue}>{stats.non_conformites_ouvertes || 0}</Text>
              <Text style={styles.statLabel}>Non-conform.</Text>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Inspections récentes</Text>
          {inspections.length > 0 ? (
            inspections.map((inspection) => (
              <View key={inspection.id} style={styles.inspectionCard}>
                <View style={styles.inspectionHeader}>
                  <Text style={styles.inspectionBatiment}>
                    {inspection.batiment?.nom_etablissement || 'Bâtiment'}
                  </Text>
                  <View style={[
                    styles.statusBadge,
                    { backgroundColor: getStatusColor(inspection.statut) }
                  ]}>
                    <Text style={styles.statusText}>{getStatusLabel(inspection.statut)}</Text>
                  </View>
                </View>
                <Text style={styles.inspectionDate}>
                  {new Date(inspection.date_inspection).toLocaleDateString('fr-FR')}
                </Text>
                <Text style={styles.inspectionType}>
                  {inspection.grille?.nom || 'Inspection'}
                </Text>
                {inspection.non_conformites_count > 0 && (
                  <Text style={styles.nonConformites}>
                    {inspection.non_conformites_count} non-conformité(s)
                  </Text>
                )}
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="clipboard-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>Aucune inspection</Text>
            </View>
          )}
        </View>

        <View style={styles.quickActions}>
          <Text style={styles.sectionTitle}>Actions rapides</Text>
          <TouchableOpacity style={styles.actionButton}>
            <Ionicons name="add-circle" size={24} color={PRIMARY_COLOR} />
            <Text style={styles.actionText}>Nouvelle inspection</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton}>
            <Ionicons name="calendar" size={24} color={PRIMARY_COLOR} />
            <Text style={styles.actionText}>Calendrier</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton}>
            <Ionicons name="stats-chart" size={24} color={PRIMARY_COLOR} />
            <Text style={styles.actionText}>Rapports</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function getStatusColor(statut) {
  const colors = {
    'en_cours': '#ff9800',
    'terminee': '#4caf50',
    'approuvee': '#2196f3',
  };
  return colors[statut] || '#999';
}

function getStatusLabel(statut) {
  const labels = {
    'en_cours': 'En cours',
    'terminee': 'Terminée',
    'approuvee': 'Approuvée',
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
  content: {
    flex: 1,
    padding: 15,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginHorizontal: 5,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: PRIMARY_COLOR,
    marginTop: 10,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 5,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  inspectionCard: {
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
  inspectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  inspectionBatiment: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  inspectionDate: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  inspectionType: {
    fontSize: 13,
    color: '#999',
  },
  nonConformites: {
    fontSize: 12,
    color: PRIMARY_COLOR,
    marginTop: 8,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    marginTop: 10,
  },
  quickActions: {
    marginBottom: 20,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
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
  actionText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 15,
    fontWeight: '600',
  },
});
