import { useEffect } from 'react';

/**
 * Hook pour verrouiller le scroll du body lorsqu'une modale est ouverte.
 * Empêche le problème où la page en arrière-plan scroll au lieu du contenu de la modale.
 * 
 * @param {boolean} isOpen - Si la modale est ouverte
 */
export const useModalScrollLock = (isOpen) => {
  useEffect(() => {
    if (isOpen) {
      // Sauvegarder la position actuelle du scroll
      const scrollY = window.scrollY;
      
      // Ajouter la classe qui bloque le scroll
      document.body.classList.add('modal-open');
      
      // Appliquer un décalage pour éviter le saut visuel
      document.body.style.top = `-${scrollY}px`;
      
      return () => {
        // Restaurer le scroll lors de la fermeture
        document.body.classList.remove('modal-open');
        document.body.style.top = '';
        
        // Restaurer la position du scroll
        window.scrollTo(0, scrollY);
      };
    }
  }, [isOpen]);
};

export default useModalScrollLock;
