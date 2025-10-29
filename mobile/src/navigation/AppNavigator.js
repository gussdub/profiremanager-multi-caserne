import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
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
const Drawer = createDrawerNavigator();

const PRIMARY_COLOR = '#D9072B';

function MainTabs({ navigation }) {
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
            iconName = focused ? 'menu' : 'menu-outline';
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
        headerLeft: () => (
          <TouchableOpacity
            onPress={() => navigation.openDrawer()}
            style={{ marginLeft: 15 }}
          >
            <Ionicons name="menu" size={28} color="#fff" />
          </TouchableOpacity>
        ),
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

function PlusMenuScreen({ navigation }) {
  const menuItems = [
    { name: 'Prévention', icon: 'shield', screen: 'Prévention', color: '#D9072B' },
    { name: 'Formations', icon: 'school', screen: 'Formations', color: '#2196f3' },
    { name: 'Mes EPI', icon: 'shield-checkmark', screen: 'MesEPI', color: '#4caf50' },
    { name: 'Mon Profil', icon: 'person', screen: 'MonProfil', color: '#ff9800' },
  ];

  return (
    <View style={styles.plusMenuContainer}>
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
    </View>
  );
}

function DrawerContent() {
  return (
    <Drawer.Navigator
      screenOptions={{
        headerShown: false,
        drawerStyle: {
          backgroundColor: '#fff',
        },
        drawerActiveTintColor: PRIMARY_COLOR,
        drawerInactiveTintColor: '#666',
      }}
    >
      <Drawer.Screen
        name="MainTabs"
        component={MainTabs}
        options={{
          drawerLabel: 'Accueil',
          drawerIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="Prévention"
        component={PreventionScreen}
        options={{
          drawerIcon: ({ color, size }) => (
            <Ionicons name="shield-outline" size={size} color={color} />
          ),
          headerShown: true,
          headerStyle: { backgroundColor: PRIMARY_COLOR },
          headerTintColor: '#fff',
        }}
      />
      <Drawer.Screen
        name="Formations"
        component={FormationsScreen}
        options={{
          drawerIcon: ({ color, size }) => (
            <Ionicons name="school-outline" size={size} color={color} />
          ),
          headerShown: true,
          headerStyle: { backgroundColor: PRIMARY_COLOR },
          headerTintColor: '#fff',
        }}
      />
      <Drawer.Screen
        name="MesEPI"
        component={MesEPIScreen}
        options={{
          drawerLabel: 'Mes EPI',
          drawerIcon: ({ color, size }) => (
            <Ionicons name="shield-checkmark-outline" size={size} color={color} />
          ),
          headerShown: true,
          headerTitle: 'Mes Équipements',
          headerStyle: { backgroundColor: PRIMARY_COLOR },
          headerTintColor: '#fff',
        }}
      />
      <Drawer.Screen
        name="MonProfil"
        component={MonProfilScreen}
        options={{
          drawerLabel: 'Mon Profil',
          drawerIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
          headerShown: true,
          headerTitle: 'Mon Profil',
          headerStyle: { backgroundColor: PRIMARY_COLOR },
          headerTintColor: '#fff',
        }}
      />
    </Drawer.Navigator>
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
          <Stack.Screen name="Main" component={DrawerContent} />
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
