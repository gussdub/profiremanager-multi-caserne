import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { useToast } from '../hooks/use-toast';
import { X, Send, AlertTriangle, AlertCircle, Bell, Check } from 'lucide-react';

/**
 * Composant pour la bannière d'affichage des messages broadcast
 * Affiche le message actif avec différents styles selon la priorité
 */
export const BroadcastBanner = ({ tenantSlug, currentUser }) => {
  const [message, setMessage] = useState(null);
  const [isVisible, setIsVisible] = useState(true);
  const { toast } = useToast();
  const API_URL = process.env.REACT_APP_BACKEND_URL;

  const getToken = () => localStorage.getItem(`${tenantSlug}_token`);

  useEffect(() => {
    fetchActiveMessage();
    // Rafraîchir toutes les 30 secondes
    const interval = setInterval(fetchActiveMessage, 30000);
    return () => clearInterval(interval);
  }, [tenantSlug]);

  const fetchActiveMessage = async () => {
    try {
      const response = await fetch(`${API_URL}/api/${tenantSlug}/broadcast/actif`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.message && !data.message.est_lu) {
          setMessage(data.message);
          setIsVisible(true);
        } else {
          setMessage(null);
        }
      }
    } catch (error) {
      console.error('Erreur chargement message:', error);
    }
  };

  const handleMarkAsRead = async () => {
    if (!message) return;
    
    try {
      const response = await fetch(`${API_URL}/api/${tenantSlug}/broadcast/${message.id}/marquer-lu`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        setIsVisible(false);
        setTimeout(() => setMessage(null), 300);
      }
    } catch (error) {
      console.error('Erreur marquage lu:', error);
    }
  };

  if (!message || !isVisible) return null;

  const priorityStyles = {
    normal: {
      bg: 'bg-blue-50 border-blue-200',
      icon: <Bell className="w-5 h-5 text-blue-600" />,
      iconBg: 'bg-blue-100',
      text: 'text-blue-800',
      button: 'bg-blue-600 hover:bg-blue-700'
    },
    important: {
      bg: 'bg-amber-50 border-amber-200',
      icon: <AlertCircle className="w-5 h-5 text-amber-600" />,
      iconBg: 'bg-amber-100',
      text: 'text-amber-800',
      button: 'bg-amber-600 hover:bg-amber-700'
    },
    urgent: {
      bg: 'bg-red-50 border-red-200',
      icon: <AlertTriangle className="w-5 h-5 text-red-600" />,
      iconBg: 'bg-red-100',
      text: 'text-red-800',
      button: 'bg-red-600 hover:bg-red-700'
    }
  };

  const style = priorityStyles[message.priorite] || priorityStyles.normal;

  return (
    <div 
      className={`${style.bg} border rounded-lg p-4 mb-4 transition-all duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
      data-testid="broadcast-banner"
    >
      <div className="flex items-start gap-3">
        <div className={`${style.iconBg} p-2 rounded-full flex-shrink-0`}>
          {style.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`font-semibold ${style.text}`}>
              {message.priorite === 'urgent' ? '🚨 URGENT' : 
               message.priorite === 'important' ? '⚠️ Important' : '📢 Message'}
            </span>
            <span className="text-gray-500 text-sm">
              de {message.auteur_nom}
            </span>
          </div>
          <p className={`${style.text} whitespace-pre-wrap`}>
            {message.contenu}
          </p>
          <p className="text-gray-500 text-xs mt-2">
            {new Date(message.date_publication).toLocaleString('fr-CA')}
          </p>
        </div>
        <Button
          onClick={handleMarkAsRead}
          size="sm"
          className={`${style.button} text-white flex items-center gap-1`}
          data-testid="mark-read-btn"
        >
          <Check className="w-4 h-4" />
          Lu
        </Button>
      </div>
    </div>
  );
};

/**
 * Modale pour publier un nouveau message broadcast
 * Réservée aux admins et superviseurs
 */
export const BroadcastModal = ({ isOpen, onClose, tenantSlug, currentUser }) => {
  const [contenu, setContenu] = useState('');
  const [priorite, setPriorite] = useState('normal');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const API_URL = process.env.REACT_APP_BACKEND_URL;

  const getToken = () => localStorage.getItem(`${tenantSlug}_token`);

  const handleSubmit = async () => {
    if (!contenu.trim()) {
      toast({
        title: "Erreur",
        description: "Le message ne peut pas être vide",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/api/${tenantSlug}/broadcast/publier`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ contenu, priorite })
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: "✅ Message publié",
          description: `${data.notifications_envoyees} notification(s) et ${data.emails_envoyes} email(s) envoyés`
        });
        setContenu('');
        setPriorite('normal');
        onClose();
      } else {
        const error = await response.json();
        throw new Error(error.detail || 'Erreur lors de la publication');
      }
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" data-testid="broadcast-modal">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Send className="w-5 h-5 text-red-600" />
            Diffuser un message
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            data-testid="close-modal-btn"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Priorité */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Niveau de priorité
            </label>
            <div className="flex gap-2">
              {[
                { value: 'normal', label: '📢 Normal', color: 'blue' },
                { value: 'important', label: '⚠️ Important', color: 'amber' },
                { value: 'urgent', label: '🚨 Urgent', color: 'red' }
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setPriorite(option.value)}
                  className={`flex-1 py-2 px-3 rounded-lg border-2 transition-all ${
                    priorite === option.value
                      ? option.color === 'blue' ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : option.color === 'amber' ? 'border-amber-500 bg-amber-50 text-amber-700'
                      : 'border-red-500 bg-red-50 text-red-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  data-testid={`priority-${option.value}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Message */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message à diffuser
            </label>
            <textarea
              value={contenu}
              onChange={(e) => setContenu(e.target.value)}
              placeholder="Écrivez votre message ici..."
              className="w-full h-40 p-3 border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none"
              data-testid="message-textarea"
            />
          </div>

          {/* Info */}
          <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
            <p>
              <strong>Note:</strong> Ce message sera envoyé à tout le personnel actif par notification et par courriel.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t bg-gray-50">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !contenu.trim()}
            className="bg-red-600 hover:bg-red-700 text-white"
            data-testid="publish-btn"
          >
            {isSubmitting ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                Publication...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Publier
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

/**
 * Bouton pour ouvrir la modale de diffusion
 * N'apparaît que pour les admins et superviseurs
 */
export const BroadcastButton = ({ onClick, currentUser }) => {
  // Vérifier si l'utilisateur peut diffuser des messages
  const canBroadcast = currentUser?.role && ['admin', 'superviseur', 'super_admin'].includes(currentUser.role);

  if (!canBroadcast) return null;

  return (
    <Button
      onClick={onClick}
      className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white shadow-lg"
      data-testid="broadcast-button"
    >
      <Send className="w-4 h-4 mr-2" />
      Diffuser un message
    </Button>
  );
};

export default {
  BroadcastBanner,
  BroadcastModal,
  BroadcastButton
};
