/**
 * Hook pour gérer la déconnexion automatique après inactivité
 * Web uniquement - Ne s'applique pas aux apps mobiles (Capacitor)
 */
import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';

const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes en millisecondes

export const useInactivityLogout = () => {
  const navigate = useNavigate();
  const timeoutRef = useRef(null);
  const isActiveRef = useRef(true);

  // Vérifier si on est sur une plateforme native (iOS/Android)
  const isNativePlatform = Capacitor.isNativePlatform();

  const logout = useCallback(() => {
    // Nettoyer le stockage
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('tenant');
    sessionStorage.clear();
    
    // Rediriger vers la page de connexion
    navigate('/login', { replace: true });
  }, [navigate]);

  const resetTimer = useCallback(() => {
    // Ne pas activer sur les plateformes natives
    if (isNativePlatform) return;

    // Annuler le timer existant
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Démarrer un nouveau timer
    timeoutRef.current = setTimeout(() => {
      // Vérifier si l'utilisateur est connecté avant de déconnecter
      const token = localStorage.getItem('token');
      if (token) {
        console.log('Déconnexion automatique pour inactivité (10 min)');
        logout();
      }
    }, INACTIVITY_TIMEOUT_MS);
  }, [isNativePlatform, logout]);

  useEffect(() => {
    // Ne pas activer sur les plateformes natives (iOS/Android)
    if (isNativePlatform) {
      return;
    }

    // Événements qui indiquent une activité utilisateur
    const activityEvents = [
      'mousedown',
      'mousemove',
      'keydown',
      'scroll',
      'touchstart',
      'click',
      'wheel'
    ];

    // Gestionnaire d'événements avec throttle pour éviter trop d'appels
    let lastActivity = Date.now();
    const handleActivity = () => {
      const now = Date.now();
      // Throttle: ne réinitialiser le timer que toutes les 30 secondes max
      if (now - lastActivity > 30000) {
        lastActivity = now;
        resetTimer();
      }
    };

    // Ajouter les écouteurs d'événements
    activityEvents.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    // Démarrer le timer initial
    resetTimer();

    // Nettoyage
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      activityEvents.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
    };
  }, [isNativePlatform, resetTimer]);

  return { resetTimer };
};

export default useInactivityLogout;
