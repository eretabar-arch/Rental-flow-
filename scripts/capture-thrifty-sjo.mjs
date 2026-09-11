import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const pickupDate = process.env.PICKUP_DATE || '09/24/2026';
const dropoffDate = process.env.DROPOFF_DATE || '10/01/2026';
const pickupTime = process.env.PICKUP_TIME || '10:00';
const dropoffTime = process.env.DROPOFF_TIME || '10:00';
const baseUrl = 'https://thrifty.cr/reserva/';
const outDir = 'capture/thrifty-sjo';
const office = 'SAN JOSE DOWNTOWN';
const q = new URLSearchParams({
  pickup_location: office, pickup_code: '1', pickup_date: pickupDate, pickup_time: pickupTime,
  dropoff_location: office, dropoff_code: '1', dropoff_date: dropoffDate, dropoff_time: dropoffTime
});
const searchUrl = `${baseUrl}?${q.toString()}`;

await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const network=[];
page.on('response', async r=>{ try { const ct=(r.headers()['content-type']||'').toLowerCase(); if(!ct.includes('json')&&!ct.includes('text')) return; const text=await r.text(); if(/price|precio|tarifa|rate|total|vehicle|vehiculo|usd/i.test(text)) network.push({url:r.url(),status:r.status(),contentType:ct,body:text.slice(0,200000)}); } catch{} });

let result;
try {
  await page.goto(searchUrl,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(8000);
  const current = new URL(page.url());
  const exactDates = current.searchParams.get('pickup_date')===pickupDate && current.searchParams.get('dropoff_date')===dropoffDate;
  const blocked = /captcha|access denied|forbidden|robot|unusual traffic|cloudflare/i.test(await page.locator('body').innerText());
  const vehicles = await page.locator('.vehicle-card').evaluateAll(cards => cards.map(c => ({
    supplierGroup:c.getAttribute('data-group'),
    vehicle:(c.querySelector('.car-title')?.textContent||'').trim(),
    supplierCategory:(c.querySelector('.car-subtitle')?.textContent||'').trim(),
    displayedDaily:(c.querySelector('.price-section .amount')?.textContent||'').trim(),
    paymentType:c.getAttribute('data-payment-type'),
    dataPrice:c.getAttribute('data-price'),
    originalDaily:c.getAttribute('data-original-price'),
    perDayBaseRent:c.getAttribute('data-per-day-base-rent'),
    perDayAfterDiscount:c.getAttribute('data-per-day-after-discount'),
    totalBaseRentPayNow:c.getAttribute('data-total-base-rent-pay-now'),
    totalBaseRentPayLater:c.getAttribute('data-total-base-rent-pay-later'),
    totalBaseRent:c.getAttribute('data-total-base-rent')
  })));
  await page.screenshot({path:`${outDir}/result.png`,fullPage:true});
  await fs.writeFile(`${outDir}/result.html`,await page.content());
  await fs.writeFile(`${outDir}/network.json`,JSON.stringify(network,null,2));
  await fs.writeFile(`${outDir}/vehicles.json`,JSON.stringify(vehicles,null,2));
  result={
    ok: !blocked && exactDates && vehicles.length>0,
    provider:'THRIFTY_CR', sourceMode:'PUBLIC_BOOKING_FLOW', sourceUrl:searchUrl,
    pickupOffice:office, dropoffOffice:office, pickupDate, dropoffDate, pickupTime, dropoffTime,
    sevenDayBenchmark:true, exactDatesObserved:exactDates, currentUrl:page.url(), blocked,
    vehiclesObserved:vehicles.length, vehicles,
    networkResponsesCaptured:network.length,
    status: blocked?'PUBLIC_FLOW_BLOCKED':(!exactDates?'DATE_MISMATCH':vehicles.length?'VEHICLE_RATE_CARDS_OBSERVED':'NO_VERIFIABLE_RATE_RESULT'),
    note:'Captured only values rendered by the public booking flow. No inferred insurance, fees, deposit or TRUE PRICE.',
    capturedAt:new Date().toISOString()
  };
} catch(e){ result={ok:false,provider:'THRIFTY_CR',sourceMode:'PUBLIC_BOOKING_FLOW',sourceUrl:searchUrl,pickupDate,dropoffDate,pickupTime,dropoffTime,reason:'CAPTURE_ERROR',error:String(e?.message||e),capturedAt:new Date().toISOString()}; }
await fs.writeFile(`${outDir}/summary.json`,JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
await browser.close();
if(!result.ok) process.exitCode=2;
