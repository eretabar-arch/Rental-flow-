import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const pickupDate = process.env.PICKUP_DATE || '09/24/2026';
const dropoffDate = process.env.DROPOFF_DATE || '10/01/2026';
const pickupTime = process.env.PICKUP_TIME || '10:00';
const dropoffTime = process.env.DROPOFF_TIME || '10:00';
const url = 'https://thrifty.cr/reserva/';
const outDir = 'capture/thrifty-sjo';

await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

const network = [];
page.on('response', async (r) => {
  try {
    const ct = (r.headers()['content-type'] || '').toLowerCase();
    if (!ct.includes('json') && !ct.includes('text')) return;
    const text = await r.text();
    if (/price|precio|tarifa|rate|total|vehicle|vehiculo|auto|car|usd/i.test(text)) {
      network.push({ url: r.url(), status: r.status(), contentType: ct, body: text.slice(0, 200000) });
    }
  } catch {}
});

function fail(reason, extra = {}) {
  return { ok: false, provider: 'THRIFTY_CR', sourceMode: 'PUBLIC_BOOKING_FLOW', sourceUrl: url, pickup: 'San José Aeropuerto Internacional (SJO)', dropoff: 'San José Aeropuerto Internacional (SJO)', pickupDate, dropoffDate, pickupTime, dropoffTime, reason, ...extra, capturedAt: new Date().toISOString() };
}

async function pickSJO(select) {
  const opts = await select.locator('option').evaluateAll(os => os.map(o => ({ value:o.value, text:(o.textContent||'').trim() })));
  const hit = opts.find(o => /san jos[eé].*sjo|sjo.*san jos[eé]|juan santamar/i.test(o.text));
  if (!hit) throw new Error('SJO option not found');
  await select.selectOption(hit.value);
  return hit.text;
}

let result;
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);

  const selects = page.locator('select:visible');
  const count = await selects.count();
  if (count < 4) throw new Error(`Expected at least 4 visible selects, found ${count}`);

  const pickupOffice = await pickSJO(selects.nth(0));
  const dropoffOffice = await pickSJO(selects.nth(2));

  const dates = page.locator('input[placeholder*="MM/DD"], input[type="date"]');
  if (await dates.count() < 2) throw new Error('Pickup/dropoff date inputs not found');
  await dates.nth(0).fill(pickupDate);
  await dates.nth(1).fill(dropoffDate);

  const chooseTime = async (sel, target) => {
    const opts = await sel.locator('option').evaluateAll(os => os.map(o => ({ value:o.value, text:(o.textContent||'').trim() })));
    const normalized = target.replace(':', '');
    const hit = opts.find(o => o.text.includes(target) || o.value === target || o.value.replace(':','') === normalized);
    if (hit) await sel.selectOption(hit.value);
  };
  await chooseTime(selects.nth(1), pickupTime);
  await chooseTime(selects.nth(3), dropoffTime);

  const searchButton = page.getByRole('button', { name: /buscar|search/i }).first();
  await searchButton.click();
  await page.waitForTimeout(7000);

  const body = await page.locator('body').innerText();
  const money = [...body.matchAll(/(?:USD\s*)?\$\s?([0-9]+(?:[.,][0-9]{1,2})?)/gi)].map(m => m[0]);
  const hasVehicles = /seleccion[aá].*auto|veh[ií]culo|suv|sedan|compact|4x4|pickup|minivan/i.test(body);
  const blocked = /captcha|access denied|forbidden|robot|unusual traffic|cloudflare/i.test(body);

  await page.screenshot({ path: `${outDir}/result.png`, fullPage: true });
  await fs.writeFile(`${outDir}/result.html`, await page.content());
  await fs.writeFile(`${outDir}/network.json`, JSON.stringify(network, null, 2));

  result = blocked
    ? fail('PUBLIC_FLOW_BLOCKED', { pickupOffice, dropoffOffice, blocked: true })
    : {
        ok: hasVehicles && money.length > 0,
        provider: 'THRIFTY_CR',
        sourceMode: 'PUBLIC_BOOKING_FLOW',
        sourceUrl: url,
        pickupOffice,
        dropoffOffice,
        pickupDate, dropoffDate, pickupTime, dropoffTime,
        sevenDayBenchmark: true,
        observedMoneyTokens: [...new Set(money)].slice(0, 50),
        networkResponsesCaptured: network.length,
        status: hasVehicles && money.length > 0 ? 'RATE_RESULT_OBSERVED' : 'NO_VERIFIABLE_RATE_RESULT',
        note: 'Only values actually rendered or returned by the public booking flow are captured. No guessed prices.',
        capturedAt: new Date().toISOString()
      };
} catch (e) {
  try { await page.screenshot({ path: `${outDir}/error.png`, fullPage: true }); } catch {}
  result = fail('CAPTURE_ERROR', { error: String(e?.message || e) });
}

await fs.writeFile(`${outDir}/summary.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
await browser.close();
if (!result.ok) process.exitCode = 2;
