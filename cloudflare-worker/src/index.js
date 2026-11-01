// HalaTuju AI — Cloudflare Worker
// Terima ayat semula jadi (Bahasa Melayu) → parse menjadi carian lokasi berstruktur.
// AI key tersembunyi di sini (server-side), bukan dalam browser.

const MODEL = '@cf/meta/llama-3.2-3b-instruct';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    if (url.pathname === '/smartsearch' && request.method === 'POST') {
      return handleSmartSearch(request, env);
    }

    // halaman maklumat ringkas
    return new Response(
      JSON.stringify({ ok: true, name: 'HalaTuju AI', endpoint: '/smartsearch' }),
      { headers: { 'Content-Type': 'application/json', ...CORS } }
    );
  },
};

async function handleSmartSearch(request, env) {
  try {
    const { text, lat, lng } = await request.json();
    if (!text || !text.trim()) {
      return json({ error: 'Teks kosong' }, 400);
    }

    const prompt = `Anda ialah pembantu navigasi untuk aplikasi peta Malaysia.

Pengguna menaip atau menyebut arahan dalam Bahasa Melayu. Fahami niat mereka dan keluarkan SATU objek JSON sahaja (tiada teks lain).

Medan JSON:
- "query": kata kunci carian yang bersih untuk geocoder (contoh: "restoran", "stesen minyak", "klinik"). Kalau nama tempat khusus disebut, guna nama itu.
- "category": kategori umum. Nilai sah: "fuel", "food", "worship", "health", "school", "shopping", "parking", "atm", "tourism", "home", "other".
- "amenity": nilai OSM amenity kalau sesuai (contoh "fuel", "restaurant", "clinic", "place_of_worship", "school", "hospital", "atm"). Kalau tiada, guna "".
- "action": "search" (cari tempat), "navigate_home" (balik rumah), "park_car" (simpan lokasi kereta), "find_car" (cari kereta), atau "other".

Contoh:
1. Input: "cari kedai makan halal dekat sini" → {"query":"restoran halal","category":"food","amenity":"restaurant","action":"search"}
2. Input: "aku nak isi minyak dulu" → {"query":"stesen minyak","category":"fuel","amenity":"fuel","action":"search"}
3. Input: "bawa aku balik rumah" → {"query":"rumah","category":"home","amenity":"","action":"navigate_home"}
4. Input: "mana klinik yang dekat" → {"query":"klinik","category":"health","amenity":"clinic","action":"search"}
5. Input: "simpan lokasi kereta aku" → {"query":"","category":"parking","amenity":"","action":"park_car"}

Sekarang parse input ini: "${text}"${lat && lng ? `\n(Lokasi pengguna: lat ${lat}, lng ${lng})` : ''}

Jawab dengan JSON sahaja:`;

    const response = await env.AI.run(MODEL, {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 256,
    });

    // Respons Workers AI boleh dalam pelbagai bentuk.
    // Bentuk paling biasa: OpenAI-compatible { choices: [{ message: { content } }] }
    let content = '';
    if (typeof response === 'string') {
      content = response;
    } else if (response && response.response) {
      content = typeof response.response === 'string' ? response.response : JSON.stringify(response.response);
    } else if (response && response.choices && response.choices[0] && response.choices[0].message) {
      content = response.choices[0].message.content || '';
    } else if (response && response.result) {
      const r = response.result;
      if (typeof r === 'string') content = r;
      else if (r && typeof r.response === 'string') content = r.response;
      else if (Array.isArray(r)) content = r.map(x => x.response || '').join('');
    }

    // Jika masih kosong, cuba stringify keseluruhan
    if (!content && response) {
      content = JSON.stringify(response);
    }

    // Cuba ekstrak JSON dari respons
    const parsed = extractJson(content);

    if (!parsed) {
      return json({ error: 'Gagal faham arahan', raw: content, debugShape: JSON.stringify(response).slice(0, 400) }, 422);
    }

    return json({ ok: true, result: parsed });
  } catch (e) {
    return json({ error: 'Ralat AI: ' + (e.message || e) }, 500);
  }
}

// Ekstrak objek JSON pertama dari teks (model kadang tambah pembuka/penutup)
function extractJson(text) {
  if (!text) return null;
  if (typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch (e2) {
      return null;
    }
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
