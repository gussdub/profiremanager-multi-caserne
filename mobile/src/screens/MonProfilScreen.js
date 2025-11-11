import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const PRIMARY_COLOR = '#D9072B';

export default function MonProfilScreen() {
  const { user, tenant, signOut } = useAuth();
  const [loading, setLoading] = useState(false);
  const [userDetails, setUserDetails] = useState(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    loadUserDetails();
  }, []);

  async function loadUserDetails() {
    try {
      const response = await api.get(`/api/${tenant.slug}/users/${user.id}`);
      setUserDetails(response.data);
    } catch (error) {
      console.error('Erreur chargement profil:', error);
    }
  }

  const handleLogout = () => {
    Alert.alert(
      'Déconnexion',
      'Êtes-vous sûr de vouloir vous déconnecter ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Déconnecter',
          style: 'destructive',
          onPress: signOut,
        },
      ]
    );
  };

  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword || !confirmPassword) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Erreur', 'Les mots de passe ne correspondent pas');
      return;
    }

    if (newPassword.length < 8) {
      Alert.alert('Erreur', 'Le mot de passe doit contenir au moins 8 caractères');
      return;
    }

    try {
      setLoading(true);
      await api.put(`/api/${tenant.slug}/users/${user.id}/password`, {
        ancien_mot_de_passe: oldPassword,
        nouveau_mot_de_passe: newPassword,
      });
      Alert.alert('Succès', 'Mot de passe modifié avec succès');
      setShowPasswordModal(false);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      Alert.alert('Erreur', error.response?.data?.detail || 'Impossible de modifier le mot de passe');
    } finally {
      setLoading(false);
    }
  };

  const displayUser = userDetails || user;

  return (
    <ScrollView style={styles.container}>
      {/* En-tête avec photo */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {displayUser?.prenom?.charAt(0)}{displayUser?.nom?.charAt(0)}
          </Text>
        </View>
        <Text style={styles.name}>{displayUser?.prenom} {displayUser?.nom}</Text>
        <Text style={styles.email}>{displayUser?.email}</Text>
        {tenant && (
          <View style={styles.tenantBadge}>
            <Ionicons name="business" size={12} color="#fff" />
            <Text style={styles.tenantText}>{tenant.nom}</Text>
          </View>
        )}
      </View>

      {/* Informations professionnelles */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Informations professionnelles</Text>
        <View style={styles.infoCard}>
          <InfoRow icon="person-outline" label="Numéro d'employé" value={displayUser?.numero_employe} />
          <InfoRow icon="briefcase-outline" label="Grade" value={displayUser?.grade} />
          <InfoRow icon="calendar-outline" label="Date d'embauche" 
            value={displayUser?.date_embauche ? new Date(displayUser.date_embauche).toLocaleDateString('fr-FR') : 'N/A'} 
          />
          <InfoRow icon="time-outline" label="Type d'emploi" 
            value={displayUser?.type_emploi === 'temps_plein' ? 'Temps plein' : 'Temps partiel'} 
          />
          <InfoRow icon="card-outline" label="Taux horaire" 
            value={displayUser?.taux_horaire ? `${displayUser.taux_horaire} $/h` : 'N/A'} 
          />
        </View>
      </View>

      {/* Contact */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Contact</Text>
        <View style={styles.infoCard}>
          <InfoRow icon="call-outline" label="Téléphone" value={displayUser?.telephone} />
          <InfoRow icon="location-outline" label="Adresse" value={displayUser?.adresse} />
        </View>
      </View>

      {/* Contact d'urgence */}
      {displayUser?.contact_urgence && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact d'urgence</Text>
          <View style={styles.infoCard}>
            <InfoRow icon="alert-circle-outline" label="Nom" value={displayUser.contact_urgence.nom} />
            <InfoRow icon="call-outline" label="Téléphone" value={displayUser.contact_urgence.telephone} />
            <InfoRow icon="people-outline" label="Relation" value={displayUser.contact_urgence.relation} />
          </View>
        </View>
      )}

      {/* Statistiques */}
      {displayUser?.heures_internes !== undefined && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Mes statistiques</Text>
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{displayUser.heures_internes || 0}h</Text>
              <Text style={styles.statLabel}>Heures internes</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{displayUser.heures_externes || 0}h</Text>
              <Text style={styles.statLabel}>Heures externes</Text>
            </View>
          </View>
        </View>
      )}

      {/* Paramètres */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Paramètres</Text>
        
        <TouchableOpacity 
          style={styles.settingItem}
          onPress={() => setShowPasswordModal(true)}
        >
          <Ionicons name="lock-closed-outline" size={24} color="#333" />
          <Text style={styles.settingText}>Changer le mot de passe</Text>
          <Ionicons name="chevron-forward" size={20} color="#999" />
        </TouchableOpacity>
      </View>

      {/* Déconnexion */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={24} color="#fff" />
        <Text style={styles.logoutText}>Déconnexion</Text>
      </TouchableOpacity>

      <Text style={styles.version}>ProFireManager Mobile v1.0.0</Text>

      {/* Modal changement de mot de passe */}
      <Modal
        visible={showPasswordModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPasswordModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Changer le mot de passe</Text>

            <Text style={styles.inputLabel}>Ancien mot de passe</Text>
            <TextInput
              style={styles.input}
              placeholder="Ancien mot de passe"
              value={oldPassword}
              onChangeText={setOldPassword}
              secureTextEntry
              autoCapitalize="none"
            />

            <Text style={styles.inputLabel}>Nouveau mot de passe</Text>
            <TextInput
              style={styles.input}
              placeholder="Nouveau mot de passe (min 8 caractères)"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              autoCapitalize="none"
            />

            <Text style={styles.inputLabel}>Confirmer le mot de passe</Text>
            <TextInput
              style={styles.input}
              placeholder="Confirmer le mot de passe"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowPasswordModal(false)}
                disabled={loading}
              >
                <Text style={styles.cancelButtonText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.submitButton]}
                onPress={handleChangePassword}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>Modifier</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const InfoRow = ({ icon, label, value }) => (
  <View style={styles.infoRow}>
    <Ionicons name={icon} size={20} color="#666" />
    <View style={styles.infoContent}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || 'N/A'}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: PRIMARY_COLOR,
    padding: 30,
    alignItems: 'center',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  avatarText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
  },
  email: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 15,
  },
  tenantBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 15,
    paddingVertical: 6,
    borderRadius: 15,
  },
  tenantText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 5,
  },
  section: {
    marginTop: 20,
    paddingHorizontal: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  infoContent: {
    marginLeft: 15,
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 3,
  },
  infoValue: {
    fontSize: 15,
    color: '#333',
    fontWeight: '500',
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
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
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 5,
    textAlign: 'center',
  },
  settingItem: {
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
  settingText: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    marginLeft: 15,
  },
  logoutButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: PRIMARY_COLOR,
    marginHorizontal: 15,
    marginTop: 30,
    marginBottom: 20,
    padding: 15,
    borderRadius: 10,
  },
  logoutText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  version: {
    textAlign: 'center',
    color: '#999',
    fontSize: 12,
    marginBottom: 30,
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
    minHeight: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
  },
  inputLabel: {
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
  modalButtons: {
    flexDirection: 'row',
    marginTop: 25,
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
