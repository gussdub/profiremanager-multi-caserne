import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';

const PRIMARY_COLOR = '#D9072B';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingTenants, setLoadingTenants] = useState(true);
  const { signIn } = useAuth();

  useEffect(() => {
    loadTenants();
    loadLastTenant();
  }, []);

  const loadTenants = async () => {
    try {
      const response = await fetch('https://incident-manager-12.preview.emergentagent.com/api/tenants');
      const data = await response.json();
      setTenants(data);
    } catch (error) {
      console.error('Erreur chargement casernes:', error);
      // En cas d'erreur, utiliser une liste de fallback
      setTenants([
        { slug: 'shefford', nom: 'Shefford' },
        { slug: 'granby', nom: 'Granby' },
        { slug: 'waterloo', nom: 'Waterloo' }
      ]);
    } finally {
      setLoadingTenants(false);
    }
  };

  const loadLastTenant = async () => {
    try {
      const lastTenant = await AsyncStorage.getItem('lastTenantSlug');
      if (lastTenant) {
        setTenantSlug(lastTenant);
      }
    } catch (error) {
      console.error('Erreur chargement dernière caserne:', error);
    }
  };

  const handleLogin = async () => {
    if (!email || !password || !tenantSlug) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs');
      return;
    }

    setLoading(true);
    const result = await signIn(email, password, tenantSlug);
    setLoading(false);

    if (result.success) {
      // Sauvegarder la caserne pour la prochaine fois
      try {
        await AsyncStorage.setItem('lastTenantSlug', tenantSlug);
      } catch (error) {
        console.error('Erreur sauvegarde caserne:', error);
      }
    } else {
      Alert.alert('Erreur de connexion', result.message);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoText}>PFM</Text>
          </View>
          <Text style={styles.title}>ProFireManager</Text>
          <Text style={styles.subtitle}>Gestion des pompiers</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Caserne</Text>
          {loadingTenants ? (
            <ActivityIndicator color={PRIMARY_COLOR} />
          ) : tenants.length > 0 ? (
            <View style={styles.pickerContainer}>
              <select
                style={styles.picker}
                value={tenantSlug}
                onChange={(e) => setTenantSlug(e.target.value)}
              >
                <option value="">-- Sélectionnez une caserne --</option>
                {tenants.map((tenant) => (
                  <option key={tenant.slug} value={tenant.slug}>
                    {tenant.nom}
                  </option>
                ))}
              </select>
            </View>
          ) : (
            <TextInput
              style={styles.input}
              placeholder="Ex: shefford"
              value={tenantSlug}
              onChangeText={setTenantSlug}
              autoCapitalize="none"
              autoCorrect={false}
            />
          )}

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="votre.email@example.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Mot de passe</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Se connecter</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.forgotPassword}>
            <Text style={styles.forgotPasswordText}>Mot de passe oublié ?</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 50,
  },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: PRIMARY_COLOR,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  logoText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: PRIMARY_COLOR,
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  form: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
    overflow: 'hidden',
  },
  picker: {
    padding: 12,
    fontSize: 16,
    border: 'none',
    backgroundColor: 'transparent',
    width: '100%',
  },
  button: {
    backgroundColor: PRIMARY_COLOR,
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  forgotPassword: {
    alignItems: 'center',
    marginTop: 15,
  },
  forgotPasswordText: {
    color: PRIMARY_COLOR,
    fontSize: 14,
  },
});
