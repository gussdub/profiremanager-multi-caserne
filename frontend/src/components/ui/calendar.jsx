import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"
import { fr } from "date-fns/locale"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  indisponibilites = [], // Props pour afficher les indisponibilités
  disponibilites = [], // Nouvelle props pour afficher les disponibilités existantes
  ...props
}) {
  // Detect screen size for responsive calendar
  const [isMobile, setIsMobile] = React.useState(false);
  const [isZoomed, setIsZoomed] = React.useState(false);
  
  React.useEffect(() => {
    const checkMobile = () => {
      // Détecter le mobile ou le zoom élevé
      const width = window.innerWidth;
      const devicePixelRatio = window.devicePixelRatio || 1;
      const visualViewportScale = window.visualViewport?.scale || 1;
      
      // Considérer comme mobile si écran petit OU zoom élevé
      const effectiveWidth = width / (devicePixelRatio > 1 ? 1 : visualViewportScale);
      setIsMobile(width < 768 || effectiveWidth < 500);
      setIsZoomed(visualViewportScale > 1.2 || devicePixelRatio > 2);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    // Écouter aussi les changements de viewport (zoom)
    window.visualViewport?.addEventListener('resize', checkMobile);
    return () => {
      window.removeEventListener('resize', checkMobile);
      window.visualViewport?.removeEventListener('resize', checkMobile);
    };
  }, []);

  // Detect if used in modal (large calendar) - but only on desktop
  const isLargeCalendar = !isMobile && className && (
    className.includes('interactive-calendar') || 
    className.includes('availability-calendar-large')
  );

  // Créer un modifier pour les jours avec indisponibilités
  const indisponibiliteDates = React.useMemo(() => {
    if (!indisponibilites || indisponibilites.length === 0) {
      return [];
    }
    
    const dates = indisponibilites.map(indispo => {
      try {
        // Parser la date sans ajouter de décalage de timezone
        const [year, month, day] = indispo.date.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        return date;
      } catch (e) {
        console.error('Erreur parsing date indispo:', indispo.date, e);
        return null;
      }
    }).filter(Boolean);
    
    return dates;
  }, [indisponibilites]);

  // Créer un modifier pour les jours avec disponibilités existantes
  // On exclut les dates qui sont actuellement sélectionnées pour que la sélection ait priorité
  const selectedDatesSet = React.useMemo(() => {
    if (!props.selected) return new Set();
    const selected = Array.isArray(props.selected) ? props.selected : [props.selected];
    return new Set(selected.map(d => d?.toDateString()).filter(Boolean));
  }, [props.selected]);

  const disponibiliteDates = React.useMemo(() => {
    if (!disponibilites || disponibilites.length === 0) {
      return [];
    }
    
    const dates = disponibilites.map(dispo => {
      try {
        const [year, month, day] = dispo.date.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        // Exclure les dates sélectionnées pour que la sélection ait priorité visuelle
        if (selectedDatesSet.has(date.toDateString())) {
          return null;
        }
        return date;
      } catch (e) {
        console.error('Erreur parsing date dispo:', dispo.date, e);
        return null;
      }
    }).filter(Boolean);
    
    return dates;
  }, [disponibilites, selectedDatesSet]);

  // Ajouter les modifiers pour les indisponibilités et disponibilités
  const modifiers = {
    indisponible: indisponibiliteDates,
    disponible: disponibiliteDates,
    ...props.modifiers
  };

  const modifiersClassNames = {
    indisponible: "indisponible",
    disponible: "disponible-existant",
    ...props.modifiersClassNames
  };

  const modifiersStyles = {
    indisponible: {
      backgroundColor: '#fee2e2',
      color: '#991b1b',
      textDecoration: 'line-through',
      fontWeight: 'bold'
    },
    disponible: {
      backgroundColor: '#dbeafe',
      color: '#1e40af',
      fontWeight: '500',
      borderRadius: '12px',
      border: '2px solid #93c5fd'
    },
    ...props.modifiersStyles
  };

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      modifiers={modifiers}
      modifiersClassNames={modifiersClassNames}
      modifiersStyles={modifiersStyles}
      weekStartsOn={1}
      locale={fr}
      style={{
        // Assurer une largeur minimale pour que tous les jours soient visibles
        minWidth: isMobile ? '100%' : 'auto',
        overflowX: 'auto'
      }}
      classNames={{
        months: cn(
          "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
          (isMobile || isZoomed) && "overflow-x-auto"
        ),
        month: cn("w-full", (isMobile || isZoomed) && "space-y-2 min-w-[280px]"),
        caption: cn(
          "w-full",
          (isMobile || isZoomed)
            ? "grid grid-cols-[40px_1fr_40px] gap-1 items-center mb-2 px-1" 
            : "flex justify-center items-center relative mb-4"
        ),
        caption_label: cn(
          "text-sm font-semibold text-center whitespace-nowrap",
          (isMobile || isZoomed) && "col-start-2 text-base"
        ),
        nav: (isMobile || isZoomed) ? "contents" : "flex items-center gap-1",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          (isMobile || isZoomed)
            ? "h-9 w-9 p-0 bg-white border-2 border-gray-400 rounded-lg flex items-center justify-center"
            : isLargeCalendar 
              ? "h-9 w-9 bg-white p-0 hover:bg-gray-100 border-2 border-gray-400"
              : "h-7 w-7 bg-white p-0 hover:bg-gray-100 border border-gray-300"
        ),
        nav_button_previous: (isMobile || isZoomed) ? "col-start-1 row-start-1" : "absolute left-1",
        nav_button_next: (isMobile || isZoomed) ? "col-start-3 row-start-1" : "absolute right-1",
        table: cn("w-full border-collapse", (isMobile || isZoomed) && "table-fixed min-w-[280px]"),
        head_row: "flex w-full",
        head_cell: cn(
          "text-muted-foreground font-normal text-center",
          isLargeCalendar ? "w-[125px] text-lg font-bold flex-1" : "text-xs flex-1",
          (isMobile || isZoomed) && "py-1 text-gray-500 text-xs font-medium min-w-[36px]"
        ),
        row: "flex w-full mt-1",
        cell: cn(
          "relative p-0.5 text-center text-sm focus-within:relative focus-within:z-20",
          isLargeCalendar ? "w-[125px] flex-1" : "flex-1",
          (isMobile || isZoomed) && "min-w-[36px]",
          props.mode === "range"
            ? "[&:has(>.day-range-end)]:rounded-r-md [&:has(>.day-range-start)]:rounded-l-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md"
            : "[&:has([aria-selected])]:rounded-md"
        ),
        day: cn(
          buttonVariants({ variant: "ghost" }),
          isLargeCalendar 
            ? "h-[125px] w-[125px] text-xl font-semibold border-2 border-gray-200 rounded-xl" 
            : (isMobile || isZoomed)
              ? "h-9 w-9 rounded-lg bg-white border border-gray-200 text-sm flex items-center justify-center"
              : "h-10 w-full max-w-full overflow-hidden",
          "p-0 font-normal aria-selected:opacity-100"
        ),
        day_range_start: "day-range-start",
        day_range_end: "day-range-end",
        day_selected: cn(
          (isMobile || isZoomed)
            ? "bg-pink-100 text-pink-800 border-pink-300 border-2"
            : "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground"
        ),
        day_today: cn(
          (isMobile || isZoomed)
            ? "bg-white border-2 border-red-400 text-red-600 font-bold"
            : "bg-accent text-accent-foreground"
        ),
        day_outside: cn(
          "text-muted-foreground opacity-30",
          (isMobile || isZoomed) && "bg-transparent border-transparent"
        ),
        day_disabled: cn(
          "text-muted-foreground opacity-30",
          (isMobile || isZoomed) && "bg-gray-50 border-gray-100"
        ),
        day_range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
      }}
      components={{
        IconLeft: ({ ...props }) => <ChevronLeft className={cn("h-4 w-4", (isMobile || isZoomed) && "h-5 w-5")} />,
        IconRight: ({ ...props }) => <ChevronRight className={cn("h-4 w-4", (isMobile || isZoomed) && "h-5 w-5")} />,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar"

export { Calendar }
