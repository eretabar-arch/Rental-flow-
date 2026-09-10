const fallbackProfiles = [
  { keys:['escazu','san jose','sjo','alajuela','heredia','cartago','jaco'], mode:'city', score:18, level:'EASY', paved:98, gravel:2, remote:0, need4x4:false },
  { keys:['manuel antonio','quepos','uvita','dominical','la fortuna','arenal','tamarindo','playas del coco','coco','liberia','lir','puerto viejo','cahuita'], mode:'mixed', score:54, level:'MODERATE', paved:75, gravel:22, remote:3, need4x4:false },
  { keys:['monteverde','santa elena','nosara','samara','san gerardo de dota','bajos del toro'], mode:'mountain', score:82, level:'CHALLENGING', paved:55, gravel:35, remote:10, need4x4:true },
  { keys:['santa teresa','mal pais','montezuma','drake bay','bahia drake','pavones','carate','corcovado','osa peninsula','peninsula de osa'], mode:'remote', score:96, level:'4X4 REQUIRED', paved:25, gravel:50, remote:25, need4x4:true }
];

const norm = (s='') => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
function fallback(origin,destination){
  const dest=norm(destination), originText=norm(origin);
  let hit=fallbackProfiles.find(p=>p.keys.some(k=>dest.includes(norm(k))));
  if(!hit) hit=fallbackProfiles.find(p=>p.keys.some(k=>originText.includes(norm(k)))) || fallbackProfiles[1];
  return {...hit, source:'NEAR destination intelligence', confidence:72};
}

async function geocode(text,key){
  const url=`https://api.heigit.org/geocoding/v1/search?api_key=${encodeURIComponent(key)}&text=${encodeURIComponent(text+', Costa Rica')}&size=1`;
  const r=await fetch(url); if(!r.ok) throw new Error('geocode');
  const j=await r.json(); const c=j?.features?.[0]?.geometry?.coordinates; if(!c) throw new Error('geocode-empty');
  return c;
}

function pctFromExtra(extra,total){
  if(!extra?.values?.length || !total) return 0;
  let sum=0;
  for(const v of extra.values){ if(Array.isArray(v) && v.length>=3) sum += Math.max(0,(v[1]-v[0])); }
  return Math.min(100,Math.round(sum/Math.max(1,total)*100));
}

export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({error:'GET only'});
  const origin=String(req.query.origin||''); const destination=String(req.query.destination||'');
  if(!origin || !destination) return res.status(400).json({error:'origin and destination are required'});
  const base=fallback(origin,destination);
  const key=process.env.OPENROUTESERVICE_API_KEY;
  if(!key) return res.status(200).json({...base, live:false, note:'Live route API ready; using NEAR destination intelligence until OPENROUTESERVICE_API_KEY is configured.'});
  try{
    const [a,b]=await Promise.all([geocode(origin,key),geocode(destination,key)]);
    const r=await fetch('https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson',{
      method:'POST',headers:{Authorization:key,'Content-Type':'application/json'},
      body:JSON.stringify({coordinates:[a,b],elevation:true,extra_info:['surface','waytype','steepness']})
    });
    if(!r.ok) throw new Error(`route-${r.status}`);
    const j=await r.json(); const f=j?.features?.[0]; const s=f?.properties?.summary||{}; const ex=f?.properties?.extras||{};
    const distanceKm=Math.round((s.distance||0)/1000);
    const steepPct=pctFromExtra(ex.steepness,s.distance||1);
    const unpavedHint=Math.max(base.gravel, pctFromExtra(ex.surface,s.distance||1));
    let score=Math.round(base.score*.55 + Math.min(100,unpavedHint*1.15 + steepPct*1.2 + Math.min(25,distanceKm/12))*.45);
    score=Math.max(8,Math.min(100,score));
    const need4x4=base.need4x4 || score>=78;
    const level=score>=90?'4X4 REQUIRED':score>=72?'CHALLENGING':score>=42?'MODERATE':'EASY';
    return res.status(200).json({
      live:true,source:'NEAR AI + openrouteservice',confidence:92,origin,destination,distanceKm,score,level,need4x4,
      paved:Math.max(0,100-unpavedHint),gravel:unpavedHint,remote:base.remote,
      factors:{destinationBase:base.score,steepnessSignal:steepPct,surfaceSignal:unpavedHint},
      reason: need4x4 ? 'NEAR AI analyzed the route and found road conditions where added clearance and 4x4 capability materially improve suitability.' : 'NEAR AI analyzed the route and found that a lower-cost paved-road vehicle can remain a strong match.'
    });
  }catch(e){
    return res.status(200).json({...base,live:false,note:'Live route service unavailable; NEAR automatically used its destination intelligence fallback.'});
  }
}