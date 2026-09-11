from pathlib import Path
p=Path('index.html')
s=p.read_text()

# Consolidated public pickup locations from Adobe, Alamo, Hertz, Dollar and Thrifty.
# Supplier names are intentionally NOT shown to customers. Duplicate/overlapping offices
# are collapsed into one customer-facing location whenever they refer to the same area.
locations = [
'Alajuela — Río Segundo / SJO area',
'Belén, Heredia — La Ribera',
'Brasilito, Guanacaste',
'Cartago',
'Ciudad Quesada / San Carlos',
'Cobano Airport (ACO)',
'Cobano Downtown',
'Playas del Coco, Guanacaste',
'Curridabat, San José',
'Dominical, Puntarenas',
'Dota / San Gerardo de Dota',
'Flamingo Beach, Guanacaste',
'Four Seasons Peninsula Papagayo',
'Golfito',
'Golfito Airport (GLF)',
'Guápiles, Limón',
'Heredia — San Francisco',
'Heredia — El Fortín',
'Jacó, Puntarenas',
'La Fortuna, San Carlos',
'La Fortuna Airport (FON)',
'Las Catalinas, Guanacaste',
'Liberia Downtown',
'Liberia International Airport (LIR)',
'Limón Downtown',
'Limón Airport (LIO)',
'Lindora / Santa Ana',
'Los Sueños Marina / Herradura',
'Malpaís, Puntarenas',
'Manuel Antonio, Puntarenas',
'Monteverde / Santa Elena',
'Nicoya, Guanacaste',
'Nosara, Guanacaste',
'Nosara Airport (NOB)',
'Palmares, Alajuela',
'Paso Canoas, Puntarenas',
'Peñas Blancas, Guanacaste',
'Pérez Zeledón / San Isidro de El General',
'Playa Hermosa / Papagayo, Guanacaste',
'Puerto Jiménez, Osa',
'Puerto Jiménez Airport (PJM)',
'Puerto Viejo de Talamanca, Limón',
'Puntarenas Downtown',
'Quepos Downtown',
'Quepos Airport (XQP)',
'Quepos — Marina Pez Vela',
'Rohrmoser, San José',
'Sámara, Guanacaste',
'San José — Paseo Colón',
'San José — Plaza Víquez',
'San José — Barrio Corazón de Jesús',
'San José — San Pedro / Mall San Pedro area',
'San José — Tobías Bolaños Airport (SYQ)',
'San José International Airport (SJO)',
'Tamarindo Downtown',
'Tamarindo Airport (TNO)',
'Uvita / Bahía Ballena',
'Grecia, Alajuela',
'Puntarenas — El Roble',
'Guanacaste — Dreams Las Mareas',
'Guanacaste — JW Marriott',
'Guanacaste — Andaz Peninsula Papagayo',
'Guanacaste — Secrets Papagayo',
'Alajuela — Hilton Garden Inn Airport area',
'Alajuela — Hampton by Hilton Airport area',
'Belén, Heredia — Marriott Hacienda Belén',
'San José — Barceló San José',
'San José — Holiday Inn Sabana',
'San José — Homewood Suites by Hilton'
]

def esc(v):
    return v.replace('&','&amp;').replace('"','&quot;').replace('<','&lt;').replace('>','&gt;')

# Defensive deduplication while preserving display order.
seen=set(); unique=[]
for loc in locations:
    key=' '.join(loc.lower().replace('—',' ').replace('/',' ').split())
    if key not in seen:
        seen.add(key); unique.append(loc)

options=''.join(f'<option value="{esc(loc)}"></option>' for loc in unique)
datalist=f'<datalist id="nearPickupLocations">{options}</datalist>'

# Replace either the original demo pickup or an earlier supplier-labelled implementation.
import re
pattern=r'<input id="pickup"(?:\s+[^>]*?)?>'
replacement='<input id="pickup" list="nearPickupLocations" value="San José International Airport (SJO)" autocomplete="off" placeholder="Search airport, city, beach or pickup office">'
if 'id="pickup"' not in s:
    raise SystemExit('pickup input signature not found')
s=re.sub(pattern,replacement,s,count=1)

# Replace or insert the datalist immediately after pickup.
s=re.sub(r'<datalist id="nearPickupLocations">.*?</datalist>','',s,count=1,flags=re.S)
s=s.replace(replacement,replacement+datalist,1)

# Customer-facing helper contains no supplier names.
old_hint=re.compile(r'<div class="pickupHint">.*?</div>',re.S)
if old_hint.search(s):
    s=old_hint.sub('<div class="pickupHint">Pickup locations across Costa Rica · duplicates consolidated</div>',s,count=1)
else:
    s=s.replace(datalist,datalist+'<div class="pickupHint">Pickup locations across Costa Rica · duplicates consolidated</div>',1)

if '.pickupHint{' not in s:
    s=s.replace('.gps{margin-top:10px', '.pickupHint{font-size:8px;color:#60726a;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.gps{margin-top:10px',1)

# Normalize display punctuation for route geocoding without exposing supplier identity.
helper="function pickupRouteText(v){return String(v||'').replace(/\\s*[—/]\\s*/g,', ')}"
if 'function pickupRouteText(' not in s:
    s=s.replace('function normalize(s){',helper+'\nfunction normalize(s){',1)
else:
    s=re.sub(r'function pickupRouteText\(v\)\{.*?\}',helper,s,count=1)

s=s.replace("const origin=r1.value||pickup.value,destination=r2.value||dropoff.value;","const origin=pickupRouteText(r1.value||pickup.value),destination=r2.value||dropoff.value;",1)

if "pickup.addEventListener('change'" not in s:
    hook="document.addEventListener('DOMContentLoaded',()=>{const p=document.getElementById('pickup');if(p){p.addEventListener('change',()=>{if(window.r1)r1.value=p.value;autoAnalyzeRoute()});p.addEventListener('input',()=>{if(window.r1)r1.value=p.value})}});"
    s=s.replace('function setDates(){',hook+'\nfunction setDates(){',1)

p.write_text(s)
print('unique customer-facing pickup locations:',len(unique))
