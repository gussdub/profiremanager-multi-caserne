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
  indisponibilites = [], // Nouvelle props pour afficher les indisponibilités
  ...props
}) {
  // Detect screen size for responsive calendar
  const [isMobile, setIsMobile] = React.useState(false);
  
  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Detect if used in modal (large calendar) - but only on desktop
  const isLargeCalendar = !isMobile && className && (
    className.includes('interactive-calendar') || 
    className.includes('availability-calendar-large')
  );

  // Créer un modifier pour les jours avec indisponibilités
  const indisponibiliteDates = React.useMemo(() => {
    if (!indisponibilites || indisponibilites.length === 0) {
      console.log('📅 Calendar: Aucune indisponibilité fournie');
      return [];
    }
    
    console.log(`📅 Calendar: ${indisponibilites.length} indisponibilités reçues`, indisponibilites.slice(0, 3));
    
    const dates = indisponibilites.map(indispo => {
      try {
        // Parser la date sans ajouter de décalage de timezone
        const [year, month, day] = indispo.date.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        return date;
      } catch (e) {
        console.error('Erreur parsing date:', indispo.date, e);
        return null;
      }
    }).filter(Boolean);
    
    console.log('📅 Calendar: Dates d\'indisponibilité créées:', dates.slice(0, 3));
    return dates;
  }, [indisponibilites]);

  // Ajouter les modifiers pour les indisponibilités
  const modifiers = {
    indisponible: indisponibiliteDates,
    ...props.modifiers
  };

  const modifiersClassNames = {
    indisponible: "indisponible",
    ...props.modifiersClassNames
  };

  const modifiersStyles = {
    indisponible: {
      backgroundColor: '#fee2e2',
      color: '#991b1b',
      textDecoration: 'line-through',
      fontWeight: 'bold'
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
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: cn("w-full", isMobile && "space-y-2"),
        caption: cn(
          "w-full",
          isMobile 
            ? "grid grid-cols-[32px_1fr_32px] gap-2 items-center mb-2 px-1" 
            : "flex justify-center items-center relative mb-4"
        ),
        caption_label: cn(
          "text-sm font-semibold text-center",
          isMobile && "col-start-2"
        ),
        nav: isMobile ? "contents" : "flex items-center gap-1",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          isMobile
            ? "h-8 w-8 p-0 bg-white border border-gray-300 rounded-lg"
            : isLargeCalendar 
              ? "h-9 w-9 bg-white p-0 hover:bg-gray-100 border-2 border-gray-400"
              : "h-7 w-7 bg-white p-0 hover:bg-gray-100 border border-gray-300"
        ),
        nav_button_previous: isMobile ? "col-start-1 row-start-1" : "absolute left-1",
        nav_button_next: isMobile ? "col-start-3 row-start-1" : "absolute right-1",
        table: "w-full border-collapse",
        head_row: "flex w-full",
        head_cell: cn(
          "text-muted-foreground font-normal text-center flex-1",
          isLargeCalendar ? "w-[125px] text-lg font-bold" : "text-xs",
          isMobile && "py-1 text-gray-400"
        ),
        row: "flex w-full mt-1",
        cell: cn(
          "relative p-0.5 text-center text-sm focus-within:relative focus-within:z-20 flex-1",
          isLargeCalendar && "w-[125px]",
          props.mode === "range"
            ? "[&:has(>.day-range-end)]:rounded-r-md [&:has(>.day-range-start)]:rounded-l-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md"
            : "[&:has([aria-selected])]:rounded-md"
        ),
        day: cn(
          buttonVariants({ variant: "ghost" }),
          isLargeCalendar 
            ? "h-[125px] w-[125px] text-xl font-semibold border-2 border-gray-200 rounded-xl" 
            : isMobile 
              ? "h-9 w-full rounded-lg bg-white border border-gray-200 text-sm"
              : "h-10 w-full max-w-full overflow-hidden",
          "p-0 font-normal aria-selected:opacity-100"
        ),
        day_range_start: "day-range-start",
        day_range_end: "day-range-end",
        day_selected: cn(
          isMobile 
            ? "bg-pink-100 text-pink-800 border-pink-200"
            : "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground"
        ),
        day_today: cn(
          isMobile
            ? "bg-white border-2 border-red-400 text-red-600 font-semibold"
            : "bg-accent text-accent-foreground"
        ),
        day_outside: cn(
          "text-muted-foreground opacity-30",
          isMobile && "bg-transparent border-transparent"
        ),
        day_disabled: cn(
          "text-muted-foreground opacity-30",
          isMobile && "bg-gray-50 border-gray-100"
        ),
        day_range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
      }}
      components={{
        IconLeft: ({ ...props }) => <ChevronLeft className="h-4 w-4" />,
        IconRight: ({ ...props }) => <ChevronRight className="h-4 w-4" />,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar"

export { Calendar }
