// HalaTuju Places — pangkalan tempat berkongsi (cloud)
// Pengguna tambah tempat → tersimpan D1 → semua pengguna boleh cari.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    // Tambah tempat
    if (url.pathname === '/add' && request.method === 'POST') {
      return handleAdd(request, env);
    }

    // Cari tempat (teks)
    if (url.pathname === '/search' && request.method === 'GET') {
      return handleSearch(request, env);
    }

    // Cari tempat berdekatan (radius)
    if (url.pathname === '/nearby' && request.method === 'GET') {
      return handleNearby(request, env);
    }

    // Auto-index: simpan senyap hasil carian yang jumpa (batch)
    if (url.pathname === '/index' && request.method === 'POST') {
      return handleIndex(request, env);
    }

    // Statistik (bilangan tempat dalam pangkalan)
    if (url.pathname === '/stats' && request.method === 'GET') {
      return handleStats(request, env);
    }

    // Padam tempat (admin sahaja, perlu kunci)
    if (url.pathname === '/delete' && request.method === 'POST') {
      return handleDelete(request, env);
    }

    return json({ ok: true, name: 'HalaTuju Places', endpoints: ['/add', '/search', '/nearby', '/index', '/stats', '/delete'] });
  },
};

async function handleAdd(request, env) {
  try {
    const { name, lat, lng, type } = await request.json();
    if (!name || !name.trim()) return json({ error: 'Perlu nama' }, 400);
    if (lat == null || lng == null) return json({ error: 'Perlu lat & lng' }, 400);

    const now = Math.floor(Date.now() / 1000);
    const nm = name.trim().slice(0, 200);
    const tp = (type || 'other').slice(0, 50);

    // Elak duplikat: sama nama + lokasi hampir sama (0.001 darjah ~ 110m)
    const { results } = await env.DB.prepare(
      'SELECT id FROM places WHERE name = ? AND ABS(lat - ?) < 0.001 AND ABS(lng - ?) < 0.001'
    ).bind(nm, lat, lng).run();

    if (results && results.length > 0) {
      return json({ ok: true, duplicate: true, message: 'Tempat sudah wujud' });
    }

    const { meta } = await env.DB.prepare(
      'INSERT INTO places (name, lat, lng, type, ts) VALUES (?, ?, ?, ?, ?)'
    ).bind(nm, lat, lng, tp, now).run();

    return json({ ok: true, id: meta.last_row_id });
  } catch (e) {
    return json({ error: 'Ralat add: ' + (e.message || e) }, 500);
  }
}

async function handleSearch(request, env) {
  try {
    const q = (request.url && new URL(request.url).searchParams.get('q') || '').trim();
    if (!q) return json({ places: [] });

    // Carian fuzzy: LIKE pada nama (case-insensitive)
    const { results } = await env.DB.prepare(
      'SELECT id, name, lat, lng, type FROM places WHERE name LIKE ? ORDER BY ts DESC LIMIT 10'
    ).bind('%' + q + '%').run();

    return json({ places: results || [] });
  } catch (e) {
    return json({ error: 'Ralat search: ' + (e.message || e) }, 500);
  }
}

async function handleNearby(request, env) {
  try {
    const u = new URL(request.url);
    const lat = parseFloat(u.searchParams.get('lat'));
    const lng = parseFloat(u.searchParams.get('lng'));
    if (isNaN(lat) || isNaN(lng)) return json({ places: [] });

    const d = 0.05; // ~5km
    const { results } = await env.DB.prepare(
      'SELECT id, name, lat, lng, type FROM places WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ? ORDER BY ts DESC LIMIT 30'
    ).bind(lat - d, lat + d, lng - d, lng + d).run();

    return json({ places: results || [] });
  } catch (e) {
    return json({ error: 'Ralat nearby: ' + (e.message || e) }, 500);
  }
}

// Auto-index: terima senarai tempat (hasil carian berjaya) → simpan senyap
// Ini "membenih" pangkalan dengan tempat yang pengguna dah jumpa,
// supaya pengguna lain terus boleh cari tanpa perlu tambah manual.
async function handleIndex(request, env) {
  try {
    const body = await request.json();
    const items = body.places || [];
    if (!Array.isArray(items) || !items.length) return json({ ok: true, indexed: 0 });

    const now = Math.floor(Date.now() / 1000);
    let indexed = 0;

    // Sediakan statement untuk dedup + insert
    const checkStmt = env.DB.prepare(
      'SELECT id FROM places WHERE name = ? AND ABS(lat - ?) < 0.001 AND ABS(lng - ?) < 0.001'
    );
    const insertStmt = env.DB.prepare(
      'INSERT INTO places (name, lat, lng, type, ts) VALUES (?, ?, ?, ?, ?)'
    );

    for (const it of items) {
      const nm = (it.name || '').trim().slice(0, 200);
      const lat = parseFloat(it.lat);
      const lng = parseFloat(it.lng);
      if (!nm || isNaN(lat) || isNaN(lng)) continue;
      // Jangan indeks koordinat luar Malaysia (elak spam)
      if (lat < 0.5 || lat > 8 || lng < 98 || lng > 120) continue;

      const { results } = await checkStmt.bind(nm, lat, lng).run();
      if (results && results.length > 0) continue; // sudah wujud

      await insertStmt.bind(nm, lat, lng, 'other', now).run();
      indexed++;
    }

    return json({ ok: true, indexed });
  } catch (e) {
    return json({ error: 'Ralat index: ' + (e.message || e) }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// Statistik pangkalan tempat
async function handleStats(request, env) {
  try {
    const total = await env.DB.prepare('SELECT COUNT(*) AS c FROM places').first();
    const today = await env.DB.prepare(
      'SELECT COUNT(*) AS c FROM places WHERE ts >= ?'
    ).bind(Math.floor(Date.now()/1000) - 86400).first();
    return json({
      ok: true,
      total: total ? total.c : 0,
      addedToday: today ? today.c : 0,
    });
  } catch (e) {
    return json({ error: 'Ralat stats: ' + (e.message || e) }, 500);
  }
}

// Padam tempat — admin sahaja (perlu kunci ADMIN_KEY yang betul)
async function handleDelete(request, env) {
  try {
    const { id, key } = await request.json();
    if (!id) return json({ error: 'Perlu id tempat' }, 400);

    // Kunci admin disimpan sebagai secret (env.ADMIN_KEY)
    if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) {
      return json({ error: 'Tiada kebenaran (kunci salah)' }, 403);
    }

    const { meta } = await env.DB.prepare('DELETE FROM places WHERE id = ?').bind(id).run();
    if (meta.changes === 0) {
      return json({ ok: false, message: 'Tempat tidak dijumpai' });
    }
    return json({ ok: true, deleted: id });
  } catch (e) {
    return json({ error: 'Ralat delete: ' + (e.message || e) }, 500);
  }
}
