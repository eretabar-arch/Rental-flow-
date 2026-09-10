const fs=require('fs');
const p='index.html';
let s=fs.readFileSync(p,'utf8');

s=s.replace(
"function autoAnalyzeRoute(){const origin=r1.value||pickup.value,destination=r2.value||dropoff.value;const x=inferRoute(origin,destination);applyRoute(x.mode,x.note)}",
`async function autoAnalyzeRoute(){
 const origin=r1.value||pickup.value,destination=r2.value||dropoff.value;
 const fallback=inferRoute(origin,destination);applyRoute(fallback.mode,fallback.note);
 try{
  const resp=await fetch('/api/route?origin='+encodeURIComponent(origin)+'&destination='+encodeURIComponent(destination));
  if(!resp.ok)return; const live=await resp.json();
  if(live.mode)routeMode=live.mode; else if(live.score>=90)routeMode='remote'; else if(live.score>=72)routeMode='mountain'; else if(live.score>=42)routeMode='mixed'; else routeMode='city';
  const note=(live.reason||live.note||'')+' Analysis source: '+(live.source||'NEAR AI route intelligence')+(live.live?' · live route data':' · destination intelligence fallback')+'.';
  applyRoute(routeMode,note);
  if(live.score!=null)routeScore.textContent=Math.round(live.score)+'/100';
  if(live.level)routeLevel.textContent=live.level;
  if(live.paved!=null)fPaved.textContent=Math.round(live.paved)+'%';
  if(live.gravel!=null)fGravel.textContent=Math.round(live.gravel)+'%';
  if(live.remote!=null)fRemote.textContent=Math.round(live.remote)+'%';
  if(live.need4x4!=null)f4x4.textContent=live.need4x4?(live.score>=90?'Required':'Recommended'):'Optional';
  evidence.innerHTML='<b>NEAR AI analyzed your route</b><br>'+(live.reason||live.note||'Route conditions were evaluated before ranking the vehicles.')+'<br><br><b>Analysis source:</b> '+(live.source||'NEAR AI route intelligence')+(live.live?' · LIVE':' · fallback')+'.';
 }catch(e){}
}`
);

s=s.replace(
"function reason(c){const p=routeProfiles[routeMode];if(p.need4x4&&c.tags.includes('4x4'))return `Route difficulty ${p.score}/100: 4x4 capability materially improves this match.`;if(p.need4x4&&!c.tags.includes('4x4'))return 'Lower price, but route suitability is penalized because this destination benefits from stronger road capability.';if(routeMode==='city'&&!c.tags.includes('4x4'))return 'Paved route: NEAR gives more weight to True Price and avoids charging you for unnecessary 4x4 capability.';return 'Balanced route: total price, road fit and rental conditions are weighted together.'}",
`function reason(c){const p=routeProfiles[routeMode];if(p.need4x4&&c.tags.includes('4x4'))return 'NEAR AI analyzed your route before ranking this vehicle. The road profile shows that 4x4 capability, clearance and stability materially improve suitability for your destination.';if(p.need4x4&&!c.tags.includes('4x4'))return 'NEAR AI analyzed your route and found demanding road conditions. This vehicle is cheaper, but its score is reduced because it lacks the capability NEAR recommends for the destination.';if(routeMode==='city'&&!c.tags.includes('4x4'))return 'NEAR AI analyzed your route as predominantly paved. This vehicle scores well because you avoid paying extra for unnecessary 4x4 capability while keeping a strong True Price.';return 'NEAR AI analyzed the origin and destination first. This vehicle was ranked by True Price, road suitability, rental terms, vehicle fit and supplier quality.'}`
);

s=s.replace('<b>Why NEAR ranked it here</b><br>${reason(c)}','<b>Why this car fits your trip</b><br><span style="font-weight:850;color:#527400">NEAR AI route analysis</span><br>${reason(c)}');
s=s.replace('<small>EXPLAINABLE NEAR MATCH</small><br><strong>${c.match}%</strong><div style="font-size:12px;color:#d5e0db;margin-top:4px">${reason(c)}</div>','<small>EXPLAINABLE NEAR MATCH · ROUTE PRE-ANALYZED BY NEAR AI</small><br><strong>${c.match}%</strong><div style="font-size:12px;color:#d5e0db;margin-top:4px">${reason(c)}</div>');
s=s.replace("function searchCars(){r1.value=pickup.value;r2.value=dropoff.value;const x=inferRoute(pickup.value,dropoff.value);applyRoute(x.mode,x.note);summary.textContent=`${pickup.value||'Pickup'} → ${dropoff.value||'Destination'} · automatic route-aware ranking`;results.classList.add('active');results.scrollIntoView({behavior:'smooth'})}",
`async function searchCars(){r1.value=pickup.value;r2.value=dropoff.value;await autoAnalyzeRoute();summary.textContent=(pickup.value||'Pickup')+' → '+(dropoff.value||'Destination')+' · route pre-analyzed by NEAR AI';results.classList.add('active');results.scrollIntoView({behavior:'smooth'})}`);

fs.writeFileSync(p,s);
