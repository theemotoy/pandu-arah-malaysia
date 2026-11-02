// HalaTuju Geocode — proxy ke OpenCage (key tersembunyi server-side).
// Digunakan sebagai sandaran bila OSM/pangkalan tempat tak jumpa hasil.
// Key disimpan sebagai secret (env.OPENCAGE_KEY), BUKAN dalam kod.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    if (url.pathname === '/search' && request.method === 'GET') {
      return handleSearch(request, env, url);
    }

    return json({ ok: true, name: 'HalaTuju Geocode', endpoint: '/search' });
  },
};

async function handleSearch(request, env, url) {
  const q = url.searchParams.get('q');
  if (!q || !q.trim()) return json({ places: [] });

  if (!env.OPENCAGE_KEY) {
    return json({ error: 'Key tidak dikonfigurasi' }, 500);
  }

  // Biaskan hasil ke Malaysia (countrycode=my), guna bounds Johor/KL bila mungkin
  const params = new URLSearchParams({
    q: q.trim(),
    key: env.OPENCAGE_KEY,
    limit: '7',
    countrycode: 'my',
    language: 'ms',
    no_annotations: '1',
    pretty: '1',
  });

  // Jika ada koordinat pengguna, bias kepadanya
  const lat = url.searchParams.get('lat');
  const lng = url.searchParams.get('lng');
  if (lat && lng) {
    params.set('proximity', `${lat},${lng}`);
  }

  try {
    const resp = await fetch('https://api.opencagedata.com/geocode/v1/json?' + params.toString());
    const data = await resp.json();

    const places = (data.results || []).map(r => ({
      name: r.formatted || (r.components && r.components._normalized_city) || q,
      lat: r.geometry && r.geometry.lat,
      lng: r.geometry && r.geometry.lng,
      formatted: r.formatted || '',
    })).filter(p => p.lat != null && p.lng != null);

    return json({ places });
  } catch (e) {
    return json({ error: 'Ralat geocode: ' + (e.message || e) }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
