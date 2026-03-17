import { useEffect, useRef, useCallback } from 'react';

// Compteur global pour gérer plusieurs modals ouverts simultanément
let scrollLockCount = 0;
let savedScrollY = 0;

/**
 * Verrouille le scroll du body - fonction utilitaire globale
 */
export const lockBodyScroll = () => {
  if (scrollLockCount === 0) {
    savedScrollY = window.scrollY;
    
    // Styles pour bloquer le scroll - fonctionne sur Web, iOS et Android
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${savedScrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.style.touchAction = 'none';
    
    // Pour iOS Safari
    document.body.style.webkitOverflowScrolling = 'auto';
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.height = '100%';
    
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');
  }
  scrollLockCount++;
};

/**
 * Déverrouille le scroll du body - fonction utilitaire globale
 */
export const unlockBodyScroll = () => {
  scrollLockCount--;
  
  if (scrollLockCount <= 0) {
    scrollLockCount = 0;
    
    // Restaurer les styles
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    document.body.style.touchAction = '';
    document.body.style.webkitOverflowScrolling = '';
    document.documentElement.style.overflow = '';
    document.documentElement.style.height = '';
    
    document.body.classList.remove('modal-open');
    document.documentElement.classList.remove('modal-open');
    
    // Restaurer la position du scroll
    window.scrollTo(0, savedScrollY);
  }
};

/**
 * Hook pour verrouiller le scroll du body lorsqu'une modale est ouverte.
 * Fonctionne sur Web, iOS et Android.
 * Gère correctement plusieurs modals ouverts simultanément.
 * 
 * @param {boolean} isOpen - Si la modale est ouverte
 */
export const useModalScrollLock = (isOpen) => {
  const isLocked = useRef(false);
  
  useEffect(() => {
    if (isOpen && !isLocked.current) {
      lockBodyScroll();
      isLocked.current = true;
    } else if (!isOpen && isLocked.current) {
      unlockBodyScroll();
      isLocked.current = false;
    }
    
    return () => {
      if (isLocked.current) {
        unlockBodyScroll();
        isLocked.current = false;
      }
    };
  }, [isOpen]);
};

/**
 * Hook pour observer automatiquement l'ouverture de modals dans le DOM
 * Détecte les modals shadcn (Radix) ET les modals custom avec position: fixed
 */
export const useGlobalModalScrollLock = () => {
  const observerRef = useRef(null);
  const lockedByObserver = useRef(false);
  
  const checkForModals = useCallback(() => {
    // 1. Vérifier les modals Radix/shadcn
    const hasRadixModal = 
      document.querySelector('[role="dialog"][data-state="open"]') ||
      document.querySelector('[data-radix-dialog-overlay]') ||
      document.querySelector('[data-radix-alert-dialog-overlay]');
    
    // 2. Vérifier les modals custom avec position: fixed et background semi-transparent
    let hasCustomModal = false;
    const fixedElements = document.querySelectorAll('div[style*="position: fixed"], div[style*="position:fixed"]');
    for (const el of fixedElements) {
      const style = el.style;
      const computedStyle = window.getComputedStyle(el);
      const bgColor = computedStyle.backgroundColor;
      const zIndex = parseInt(computedStyle.zIndex, 10);
      
      // Un overlay de modal a généralement:
      // - position: fixed
      // - un z-index élevé (>= 50)
      // - un background semi-transparent (rgba avec alpha > 0)
      if (zIndex >= 50 && bgColor && bgColor.includes('rgba') && !bgColor.includes('rgba(0, 0, 0, 0)')) {
        // Vérifier que c'est bien un overlay (couvre l'écran)
        const rect = el.getBoundingClientRect();
        if (rect.width > window.innerWidth * 0.5 && rect.height > window.innerHeight * 0.5) {
          hasCustomModal = true;
          break;
        }
      }
    }
    
    const hasOpenModal = hasRadixModal || hasCustomModal;
    
    if (hasOpenModal && !lockedByObserver.current) {
      lockBodyScroll();
      lockedByObserver.current = true;
    } else if (!hasOpenModal && lockedByObserver.current) {
      unlockBodyScroll();
      lockedByObserver.current = false;
    }
  }, []);
  
  useEffect(() => {
    // Observer les changements dans le DOM
    observerRef.current = new MutationObserver(() => {
      // Utiliser requestAnimationFrame pour éviter les appels trop fréquents
      requestAnimationFrame(checkForModals);
    });
    
    observerRef.current.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-state', 'class', 'style']
    });
    
    // Vérification initiale
    checkForModals();
    
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
      if (lockedByObserver.current) {
        unlockBodyScroll();
        lockedByObserver.current = false;
      }
    };
  }, [checkForModals]);
};

export default useModalScrollLock;
