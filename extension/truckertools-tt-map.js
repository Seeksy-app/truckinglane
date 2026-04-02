/* Imported by background.js (service worker) for mapTruckerToolsResponseToLoads. */
const TRUCKERTOOLS_AGENCY_ID = '25127efb-6eef-412a-a5d0-3d8242988323';

function ttPickNumber(...vals) {
  for (const v of vals) {
    if (v == null) continue;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const n = parseFloat(String(v).replace(/[$,]/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function ttStr(x) {
  if (x == null) return '';
  return String(x).trim();
}

function extractTruckerToolsLoadsArray(json) {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== 'object') return [];
  // getNearbyLoadsV5 (and similar): the load array is response.data — not response.loads or data.loads.
  if (Array.isArray(json.data)) {
    return json.data;
  }
  const keys = [
    'nearbyLoads',
    'nearby_loads',
    'searchResults',
    'results',
    'matches',
    'items',
    'getNearbyLoadsV5',
  ];
  for (const k of keys) {
    const v = json[k];
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object') return v;
  }
  if (json.data && typeof json.data === 'object' && !Array.isArray(json.data)) {
    for (const k of keys) {
      const v = json.data[k];
      if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object') return v;
    }
    const gql = json.data.getNearbyLoadsV5;
    if (Array.isArray(gql) && gql.length > 0 && typeof gql[0] === 'object') return gql;
    if (gql && typeof gql === 'object') {
      for (const k of keys) {
        const v = gql[k];
        if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object') return v;
      }
    }
  }
  for (const k of Object.keys(json)) {
    const v = json[k];
    if (
      Array.isArray(v) &&
      v.length > 0 &&
      typeof v[0] === 'object' &&
      (k.toLowerCase().includes('load') || k.toLowerCase().includes('nearby'))
    ) {
      return v;
    }
  }
  return [];
}

function mapTruckerToolsLoad(raw, idx) {
  const numericFields = Object.entries(raw).filter(
    ([k, v]) =>
      (typeof v === 'number' && v > 100) ||
      (typeof v === 'string' && parseFloat(v) > 100 && !isNaN(parseFloat(v))),
  );
  console.log('[TT RATE FIELDS]', numericFields.map(([k, v]) => k + ':' + v).join(', '));

  const origins = Array.isArray(raw.origins) ? raw.origins : raw.origin ? [raw.origin] : [];
  const o0 = origins[0] || {};
  const dests = Array.isArray(raw.destinations) ? raw.destinations : [];
  const d0 = dests[0] || {};

  const pickup_city =
    ttStr(raw.originCity) ||
    ttStr(o0.city || o0.cityName || o0.locality || o0.name);
  const pickup_state = ttStr(raw.originState || o0.state || o0.stateCode || o0.region).slice(
    0,
    8
  );
  const dest_city =
    ttStr(raw.destinationCity) ||
    ttStr(d0.city || d0.cityName || d0.locality || d0.name);
  const dest_state = ttStr(
    raw.destinationState || d0.state || d0.stateCode || d0.region
  ).slice(0, 8);

  const ship_date = ttStr(
    raw.pickupDate ??
      raw.pickupDateFrom ??
      raw.pickup_date ??
      raw.pickupFrom ??
      null
  );
  // API field is truckTypes (string, e.g. "Flatbed"); fallbacks for other shapes.
  const trailer_type =
    ttStr(raw.truckTypes) || ttStr(raw.equipmentType) || ttStr(raw.trailerType);

  const weight_lbs = ttPickNumber(
    raw.weight,
    raw.weightLbs,
    raw.weight_lbs,
    raw.totalWeight
  );
  const offerRate = ttPickNumber(
    raw.offerRate,
    raw.rate,
    raw.totalRate,
    raw.customerRate,
    raw.price,
    raw.loadRate,
    raw.carrierRate,
    raw.offerAmount,
    raw.bookItNowRate,
    raw.binRate,
  );
  const miles_tt = ttPickNumber(raw.distance, raw.miles);
  const trailer_footage = ttPickNumber(raw.length);
  const commodity = ttStr(raw.commodityId) || null;

  const r = offerRate;
  const target_pay =
    r != null && Number.isFinite(r) ? Math.round(r * 0.8) : 0;
  const max_pay = r != null && Number.isFinite(r) ? Math.round(r * 0.85) : 0;
  const target_commission =
    r != null && Number.isFinite(r) ? Math.round(r * 0.2) : 0;
  const max_commission =
    r != null && Number.isFinite(r) ? Math.round(r * 0.15) : 0;

  const id =
    raw.id ??
    raw.loadId ??
    raw.shipmentId ??
    raw.uuid ??
    raw.referenceId ??
    raw.referenceNumber ??
    `gen-${idx}-${Date.now()}`;
  const load_number = `TT-${String(id).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120)}`;

  return {
    agency_id: TRUCKERTOOLS_AGENCY_ID,
    template_type: 'truckertools',
    load_number,
    dispatch_status: 'open',
    status: 'open',
    pickup_city: pickup_city || null,
    pickup_state: pickup_state || null,
    pickup_location_raw:
      pickup_city && pickup_state
        ? `${pickup_city}, ${pickup_state}`
        : pickup_city || null,
    dest_city: dest_city || null,
    dest_state: dest_state || null,
    dest_location_raw:
      dest_city && dest_state ? `${dest_city}, ${dest_state}` : dest_city || null,
    ship_date: ship_date || null,
    trailer_type: trailer_type || null,
    weight_lbs,
    miles: miles_tt != null ? miles_tt : undefined,
    commodity,
    trailer_footage: trailer_footage != null ? trailer_footage : undefined,
    rate_raw: r,
    customer_invoice_total: r != null && Number.isFinite(r) ? r : 0,
    target_pay,
    max_pay,
    target_commission,
    max_commission,
    commission_target_pct: r != null && Number.isFinite(r) ? 0.2 : 0,
    commission_max_pct: r != null && Number.isFinite(r) ? 0.15 : 0,
    is_per_ton: false,
    is_active: true,
    source_row: JSON.stringify({
      truckertools: true,
      scraped_at: new Date().toISOString(),
      raw,
    }),
  };
}

/** @param json Full API response; load rows are read from json.data via extractTruckerToolsLoadsArray. */
function mapTruckerToolsResponseToLoads(json) {
  const rows = extractTruckerToolsLoadsArray(json);
  return rows.map((r, i) => {
    const load = mapTruckerToolsLoad(r, i);
    delete load.trailer_footage;
    delete load.target_commission;
    delete load.max_commission;
    delete load.commission_target_pct;
    delete load.commission_max_pct;
    return load;
  });
}
