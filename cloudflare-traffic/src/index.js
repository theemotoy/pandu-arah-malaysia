// HalaTuju Traffic — Cloudflare Worker (Fasa 1)
// Terima laporan GPS anonim → simpan D1 → agih kelajuan purata per grid.
// PRIVASI: tiada identiti pengguna disimpan. Data lama dipadam automatik.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Data disimpan maksimum 10 minit (cukup untuk trafik masa nyata)
const TTL_SECONDS = 600;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    // Endpoint 1: pengguna hantar lokasi + kelajuan
    if (url.pathname === '/report' && request.method === 'POST') {
      return handleReport(request, env);
    }

    // Endpoint 2: pengguna tarik trafik sekitar (hijau/kuning/merah)
    if (url.pathname === '/traffic' && request.method === 'GET') {
      return handleTraffic(request, env);
    }

    // Endpoint 3: lapor insiden (kemalangan/jam/rosak/polisi)
    if (url.pathname === '/incident' && request.method === 'POST') {
      return handleIncident(request, env);
    }

    // Endpoint 4: tarik insiden sekitar
    if (url.pathname === '/incidents' && request.method === 'GET') {
      return handleIncidents(request, env);
    }

    return json({ ok: true, name: 'HalaTuju Traffic', endpoints: ['/report', '/traffic', '/incident', '/incidents'] });
  },
};

async function handleReport(request, env) {
  try {
    const { lat, lng, speed, heading } = await request.json();
    if (lat == null || lng == null) {
      return json({ error: 'Perlu lat & lng' }, 400);
    }

    const now = Math.floor(Date.now() / 1000);
    const spd = clamp(speed || 0, 0, 200);
    const hdg = heading || 0;

    await env.DB.prepare(
      'INSERT INTO reports (lat, lng, speed, heading, ts) VALUES (?, ?, ?, ?, ?)'
    ).bind(lat, lng, spd, hdg, now).run();

    // Bersihkan data lama (lebih TTL)
    await env.DB.prepare('DELETE FROM reports WHERE ts < ?').bind(now - TTL_SECONDS).run();

    return json({ ok: true });
  } catch (e) {
    return json({ error: 'Ralat report: ' + (e.message || e) }, 500);
  }
}

async function handleTraffic(request, env) {
  try {
    const url = new URL(request.url);
    const minLat = parseFloat(url.searchParams.get('minLat'));
    const maxLat = parseFloat(url.searchParams.get('maxLat'));
    const minLng = parseFloat(url.searchParams.get('minLng'));
    const maxLng = parseFloat(url.searchParams.get('maxLng'));

    if ([minLat, maxLat, minLng, maxLng].some(isNaN)) {
      return json({ error: 'Perlu bbox (minLat,maxLat,minLng,maxLng)' }, 400);
    }

    const now = Math.floor(Date.now() / 1000);
    const cutoff = now - 300; // guna data 5 minit terakhir

    // Kumpulkan titik dalam bbox, kumpul ke grid ~0.01 darjah (~1km)
    const { results } = await env.DB.prepare(
      `SELECT
         ROUND(lat * 100) / 100.0 AS glat,
         ROUND(lng * 100) / 100.0 AS glng,
         AVG(speed) AS avg_speed,
         COUNT(*) AS cnt
       FROM reports
       WHERE ts >= ? AND lat >= ? AND lat <= ? AND lng >= ? AND lng <= ?
       GROUP BY glat, glng`
    ).bind(cutoff, minLat, maxLat, minLng, maxLng).run();

    // Tukar kepada senarai segmen dengan warna
    const segments = (results || []).map(r => ({
      lat: r.glat,
      lng: r.glng,
      speed: Math.round(r.avg_speed * 10) / 10,
      count: r.cnt,
      level: speedLevel(r.avg_speed),
    }));

    return json({ ok: true, segments, time: now });
  } catch (e) {
    return json({ error: 'Ralat traffic: ' + (e.message || e) }, 500);
  }
}

// Kelajuan → tahap kesesakan
function speedLevel(speed) {
  if (speed >= 60) return 'green';    // lancar
  if (speed >= 30) return 'yellow';   // sederhana
  return 'red';                       // sesak / berhenti
}

// Lapor insiden (kemalangan/jam/rosak/polisi)
async function handleIncident(request, env) {
  try {
    const { lat, lng, type } = await request.json();
    if (lat == null || lng == null || !type) {
      return json({ error: 'Perlu lat, lng & type' }, 400);
    }
    const allowed = ['accident', 'jam', 'hazard', 'police'];
    if (!allowed.includes(type)) {
      return json({ error: 'Jenis insiden tidak sah' }, 400);
    }
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      'INSERT INTO incidents (lat, lng, type, ts) VALUES (?, ?, ?, ?)'
    ).bind(lat, lng, type, now).run();
    // Bersihkan insiden lama (30 minit)
    await env.DB.prepare('DELETE FROM incidents WHERE ts < ?').bind(now - 1800).run();
    return json({ ok: true });
  } catch (e) {
    return json({ error: 'Ralat incident: ' + (e.message || e) }, 500);
  }
}

async function handleIncidents(request, env) {
  try {
    const url = new URL(request.url);
    const minLat = parseFloat(url.searchParams.get('minLat'));
    const maxLat = parseFloat(url.searchParams.get('maxLat'));
    const minLng = parseFloat(url.searchParams.get('minLng'));
    const maxLng = parseFloat(url.searchParams.get('maxLng'));
    if ([minLat, maxLat, minLng, maxLng].some(isNaN)) {
      return json({ error: 'Perlu bbox' }, 400);
    }
    const now = Math.floor(Date.now() / 1000);
    const cutoff = now - 1800; // 30 minit
    const { results } = await env.DB.prepare(
      'SELECT lat, lng, type, ts FROM incidents WHERE ts >= ? AND lat >= ? AND lat <= ? AND lng >= ? AND lng <= ?'
    ).bind(cutoff, minLat, maxLat, minLng, maxLng).run();
    return json({ ok: true, incidents: results || [] });
  } catch (e) {
    return json({ error: 'Ralat incidents: ' + (e.message || e) }, 500);
  }
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
