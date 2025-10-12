#!/usr/bin/env python3
"""
Verify Quebec 10/14 logic calculation
"""

from datetime import datetime, timedelta

def calculate_quebec_days(annee: int, date_jour_1: str, equipe: str):
    """Calculate expected Quebec days for verification"""
    
    equipes_offset = {
        "Rouge": 0,
        "Jaune": 7,
        "Bleu": 14,
        "Vert": 21
    }
    
    # Pattern de base pour Rouge (jours de travail dans le cycle de 28 jours)
    # Jours 1-2 (Jour), 3-4 (Nuit), 15-16 (Jour), 17-18 (Nuit)
    jours_travail_rouge = [1, 2, 3, 4, 15, 16, 17, 18]
    
    # Appliquer l'offset pour l'équipe sélectionnée
    offset = equipes_offset[equipe]
    jours_travail = [(j - 1 + offset) % 28 + 1 for j in jours_travail_rouge]
    
    print(f"Équipe {equipe} (offset {offset}): jours de travail = {sorted(jours_travail)}")
    
    # Parser la date du Jour 1
    jour_1 = datetime.strptime(date_jour_1, "%Y-%m-%d").date()
    
    # Générer du 1er janvier au 31 décembre
    date_debut = datetime(annee, 1, 1).date()
    date_fin = datetime(annee, 12, 31).date()
    
    count = 0
    working_days = []
    
    current_date = date_debut
    while current_date <= date_fin:
        # Calculer le jour dans le cycle (1-28)
        jours_depuis_jour1 = (current_date - jour_1).days
        jour_cycle = (jours_depuis_jour1 % 28) + 1
        
        # Si le jour EST dans les jours de travail, c'est une INDISPONIBILITÉ
        if jour_cycle in jours_travail:
            count += 1
            working_days.append((current_date.isoformat(), jour_cycle))
        
        current_date += timedelta(days=1)
    
    print(f"Total working days for {equipe} in {annee}: {count}")
    
    # Show first few and last few working days
    print("First 10 working days:")
    for i, (date, cycle_day) in enumerate(working_days[:10]):
        print(f"  {date} (cycle day {cycle_day})")
    
    print("Last 10 working days:")
    for i, (date, cycle_day) in enumerate(working_days[-10:]):
        print(f"  {date} (cycle day {cycle_day})")
    
    # Calculate cycles in year
    total_days = (date_fin - date_debut).days + 1
    cycles = total_days / 28
    expected_per_cycle = len(jours_travail)
    expected_total = cycles * expected_per_cycle
    
    print(f"Year has {total_days} days = {cycles:.2f} cycles")
    print(f"Working days per cycle: {expected_per_cycle}")
    print(f"Expected total: {expected_total:.1f}")
    
    return count

if __name__ == "__main__":
    print("=== Quebec 10/14 Logic Verification ===")
    print()
    
    # Test with the same parameters as our test
    annee = 2025
    date_jour_1 = "2025-01-06"
    equipe = "Jaune"
    
    count = calculate_quebec_days(annee, date_jour_1, equipe)
    
    print()
    print(f"RESULT: {count} working days for {equipe} team in {annee}")
    print(f"Expected from review request: ~52")
    print(f"Actual from test: 105")
    print()
    
    if count > 80:
        print("❌ Count is too high - there might be an issue with the logic")
    elif 45 <= count <= 60:
        print("✅ Count is within expected range")
    else:
        print("⚠️  Count is outside expected range but not extremely high")