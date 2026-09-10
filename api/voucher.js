function safe(v=''){return String(v??'').replace(/[<>]/g,'').slice(0,1000)}
const SUPABASE_URL='https://oxatqxaddtkjnyfrvmot.supabase.co';
const SUPABASE_KEY='sb_publishable_4cidR7RuGWYAOOrLsLA82A_n_Gkr1WG';
export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'POST only'});
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  const id=Number(req.body?.id);
  if(!token||!Number.isFinite(id)) return res.status(400).json({error:'Missing authorization or reservation id'});
  try{
    const q=await fetch(`${SUPABASE_URL}/rest/v1/near_drive_reservations?id=eq.${id}&select=*`,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`}});
    const rows=await q.json().catch(()=>[]);
    if(!q.ok||!Array.isArray(rows)||!rows[0]) return res.status(q.status===401?401:403).json({error:'Reservation not accessible'});
    const r=rows[0];
    if(!r.supplier_name||!r.supplier_confirmation_number) return res.status(400).json({error:'Supplier name and confirmation number are required before sending voucher.'});
    const resendKey=process.env.RESEND_API_KEY;
    if(!resendKey) return res.status(503).json({error:'Email service is not configured yet.'});
    const html=`<div style="font-family:Arial,sans-serif;max-width:760px;margin:auto;color:#142118"><h1>NEAR Drive · Final Rental Voucher</h1><p>Your rental has been confirmed and prepaid by NEAR.</p><table style="border-collapse:collapse;width:100%"><tr><td>NEAR Reservation</td><td><b>${safe(r.code)}</b></td></tr><tr><td>Supplier</td><td><b>${safe(r.supplier_name)}</b></td></tr><tr><td>Supplier Confirmation</td><td><b>${safe(r.supplier_confirmation_number)}</b></td></tr><tr><td>Vehicle</td><td><b>${safe(r.vehicle)}</b></td></tr><tr><td>Route</td><td><b>${safe(r.pickup)} → ${safe(r.destination)}</b></td></tr><tr><td>Dates</td><td><b>${safe(r.start_date)} → ${safe(r.end_date)}</b></td></tr><tr><td>Rental paid</td><td><b>$${Number(r.total||0).toFixed(2)} paid to NEAR</b></td></tr><tr><td>Rental balance at desk</td><td><b>$0</b></td></tr><tr><td>Refundable security deposit</td><td><b>$${Number(r.deposit||0).toFixed(2)} at rental desk</b></td></tr></table><p><b>Pickup instructions:</b> Present this voucher, sign the rental company contract and provide the refundable security deposit directly to the rental company. The rental itself is prepaid.</p><p>Customer: ${safe(r.customer_first_name)} ${safe(r.customer_last_name)} · ${safe(r.customer_phone)}</p></div>`;
    const e=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${resendKey}`,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.NEAR_FROM_EMAIL||'NEAR Drive <onboarding@resend.dev>',to:[r.customer_email],subject:`NEAR Drive final voucher · ${safe(r.code)}`,html})});
    const data=await e.json().catch(()=>({}));
    if(!e.ok) return res.status(502).json({error:data?.message||`Email ${e.status}`});
    const u=await fetch(`${SUPABASE_URL}/rest/v1/near_drive_reservations?id=eq.${id}`,{method:'PATCH',headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({status:'VOUCHER_SENT',voucher_sent_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
    if(!u.ok) return res.status(500).json({error:'Voucher emailed but status update failed.'});
    return res.status(200).json({ok:true,emailId:data.id||null,status:'VOUCHER_SENT'});
  }catch(e){return res.status(500).json({error:'Voucher service failed.'})}
}
