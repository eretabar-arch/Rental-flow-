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
page.on('response', async r=>{ try { const ct=(r.headers()['content-type']||'').toLowerCase(); if(!ct.includes('json')&&!ct.includes('text')) return; const text=await r.text(); if(/price|precio|tarifa|rate|total|vehicle|vehiculo|usd|protection|protecci|fee|tax|impuesto|deposit/i.test(text)) network.push({url:r.url(),status:r.status(),contentType:ct,body:text.slice(0,200000)}); } catch{} });

const clean = s => String(s || '').replace(/\s+/g,' ').trim();
const textOf = async sel => clean(await page.locator(sel).first().innerText().catch(()=>''));

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
  if(blocked || !exactDates || !vehicles.length) throw new Error(blocked?'Public flow blocked':(!exactDates?'Exact 7-day dates not preserved':'No vehicles found'));

  const versa = page.locator('.vehicle-card').filter({hasText:/Nissan Versa/i}).first();
  if(!await versa.count()) throw new Error('Nissan Versa card not found');
  const versaData = await versa.evaluate(c=>({
    group:c.getAttribute('data-group'),
    daily:c.getAttribute('data-price'),
    perDayBaseRent:c.getAttribute('data-per-day-base-rent'),
    totalPayNow:c.getAttribute('data-total-base-rent-pay-now'),
    totalPayLater:c.getAttribute('data-total-base-rent-pay-later'),
    title:(c.querySelector('.car-title')?.textContent||'').trim(),
    category:(c.querySelector('.car-subtitle')?.textContent||'').trim()
  }));
  await versa.click();
  await page.waitForTimeout(1200);
  if(!await page.locator('#step-2.active').count()) throw new Error('Protection step did not open after selecting Versa');

  const protections = await page.locator('#step-2 .protection-card').evaluateAll(cards=>cards.map(c=>({
    code:c.getAttribute('data-package'),
    name:(c.querySelector('.protection-card-title')?.textContent||'').trim(),
    daily:(c.querySelector('.protection-amount')?.textContent||'').trim(),
    details:(c.querySelector('.protection-features')?.textContent||'').replace(/\s+/g,' ').trim()
  })));
  const noProtectionText = await textOf('#step-2 .protection-without-section');
  await page.screenshot({path:`${outDir}/step2-protections.png`,fullPage:true});

  // Lowest mandatory-price path: continue without optional CDW/BPP/TPP.
  // The page explicitly says the displayed price already includes TPL.
  const riskIcon = page.locator('#protection-without-checkbox-icon');
  if(await riskIcon.count()) await riskIcon.click();
  else {
    const riskLabel = page.locator('.protection-without-checkbox-label');
    if(await riskLabel.count()) await riskLabel.click();
  }
  const riskBtn = page.locator('#protection-without-accept-btn');
  if(!await riskBtn.count()) throw new Error('Continue-without-protection button not found');
  await riskBtn.click();
  await page.waitForTimeout(1000);
  if(!await page.locator('#step-3.active').count()) throw new Error('Services step did not open');

  const services = await page.locator('#step-3 .service-card').evaluateAll(cards=>cards.map(c=>({
    name:(c.querySelector('.service-card-title')?.textContent||'').trim(),
    price:(c.querySelector('.service-card-price')?.textContent||'').replace(/\s+/g,' ').trim()
  })));
  await page.screenshot({path:`${outDir}/step3-services.png`,fullPage:true});
  const servicesContinue = page.locator('#step-3 .services-continue-btn');
  if(!await servicesContinue.count()) throw new Error('Services continue button not found');
  await servicesContinue.click();
  await page.waitForTimeout(1500);
  if(!await page.locator('#step-4.active').count()) throw new Error('Information/payment step did not open');

  const summary = {
    carName: await textOf('#step4-summary-car-name'),
    carDetails: await textOf('#step4-summary-car-details'),
    pickup: await textOf('#step4-summary-pickup-location'),
    dropoff: await textOf('#step4-summary-dropoff-location'),
    rentalDays: await textOf('#step4-summary-rental-days'),
    baseCharges: await textOf('#step4-summary-base-charges'),
    protection: await textOf('#step4-summary-minimum-protections'),
    selectedServices: await textOf('#step4-summary-selected-services'),
    totalEstimated: await textOf('#step4-summary-total'),
    payNow: await textOf('#pay-now-price'),
    payLater: await textOf('#pay-later-price'),
    mileage: await textOf('#step-4 .car-mileage')
  };
  const step4Text = await textOf('#step-4');
  await page.screenshot({path:`${outDir}/step4-final-prepayment.png`,fullPage:true});
  await fs.writeFile(`${outDir}/step4.html`,await page.locator('#step-4').evaluate(el=>el.outerHTML));
  await fs.writeFile(`${outDir}/network.json`,JSON.stringify(network,null,2));
  await fs.writeFile(`${outDir}/vehicles.json`,JSON.stringify(vehicles,null,2));

  const dollars = [...step4Text.matchAll(/(?:USD\s*)?\$\s?([0-9]+(?:[.,][0-9]{1,2})?)/gi)].map(m=>m[0]);
  result={
    ok:true,
    provider:'THRIFTY_CR', sourceMode:'PUBLIC_BOOKING_FLOW', sourceUrl:searchUrl,
    pickupOffice:office, dropoffOffice:office, pickupDate, dropoffDate, pickupTime, dropoffTime,
    sevenDayBenchmark:true, exactDatesObserved:exactDates, currentUrl:page.url(), blocked:false,
    vehiclesObserved:vehicles.length,
    selectedVehicle:versaData,
    protectionPath:'NO_OPTIONAL_PROTECTION_TPL_INCLUDED_BY_PROVIDER_COPY',
    providerProtectionCopy:noProtectionText,
    protectionsObserved:protections,
    optionalServicesObserved:services,
    selectedOptionalServices:[],
    prePaymentSummary:summary,
    observedStep4MoneyTokens:[...new Set(dollars)],
    networkResponsesCaptured:network.length,
    reservationSubmitted:false,
    paymentAttempted:false,
    status:'FINAL_PREPAYMENT_SUMMARY_OBSERVED',
    note:'Stopped before booking/payment. Only values actually rendered by the public booking flow were captured. No guessed fees, insurance, deposit or taxes.',
    capturedAt:new Date().toISOString()
  };
} catch(e){
  try { await page.screenshot({path:`${outDir}/error.png`,fullPage:true}); } catch{}
  await fs.writeFile(`${outDir}/network.json`,JSON.stringify(network,null,2)).catch(()=>{});
  result={ok:false,provider:'THRIFTY_CR',sourceMode:'PUBLIC_BOOKING_FLOW',sourceUrl:searchUrl,pickupDate,dropoffDate,pickupTime,dropoffTime,reason:'CAPTURE_ERROR',error:String(e?.message||e),reservationSubmitted:false,paymentAttempted:false,capturedAt:new Date().toISOString()};
}
await fs.writeFile(`${outDir}/summary.json`,JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
await browser.close();
if(!result.ok) process.exitCode=2;
