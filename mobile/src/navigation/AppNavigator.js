import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useAuth } from '../context/AuthContext';

// Screens
import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import PlanningScreen from '../screens/PlanningScreen';
import DisponibilitesScreen from '../screens/DisponibilitesScreen';
import RemplacementsScreen from '../screens/RemplacementsScreen';
import PreventionScreen from '../screens/PreventionScreen';
import FormationsScreen from '../screens/FormationsScreen';
import MesEPIScreen from '../screens/MesEPIScreen';
import MonProfilScreen from '../screens/MonProfilScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

const PRIMARY_COLOR = '#D9072B';

function PlusMenuScreen({ navigation }) {
  const menuItems = [
    { name: 'Prévention', icon: 'shield', screen: 'PreventionStack', color: '#D9072B' },
    { name: 'Formations', icon: 'school', screen: 'FormationsStack', color: '#2196f3' },
    { name: 'Mes EPI', icon: 'shield-checkmark', screen: 'MesEPIStack', color: '#4caf50' },
    { name: 'Mon Profil', icon: 'person', screen: 'MonProfilStack', color: '#ff9800' },
  ];

  return (
    <ScrollView style={styles.plusMenuContainer}>
      <Text style={styles.plusMenuTitle}>Modules</Text>
      <View style={styles.plusMenuGrid}>
        {menuItems.map((item, index) => (
          <TouchableOpacity
            key={index}
            style={styles.plusMenuItem}
            onPress={() => navigation.navigate(item.screen)}
          >
            <View style={[styles.plusMenuIcon, { backgroundColor: item.color }]}>
              <Ionicons name={item.icon} size={32} color="#fff" />
            </View>
            <Text style={styles.plusMenuText}>{item.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'Dashboard') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Planning') {
            iconName = focused ? 'calendar' : 'calendar-outline';
          } else if (route.name === 'Disponibilités') {
            iconName = focused ? 'checkmark-circle' : 'checkmark-circle-outline';
          } else if (route.name === 'Remplacements') {
            iconName = focused ? 'people' : 'people-outline';
          } else if (route.name === 'Plus') {
            iconName = focused ? 'apps' : 'apps-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: PRIMARY_COLOR,
        tabBarInactiveTintColor: 'gray',
        tabBarStyle: {
          paddingBottom: 5,
          paddingTop: 5,
          height: 60,
        },
        headerStyle: {
          backgroundColor: PRIMARY_COLOR,
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      })}
    >
      <Tab.Screen 
        name="Dashboard" 
        component={DashboardScreen}
        options={{ title: 'Accueil' }}
      />
      <Tab.Screen name="Planning" component={PlanningScreen} />
      <Tab.Screen 
        name="Disponibilités" 
        component={DisponibilitesScreen}
      />
      <Tab.Screen name="Remplacements" component={RemplacementsScreen} />
      <Tab.Screen
        name="Plus"
        component={PlusMenuScreen}
        options={{ title: 'Plus' }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return null;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen 
              name="PreventionStack" 
              component={PreventionScreen}
              options={{
                headerShown: true,
                title: 'Prévention',
                headerStyle: { backgroundColor: PRIMARY_COLOR },
                headerTintColor: '#fff',
              }}
            />
            <Stack.Screen 
              name="FormationsStack" 
              component={FormationsScreen}
              options={{
                headerShown: true,
                title: 'Formations',
                headerStyle: { backgroundColor: PRIMARY_COLOR },
                headerTintColor: '#fff',
              }}
            />
            <Stack.Screen 
              name="MesEPIStack" 
              component={MesEPIScreen}
              options={{
                headerShown: true,
                title: 'Mes Équipements',
                headerStyle: { backgroundColor: PRIMARY_COLOR },
                headerTintColor: '#fff',
              }}
            />
            <Stack.Screen 
              name="MonProfilStack" 
              component={MonProfilScreen}
              options={{
                headerShown: true,
                title: 'Mon Profil',
                headerStyle: { backgroundColor: PRIMARY_COLOR },
                headerTintColor: '#fff',
              }}
            />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  plusMenuContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  plusMenuTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
  },
  plusMenuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  plusMenuItem: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 20,
    marginBottom: 15,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  plusMenuIcon: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  plusMenuText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
});
