from pathlib import Path
p=Path('index.html')
s=p.read_text()

locations = {
'Adobe Rent a Car': [
'SJO Airport / Río Segundo, Alajuela','San José / Barrio Corazón de Jesús','LIR Airport / Guardia, Liberia','Heredia / El Fortín','Liberia Downtown','Cartago Downtown','Ciudad Quesada / Boreal Shopping Center','Grecia / Lubricentro Oso','San Pedro / Mall Plaza Carolina','Limón Downtown','Puerto Viejo de Talamanca','Puntarenas / Fiesta Resort, El Roble','Manuel Antonio / Quepos Downtown','Quepos Downtown','Tamarindo / Conchal-Brasilito area','Uvita / Bahía Ballena'
],
'Alamo Rent a Car': [
'Belén Heredia','Botanika Osa Peninsula','Brasilito','Cartago','Ciudad Quesada','Cobano Airport (ACO)','Cobano Downtown','Coco','Curridabat','Dominical','Dota','Downtown Liberia','Downtown Quepos','Downtown San José Paseo Colón','Flamingo Beach','Four Seasons Guests Only','Golfito','Golfito Airport (GLF)','Guanacaste Dreams Las Mareas Resort','Guápiles','Heredia San Francisco','Hilton Garden Aeropuerto','Hotel Andaz Guests Only','Hotel Barcelo San Jose','Hotel Hampton Guanacaste','Hotel Hilton Garden','Hotel Holiday Inn San Jose Sabana','Hotel Marriott Hacienda Belen','Hotel Secrets','JW Marriott Guanacaste','Jaco','La Fortuna','La Fortuna Airport (FON)','Las Catalinas','Liberia International Airport (LIR)','Limon Airport (LIO)','Limón','Lindora Momentum Plaza','Los Sueños Marina Village','Malpais','Manuel Antonio','Monte Verde','Nicoya','Nosara','Nosara Airport (NOB)','Palmares','Paso Canoas','Penas Blancas','Perez Zeledon','Playa Hermosa Occidental Papagayo Hotel','Puerto Jiménez Airport (PJM)','Puerto Viejo de Talamanca','Puntarenas Downtown','Quepos Airport (XQP)','Quepos Pez Vela Marina','Rohrmoser','Samara','San Jose Costa Rica Intl Airport (SJO)','San José Homewood Suites Hilton','San José Plaza Viquez','Tamarindo Airport (TNO)','Tamarindo Downtown','Tobias Bolanos Airport (SYQ)','Uvita'
],
'Hertz Rent a Car': [
'San José','Jaco - Plaza Coral','San Jose - Paseo Colon','Uvita City Center','Juan Santamaria International Airport (SJO)','Liberia Off Airport Costa Rica','Alajuela - Rio Segundo','Liberia - 800 m East from Daniel Oduber International Airport'
],
'Dollar Rent a Car': [
'Main Office / La Ribera de Belén','San José International Airport (SJO)','Liberia Main Airport Office / Route 21','Daniel Oduber Quirós International Airport (LIR)'
],
'Thrifty Rent a Car': [
'Main Office / La Ribera de Belén','San José International Airport (SJO)','Liberia Main Airport Office / Route 21','Daniel Oduber Quirós International Airport (LIR)'
]
}

def esc(v):
    return v.replace('&','&amp;').replace('"','&quot;').replace('<','&lt;').replace('>','&gt;')

opts=[]
for brand, vals in locations.items():
    for loc in vals:
        opts.append(f'<option value="{esc(brand)} — {esc(loc)}"></option>')
options=''.join(opts)
datalist=f'<datalist id="nearPickupLocations">{options}</datalist>'
old='<input id="pickup" value="San José Airport (SJO)">' 
new='<input id="pickup" list="nearPickupLocations" value="Alamo Rent a Car — San Jose Costa Rica Intl Airport (SJO)" autocomplete="off" placeholder="Search supplier, airport, city or office">'+datalist+'<div class="pickupHint">Verified Costa Rica pickup offices · Adobe · Alamo · Hertz · Dollar · Thrifty</div>'
if old in s:
    s=s.replace(old,new,1)
elif 'list="nearPickupLocations"' not in s:
    raise SystemExit('pickup input signature not found')

if '.pickupHint{' not in s:
    s=s.replace('.gps{margin-top:10px', '.pickupHint{font-size:8px;color:#60726a;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.gps{margin-top:10px',1)

# Keep route analysis geocodable while preserving exact supplier office in reservation.
helper="function pickupRouteText(v){return String(v||'').replace(/^(Adobe Rent a Car|Alamo Rent a Car|Hertz Rent a Car|Dollar Rent a Car|Thrifty Rent a Car)\\s*—\\s*/i,'').replace(/\\s*\\/\\s*/g,', ')}"
if 'function pickupRouteText(' not in s:
    s=s.replace('function normalize(s){',helper+'\nfunction normalize(s){',1)

s=s.replace("const origin=r1.value||pickup.value,destination=r2.value||dropoff.value;","const origin=pickupRouteText(r1.value||pickup.value),destination=r2.value||dropoff.value;",1)

# Synchronize exact pickup office to Route Intelligence but route API receives cleaned location text.
if "pickup.addEventListener('change'" not in s:
    hook="document.addEventListener('DOMContentLoaded',()=>{const p=document.getElementById('pickup');if(p){p.addEventListener('change',()=>{if(window.r1)r1.value=p.value;autoAnalyzeRoute()});p.addEventListener('input',()=>{if(window.r1)r1.value=p.value})}});"
    s=s.replace('function setDates(){',hook+'\nfunction setDates(){',1)

p.write_text(s)
print('pickup locations:',sum(len(v) for v in locations.values()))
