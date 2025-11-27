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
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const PRIMARY_COLOR = '#D9072B';
const { width } = Dimensions.get('window');

export default function DashboardScreen({ navigation }) {
  const { tenant, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState(null);
  const [mesGardes, setMesGardes] = useState([]);
  const [mesProchainesGardes, setMesProchainesGardes] = useState([]);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      setLoading(true);
      
      // Charger les statistiques du dashboard
      const statsResponse = await api.get(`/api/${tenant.slug}/dashboard/donnees-completes`);
      setStats(statsResponse.data);

      // Charger mes gardes de la semaine actuelle
      const today = new Date();
      const weekStart = getWeekStart(today);
      const assignationsResponse = await api.get(`/api/${tenant.slug}/planning/assignations/${weekStart}`);
      const mesAssignations = assignationsResponse.data.filter(a => a.user_id === user.id);
      setMesGardes(mesAssignations);

      // Mes prochaines gardes (7 prochains jours)
      const nextWeekStart = new Date(weekStart);
      nextWeekStart.setDate(nextWeekStart.getDate() + 7);
      const nextWeekStr = nextWeekStart.toISOString().split('T')[0];
      const nextAssignationsResponse = await api.get(`/api/${tenant.slug}/planning/assignations/${nextWeekStr}`);
      const mesNextAssignations = nextAssignationsResponse.data.filter(a => a.user_id === user.id).slice(0, 3);
      setMesProchainesGardes(mesNextAssignations);

    } catch (error) {
      console.error('Erreur chargement dashboard:', error);
      Alert.alert('Erreur', 'Impossible de charger le tableau de bord');
    } finally {
      setLoading(false);
    }
  }

  function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    return monday.toISOString().split('T')[0];
  }

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboard();
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
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* En-tête */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Bonjour,</Text>
          <Text style={styles.userName}>{user?.prenom} {user?.nom}</Text>
        </View>
        <View style={styles.tenantBadge}>
          <Text style={styles.tenantText}>{tenant?.nom}</Text>
        </View>
      </View>

      {/* Statistiques */}
      {stats && (
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Ionicons name="people" size={28} color={PRIMARY_COLOR} />
            <Text style={styles.statValue}>{stats.personnel_actif || 0}</Text>
            <Text style={styles.statLabel}>Personnel actif</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="calendar" size={28} color={PRIMARY_COLOR} />
            <Text style={styles.statValue}>{stats.gardes_cette_semaine || 0}</Text>
            <Text style={styles.statLabel}>Gardes semaine</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="school" size={28} color={PRIMARY_COLOR} />
            <Text style={styles.statValue}>{stats.formations_planifiees || 0}</Text>
            <Text style={styles.statLabel}>Formations</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="checkmark-circle" size={28} color={PRIMARY_COLOR} />
            <Text style={styles.statValue}>{stats.taux_couverture ? `${stats.taux_couverture}%` : '0%'}</Text>
            <Text style={styles.statLabel}>Couverture</Text>
          </View>
        </View>
      )}

      {/* Mes gardes cette semaine */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Mes gardes cette semaine</Text>
        {mesGardes.length > 0 ? (
          mesGardes.map((garde, idx) => (
            <View key={idx} style={styles.gardeCard}>
              <View style={[styles.gardeBadge, { backgroundColor: garde.type_garde?.couleur || PRIMARY_COLOR }]} />
              <View style={styles.gardeContent}>
                <Text style={styles.gardeDate}>
                  {new Date(garde.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </Text>
                <Text style={styles.gardeType}>{garde.type_garde?.nom || 'Garde'}</Text>
                <Text style={styles.gardeTime}>
                  {garde.heure_debut} - {garde.heure_fin}
                </Text>
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>Aucune garde cette semaine</Text>
        )}
      </View>

      {/* Actions rapides */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Actions rapides</Text>
        <View style={styles.quickActions}>
          <TouchableOpacity 
            style={styles.actionCard}
            onPress={() => navigation?.navigate('Planning')}
          >
            <Ionicons name="calendar-outline" size={32} color={PRIMARY_COLOR} />
            <Text style={styles.actionText}>Planning</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.actionCard}
            onPress={() => navigation?.navigate('Disponibilités')}
          >
            <Ionicons name="checkmark-circle-outline" size={32} color={PRIMARY_COLOR} />
            <Text style={styles.actionText}>Disponibilités</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.actionCard}
            onPress={() => navigation?.navigate('Remplacements')}
          >
            <Ionicons name="people-outline" size={32} color={PRIMARY_COLOR} />
            <Text style={styles.actionText}>Remplacements</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.actionCard}
            onPress={() => navigation?.navigate('Formations')}
          >
            <Ionicons name="school-outline" size={32} color={PRIMARY_COLOR} />
            <Text style={styles.actionText}>Formations</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Prochaines gardes */}
      {mesProchainesGardes.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>À venir</Text>
          {mesProchainesGardes.map((garde, idx) => (
            <View key={idx} style={styles.miniGardeCard}>
              <Text style={styles.miniGardeDate}>
                {new Date(garde.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
              </Text>
              <Text style={styles.miniGardeType}>{garde.type_garde?.nom}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  greeting: {
    fontSize: 14,
    color: '#666',
  },
  userName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 5,
  },
  tenantBadge: {
    backgroundColor: PRIMARY_COLOR,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  tenantText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 10,
  },
  statCard: {
    width: (width - 50) / 2,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    margin: 5,
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
    textAlign: 'center',
  },
  section: {
    padding: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  gardeCard: {
    flexDirection: 'row',
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
  gardeBadge: {
    width: 4,
    borderRadius: 2,
    marginRight: 12,
  },
  gardeContent: {
    flex: 1,
  },
  gardeDate: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    textTransform: 'capitalize',
  },
  gardeType: {
    fontSize: 16,
    fontWeight: 'bold',
    color: PRIMARY_COLOR,
    marginTop: 5,
  },
  gardeTime: {
    fontSize: 13,
    color: '#666',
    marginTop: 3,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    padding: 20,
    fontStyle: 'italic',
  },
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -5,
  },
  actionCard: {
    width: (width - 50) / 2,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    margin: 5,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginTop: 10,
  },
  miniGardeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  miniGardeDate: {
    fontSize: 12,
    fontWeight: 'bold',
    color: PRIMARY_COLOR,
    width: 60,
  },
  miniGardeType: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
});
