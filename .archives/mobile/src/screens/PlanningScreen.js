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

export default function PlanningScreen() {
  const { tenant, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [assignations, setAssignations] = useState([]);
  const [currentWeek, setCurrentWeek] = useState(getWeekStart(new Date()));

  useEffect(() => {
    loadAssignations();
  }, [currentWeek]);

  function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    return monday.toISOString().split('T')[0];
  }

  async function loadAssignations() {
    try {
      setLoading(true);
      const response = await api.get(`/api/${tenant.slug}/planning/assignations/${currentWeek}`);
      setAssignations(response.data || []);
    } catch (error) {
      console.error('Erreur chargement planning:', error);
      Alert.alert('Erreur', 'Impossible de charger le planning');
    } finally {
      setLoading(false);
    }
  }

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAssignations();
    setRefreshing(false);
  };

  const changeWeek = (direction) => {
    const date = new Date(currentWeek);
    date.setDate(date.getDate() + (direction * 7));
    setCurrentWeek(getWeekStart(date));
  };

  const getWeekDays = () => {
    const days = [];
    const start = new Date(currentWeek);
    for (let i = 0; i < 7; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      days.push(date);
    }
    return days;
  };

  const getAssignationsForDay = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    return assignations.filter(a => a.date === dateStr && a.user_id === user.id);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={PRIMARY_COLOR} />
      </View>
    );
  }

  const weekDays = getWeekDays();

  return (
    <View style={styles.container}>
      <View style={styles.weekNavigation}>
        <TouchableOpacity onPress={() => changeWeek(-1)} style={styles.navButton}>
          <Ionicons name="chevron-back" size={24} color={PRIMARY_COLOR} />
        </TouchableOpacity>
        <Text style={styles.weekTitle}>
          Semaine du {new Date(currentWeek).toLocaleDateString('fr-FR')}
        </Text>
        <TouchableOpacity onPress={() => changeWeek(1)} style={styles.navButton}>
          <Ionicons name="chevron-forward" size={24} color={PRIMARY_COLOR} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {weekDays.map((day, index) => {
          const dayAssignations = getAssignationsForDay(day);
          const dayName = day.toLocaleDateString('fr-FR', { weekday: 'long' });
          const isToday = day.toDateString() === new Date().toDateString();

          return (
            <View key={index} style={[styles.dayCard, isToday && styles.todayCard]}>
              <View style={styles.dayHeader}>
                <Text style={[styles.dayName, isToday && styles.todayText]}>
                  {dayName.charAt(0).toUpperCase() + dayName.slice(1)}
                </Text>
                <Text style={styles.dayDate}>
                  {day.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                </Text>
              </View>

              {dayAssignations.length > 0 ? (
                dayAssignations.map((assignation, idx) => (
                  <View key={idx} style={styles.assignation}>
                    <View style={[styles.colorBadge, { backgroundColor: assignation.type_garde?.couleur || PRIMARY_COLOR }]} />
                    <View style={styles.assignationContent}>
                      <Text style={styles.assignationType}>
                        {assignation.type_garde?.nom || 'Garde'}
                      </Text>
                      <Text style={styles.assignationTime}>
                        {assignation.heure_debut} - {assignation.heure_fin}
                      </Text>
                    </View>
                    {assignation.est_remplacement && (
                      <Ionicons name="swap-horizontal" size={20} color="#ff9800" />
                    )}
                  </View>
                ))
              ) : (
                <Text style={styles.noAssignation}>Aucune garde ce jour</Text>
              )}
            </View>
          );
        })}
      </ScrollView>
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
  weekNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  navButton: {
    padding: 5,
  },
  weekTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  content: {
    flex: 1,
    padding: 10,
  },
  dayCard: {
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
  todayCard: {
    borderLeftWidth: 4,
    borderLeftColor: PRIMARY_COLOR,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  dayName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  todayText: {
    color: PRIMARY_COLOR,
  },
  dayDate: {
    fontSize: 14,
    color: '#666',
  },
  assignation: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    marginBottom: 5,
  },
  colorBadge: {
    width: 4,
    height: 40,
    borderRadius: 2,
    marginRight: 10,
  },
  assignationContent: {
    flex: 1,
  },
  assignationType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  assignationTime: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  noAssignation: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 10,
  },
});
