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
        month: "space-y-4 w-full",
        caption: cn(
          "flex justify-center pt-1 relative items-center mb-4",
          isLargeCalendar ? "px-12" : "px-8"
        ),
        caption_label: cn(
          "text-center",
          isLargeCalendar ? "text-3xl font-bold" : "text-sm font-semibold"
        ),
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          isLargeCalendar 
            ? "h-9 w-9 bg-white p-0 hover:bg-gray-100 border-2 border-gray-400"
            : "h-7 w-7 bg-white p-0 hover:bg-gray-100 border border-gray-300"
        ),
        nav_button_previous: "absolute left-0",
        nav_button_next: "absolute right-0",
        table: "w-full border-collapse space-y-1",
        head_row: "flex w-full",
        head_cell: cn(
          "text-muted-foreground rounded-md font-normal text-center",
          isLargeCalendar ? "w-[125px] text-lg font-bold" : "flex-1 min-w-0 text-[0.65rem] overflow-hidden"
        ),
        row: "flex w-full mt-2",
        cell: cn(
          "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent overflow-hidden",
          isLargeCalendar ? "w-[125px]" : "flex-1 min-w-0",
          props.mode === "range"
            ? "[&:has(>.day-range-end)]:rounded-r-md [&:has(>.day-range-start)]:rounded-l-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md"
            : "[&:has([aria-selected])]:rounded-md"
        ),
        day: cn(
          buttonVariants({ variant: "ghost" }),
          isLargeCalendar 
            ? "h-[125px] w-[125px] text-xl font-semibold border-2 border-gray-200 rounded-xl" 
            : "h-10 w-full max-w-full overflow-hidden",
          "p-0 font-normal aria-selected:opacity-100"
        ),
        day_range_start: "day-range-start",
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-accent text-accent-foreground",
        day_outside: "text-muted-foreground opacity-50",
        day_disabled: "text-muted-foreground opacity-50",
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
