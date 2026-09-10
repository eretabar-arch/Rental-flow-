function safe(v=''){return String(v).replace(/[<>]/g,'').slice(0,500)}
function line(label,value){return `<tr><td style="padding:7px 10px;color:#66766e">${label}</td><td style="padding:7px 10px;font-weight:700">${safe(value)}</td></tr>`}
const SUPABASE_URL='https://oxatqxaddtkjnyfrvmot.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_4cidR7RuGWYAOOrLsLA82A_n_Gkr1WG';
async function persistReservation(b){
  const row={
    code:b.code,status:'SUPPLIER_PENDING',payment_status:b.paymentStatus||'PENDING',vehicle:b.vehicle,near_match:b.match??null,total:Number(b.total||0),deposit:Number(b.deposit||0),pickup:b.pickup||null,destination:b.destination||null,start_date:b.start||null,end_date:b.end||null,route_mode:b.routeMode||null,
    customer_first_name:b.driver?.first||'',customer_last_name:b.driver?.last||'',customer_email:b.driver?.email||'',customer_phone:b.driver?.phone||'',customer_country:b.driver?.country||null,flight_number:b.driver?.flight||null,delivery_address:b.driver?.delivery||null,extras:Array.isArray(b.extras)?b.extras:[]
  };
  const r=await fetch(`${SUPABASE_URL}/rest/v1/near_drive_reservations`,{method:'POST',headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${SUPABASE_PUBLISHABLE_KEY}`,'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(row)});
  const data=await r.json().catch(()=>null);
  if(!r.ok) throw new Error(data?.message||`Reservation persistence failed (${r.status})`);
  return Array.isArray(data)?data[0]:data;
}
export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'POST only'});
  const b=req.body||{};
  if(!b.code||!b.vehicle||!b.driver?.email||!b.driver?.phone) return res.status(400).json({error:'Missing reservation data'});
  let saved;
  try{saved=await persistReservation(b)}catch(e){console.error('NEAR reservation persistence failed',e);return res.status(500).json({ok:false,error:'Reservation could not be stored. Please try again.'})}
  const adminEmail=process.env.NEAR_ADMIN_EMAIL;
  const resendKey=process.env.RESEND_API_KEY;
  const subject=`NEAR Drive reservation ${safe(b.code)} · Supplier Pending`;
  const html=`<div style="font-family:Arial,sans-serif;max-width:760px;margin:auto"><h2>New NEAR Drive reservation</h2><p><b>Status:</b> SUPPLIER PENDING</p><table style="border-collapse:collapse;width:100%">${line('Reservation',b.code)}${line('Customer',`${b.driver.first||''} ${b.driver.last||''}`)}${line('Email',b.driver.email)}${line('Phone / WhatsApp',b.driver.phone)}${line('Vehicle',b.vehicle)}${line('Route',`${b.pickup||''} → ${b.destination||''}`)}${line('Dates',`${b.start||''} → ${b.end||''}`)}${line('NEAR Match',`${b.match||''}%`)}${line('Customer paid to NEAR',`$${b.total||0}`)}${line('Rental balance at desk','$0')}${line('Security deposit at desk',`$${b.deposit||0}`)}${line('Extras',(b.extras||[]).join(', ')||'None')}${line('Flight',b.driver.flight||'—')}${line('Delivery',b.driver.delivery||'—')}</table><p style="margin-top:20px">Next action: reserve/pay with supplier, then add the supplier confirmation number and send the customer voucher.</p></div>`;
  if(!adminEmail||!resendKey){
    console.warn('NEAR reservation email pending configuration',{code:b.code,hasAdminEmail:!!adminEmail,hasResendKey:!!resendKey});
    return res.status(202).json({ok:true,stored:true,reservationId:saved?.id||null,emailSent:false,status:'SUPPLIER_PENDING',message:'Reservation stored; admin email delivery is pending email-service configuration.'});
  }
  try{
    const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${resendKey}`,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.NEAR_FROM_EMAIL||'NEAR Drive <onboarding@resend.dev>',to:[adminEmail],reply_to:b.driver.email,subject,html})});
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(data?.message||`Email ${r.status}`);
    return res.status(200).json({ok:true,stored:true,reservationId:saved?.id||null,emailSent:true,status:'SUPPLIER_PENDING',emailId:data.id||null});
  }catch(e){
    console.error('NEAR reservation email failed',e);
    return res.status(202).json({ok:true,stored:true,reservationId:saved?.id||null,emailSent:false,status:'SUPPLIER_PENDING',message:'Reservation stored; admin email delivery failed and requires review.'});
  }
}
