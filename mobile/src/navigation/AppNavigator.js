import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';

// Screens
import LoginScreen from '../screens/LoginScreen';
import PlanningScreen from '../screens/PlanningScreen';
import DisponibilitesScreen from '../screens/DisponibilitesScreen';
import RemplacementsScreen from '../screens/RemplacementsScreen';
import PreventionScreen from '../screens/PreventionScreen';
import ProfilScreen from '../screens/ProfilScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

const PRIMARY_COLOR = '#D9072B';

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'Planning') {
            iconName = focused ? 'calendar' : 'calendar-outline';
          } else if (route.name === 'Disponibilités') {
            iconName = focused ? 'checkmark-circle' : 'checkmark-circle-outline';
          } else if (route.name === 'Remplacements') {
            iconName = focused ? 'people' : 'people-outline';
          } else if (route.name === 'Prévention') {
            iconName = focused ? 'shield' : 'shield-outline';
          } else if (route.name === 'Profil') {
            iconName = focused ? 'person' : 'person-outline';
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
      <Tab.Screen name="Planning" component={PlanningScreen} />
      <Tab.Screen name="Disponibilités" component={DisponibilitesScreen} />
      <Tab.Screen name="Remplacements" component={RemplacementsScreen} />
      <Tab.Screen name="Prévention" component={PreventionScreen} />
      <Tab.Screen name="Profil" component={ProfilScreen} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return null; // Ou un écran de chargement
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <Stack.Screen name="Main" component={MainTabs} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
