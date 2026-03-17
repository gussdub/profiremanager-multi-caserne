import * as React from "react";
import { lockBodyScroll, unlockBodyScroll } from "@/hooks/useModalScrollLock";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

/**
 * Composant CustomModal - Wrapper pour les modals qui n'utilisent pas shadcn Dialog
 * Gère automatiquement le scroll lock sur Web, iOS et Android
 * 
 * Usage:
 * <CustomModal isOpen={isOpen} onClose={() => setIsOpen(false)}>
 *   <CustomModal.Content>
 *     ...contenu du modal...
 *   </CustomModal.Content>
 * </CustomModal>
 */
const CustomModal = ({ isOpen, onClose, children, className }) => {
  const wasOpen = React.useRef(false);
  
  React.useEffect(() => {
    if (isOpen && !wasOpen.current) {
      lockBodyScroll();
      wasOpen.current = true;
    } else if (!isOpen && wasOpen.current) {
      unlockBodyScroll();
      wasOpen.current = false;
    }
    
    return () => {
      if (wasOpen.current) {
        unlockBodyScroll();
        wasOpen.current = false;
      }
    };
  }, [isOpen]);
  
  // Fermer avec Escape
  React.useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape" && isOpen && onClose) {
        onClose();
      }
    };
    
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);
  
  if (!isOpen) return null;
  
  return (
    <div 
      className={cn(
        "fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4",
        "overflow-y-auto overscroll-contain",
        className
      )}
      onClick={(e) => {
        // Fermer si on clique sur l'overlay
        if (e.target === e.currentTarget && onClose) {
          onClose();
        }
      }}
      style={{ touchAction: 'none' }}
    >
      {children}
    </div>
  );
};

// Composant Content pour le contenu du modal
const CustomModalContent = React.forwardRef(({ className, children, onClose, showClose = true, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "relative bg-white rounded-lg shadow-xl max-h-[90vh] overflow-y-auto overscroll-contain",
      "w-full max-w-lg mx-auto",
      className
    )}
    onClick={(e) => e.stopPropagation()}
    {...props}
  >
    {showClose && onClose && (
      <button
        onClick={onClose}
        className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100 transition-opacity"
      >
        <X className="h-4 w-4" />
        <span className="sr-only">Fermer</span>
      </button>
    )}
    {children}
  </div>
));
CustomModalContent.displayName = "CustomModalContent";

// Composant Header
const CustomModalHeader = ({ className, ...props }) => (
  <div className={cn("flex flex-col space-y-1.5 p-6 pb-0", className)} {...props} />
);
CustomModalHeader.displayName = "CustomModalHeader";

// Composant Title
const CustomModalTitle = ({ className, ...props }) => (
  <h2 className={cn("text-lg font-semibold leading-none tracking-tight", className)} {...props} />
);
CustomModalTitle.displayName = "CustomModalTitle";

// Composant Body
const CustomModalBody = ({ className, ...props }) => (
  <div className={cn("p-6", className)} {...props} />
);
CustomModalBody.displayName = "CustomModalBody";

// Composant Footer
const CustomModalFooter = ({ className, ...props }) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 p-6 pt-0", className)} {...props} />
);
CustomModalFooter.displayName = "CustomModalFooter";

// Attacher les sous-composants
CustomModal.Content = CustomModalContent;
CustomModal.Header = CustomModalHeader;
CustomModal.Title = CustomModalTitle;
CustomModal.Body = CustomModalBody;
CustomModal.Footer = CustomModalFooter;

export { CustomModal, CustomModalContent, CustomModalHeader, CustomModalTitle, CustomModalBody, CustomModalFooter };
export default CustomModal;
