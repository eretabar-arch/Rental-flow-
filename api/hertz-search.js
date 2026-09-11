const HERTZ_CR_LOCATIONS = {
  SJO: {
    code: 'SJOT51',
    label: 'San José International Airport (SJO)',
    publicUrl: 'https://www.hertz.com/us/en/location/costarica/sanjose/sjot51'
  },
  'SAN JOSE': {
    code: 'SJOC61',
    label: 'San José — Paseo Colón',
    publicUrl: 'https://www.hertz.com/rentacar/location/templates/locationResultsView.jsp?city=San+Jose&country=CR&tab=4'
  }
};

function asDate(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function locationFor(v='') {
  const key = String(v).trim().toUpperCase();
  if (HERTZ_CR_LOCATIONS[key]) return HERTZ_CR_LOCATIONS[key];
  if (key.includes('SJO') || key.includes('JUAN SANTAMARIA')) return HERTZ_CR_LOCATIONS.SJO;
  if (key.includes('PASEO COLON') || key.includes('SAN JOSÉ') || key.includes('SAN JOSE')) return HERTZ_CR_LOCATIONS['SAN JOSE'];
  return null;
}

async function publicProbe(location) {
  const started = Date.now();
  const r = await fetch(location.publicUrl, {
    headers: {
      'User-Agent': 'NEAR-Drive-Provider-Healthcheck/1.0',
      'Accept': 'text/html,application/xhtml+xml'
    }
  });
  const text = await r.text();
  return {
    ok: r.ok,
    httpStatus: r.status,
    latencyMs: Date.now() - started,
    locationPageMatched: /Juan Santamaria International Airport|San Jose - Paseo Colon/i.test(text),
    sourceUrl: location.publicUrl
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const pickup = locationFor(req.query.pickup || 'SJO');
  const dropoff = locationFor(req.query.dropoff || req.query.pickup || 'SJO');
  const pickupAt = asDate(req.query.pickupAt);
  const dropoffAt = asDate(req.query.dropoffAt);

  if (!pickup || !dropoff) {
    return res.status(400).json({ error: 'Unsupported Hertz Costa Rica location for this adapter test.' });
  }
  if (!pickupAt || !dropoffAt || dropoffAt <= pickupAt) {
    return res.status(400).json({ error: 'Valid pickupAt and dropoffAt are required.' });
  }

  const rentalHours = Math.round((dropoffAt - pickupAt) / 36e5);
  const rentalDays = rentalHours / 24;
  const probe = await publicProbe(pickup).catch(e => ({ ok:false, error:e.message, sourceUrl:pickup.publicUrl }));

  // Important: Hertz public location pages contain reference/aggregate pricing but are not
  // a transactional availability feed. NEAR deliberately refuses to treat those figures as
  // a live quote. Live offers are enabled only when an authorized Hertz Costa Rica feed/bridge
  // contract is configured.
  const bridge = process.env.HERTZ_CR_AUTHORIZED_SEARCH_URL;
  if (!bridge) {
    return res.status(200).json({
      provider: 'HERTZ_CR',
      test: true,
      query: {
        pickup: pickup.label,
        pickupCode: pickup.code,
        dropoff: dropoff.label,
        dropoffCode: dropoff.code,
        pickupAt: pickupAt.toISOString(),
        dropoffAt: dropoffAt.toISOString(),
        rentalDays
      },
      source: probe,
      availability: 'NOT_QUERIED',
      offers: [],
      liveRates: false,
      sourceStatus: probe.ok ? 'OFFICIAL_PUBLIC_SOURCE_REACHABLE' : 'OFFICIAL_PUBLIC_SOURCE_UNREACHABLE',
      integrationStatus: 'AUTHORIZED_RATE_FEED_REQUIRED',
      note: 'No price has been invented. Public Hertz location statistics are not used as a live 7-day quote.'
    });
  }

  const token = process.env.HERTZ_CR_AUTHORIZED_SEARCH_TOKEN;
  const upstream = await fetch(bridge, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
      pickupCode: pickup.code,
      dropoffCode: dropoff.code,
      pickupAt: pickupAt.toISOString(),
      dropoffAt: dropoffAt.toISOString(),
      residency: 'NON_RESIDENT'
    })
  });

  const raw = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    return res.status(502).json({
      provider: 'HERTZ_CR', liveRates:false, integrationStatus:'UPSTREAM_ERROR', upstreamStatus:upstream.status
    });
  }

  // The authorized bridge must return a documented normalized contract. We pass it through here;
  // category mapping and TRUE PRICE computation happen only after mandatory fields are verified.
  return res.status(200).json({
    provider: 'HERTZ_CR',
    liveRates: true,
    integrationStatus: 'AUTHORIZED_FEED_CONNECTED',
    query: { pickup:pickup.label, dropoff:dropoff.label, pickupAt:pickupAt.toISOString(), dropoffAt:dropoffAt.toISOString(), rentalDays },
    upstream: raw
  });
}
