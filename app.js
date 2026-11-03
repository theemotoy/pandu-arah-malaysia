/* ============ HALATUJU — aplikasi pandu arah ringan untuk Malaysia ============ */
/* Enjin routing: Valhalla (elak tol/lebuh raya, terpendek, alternatif, mod jalan) */
'use strict';

// ---- Keadaan global ----
const S = {
  map: null,
  userMarker: null,
  userPos: null,          // [lng, lat]
  speed: 0,               // km/j
  watchId: null,
  dest: null,             // {lng, lat, name}
  route: null,            // laluan dipilih {shape, steps, distance, duration}
  allRoutes: [],          // semua laluan (utama + alternatif)
  steps: [],
  stepIdx: 0,
  navigating: false,
  firstFix: false,
  destinationMarker: null,
  darkMode: false,
  lastSpeedCheck: 0,
};

// ---- Pemetaan jenis maneuver Valhalla -> [teks Melayu, arah ikon] ----
const MANEUVER = {
  0:  ['', 'straight'],
  1:  ['Bergerak', 'straight'],
  2:  ['Bergerak ke kanan', 'right'],
  3:  ['Bergerak ke kiri', 'left'],
  4:  ['Anda telah tiba', 'arrive'],
  5:  ['Destinasi di kanan', 'arrive'],
  6:  ['Destinasi di kiri', 'arrive'],
  7:  ['Terus ke hadapan', 'straight'],
  8:  ['Terus ke hadapan', 'straight'],
  9:  ['Belok sedikit ke kanan', 'slight-right'],
  10: ['Belok ke kanan', 'right'],
  11: ['Belok tajam ke kanan', 'sharp-right'],
  12: ['Pusing balik ke kanan', 'uturn'],
  13: ['Pusing balik ke kiri', 'uturn'],
  14: ['Belok tajam ke kiri', 'sharp-left'],
  15: ['Belok ke kiri', 'left'],
  16: ['Belok sedikit ke kiri', 'slight-left'],
  17: ['Ambil susur terus', 'straight'],
  18: ['Ambil susur ke kanan', 'right'],
  19: ['Ambil susur ke kiri', 'left'],
  20: ['Keluar ke kanan', 'right'],
  21: ['Keluar ke kiri', 'left'],
  22: ['Kekal ke hadapan', 'straight'],
  23: ['Kekal ke kanan', 'right'],
  24: ['Kekal ke kiri', 'left'],
  25: ['Bercantum', 'straight'],
  26: ['Masuk bulatan', 'roundabout'],
  27: ['Keluar bulatan', 'roundabout'],
  37: ['Bercantum ke kanan', 'right'],
  38: ['Bercantum ke kiri', 'left'],
};

// ---- Util ----
const $ = id => document.getElementById(id);
function toast(msg, ms=2600) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._t); t._t = setTimeout(()=>t.classList.remove('show'), ms);
}
function fmtDist(m) {
  if (m < 1000) return Math.round(m/10)*10 + ' m';
  return (m/1000).toFixed(m<10000?1:0) + ' km';
}
function fmtTime(s) {
  const min = Math.round(s/60);
  if (min < 60) return min + ' min';
  return Math.floor(min/60) + ' j ' + (min%60) + ' m';
}
function escapeHtml(s){return s.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

// ---- Decode polyline Valhalla (precision 6) ----
function decodePolyline6(str) {
  const coords=[]; let idx=0, lat=0, lon=0;
  while(idx<str.length){
    let b, shift=0, result=0;
    do{ b=str.charCodeAt(idx++)-63; result|=(b&0x1f)<<shift; shift+=5; }while(b>=0x20);
    lat += (result&1)? ~(result>>1) : (result>>1);
    shift=0; result=0;
    do{ b=str.charCodeAt(idx++)-63; result|=(b&0x1f)<<shift; shift+=5; }while(b>=0x20);
    lon += (result&1)? ~(result>>1) : (result>>1);
    coords.push([lon/1e6, lat/1e6]);
  }
  return coords;
}

// ---- Geometri ----
function haversine(lat1, lon1, lat2, lon2) {
  const R=6371000, dLat=(lat2-lat1)*Math.PI/180, dLon=(lon2-lon1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function segDist(p1, p2) { return haversine(p1[1],p1[0],p2[1],p2[0]); }
function distanceAlong(shape, fromIdx, toIdx) {
  let d=0;
  for(let i=fromIdx; i<toIdx && i<shape.length-1; i++) d += segDist(shape[i], shape[i+1]);
  return d;
}
function bearingTo(a, b) {
  const [lon1,lat1]=a, [lon2,lat2]=b;
  const y=Math.sin((lon2-lon1)*Math.PI/180)*Math.cos(lat2*Math.PI/180);
  const x=Math.cos(lat1*Math.PI/180)*Math.sin(lat2*Math.PI/180) -
          Math.sin(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.cos((lon2-lon1)*Math.PI/180);
  return (Math.atan2(y,x)*180/Math.PI + 360) % 360;
}

// ---- Penanda arah (anak panah kenderaan gaya Waze) ----
function arrowSVG() {
  return `<svg viewBox="0 0 24 24"><path d="M12 1.5 L21.5 21.5 L12 17 L2.5 21.5 Z" fill="#2f9ee0" stroke="#ffffff" stroke-width="1.4"/></svg>`;
}
function maneuverSVG(dir) {
  const deg = (dir==='left'||dir==='slight-left'||dir==='sharp-left') ? -90
            : (dir==='right'||dir==='slight-right'||dir==='sharp-right') ? 90
            : dir==='uturn' ? 180 : 0;
  return `<svg viewBox="0 0 24 24" style="transform:rotate(${deg}deg)"><path d="M12 4 L20 12 L12 20 L15 12 Z" fill="#fff"/></svg>`;
}

// ---- Inisialisasi peta ----
function initMap() {
  const style = S.darkMode
    ? 'https://tiles.openfreemap.org/styles/dark'
    : 'https://tiles.openfreemap.org/styles/liberty';
  S.map = new maplibregl.Map({
    container: 'map',
    style: style,
    center: [101.6942, 3.1390], // Kuala Lumpur
    zoom: 12,
  });
  S.map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), 'bottom-left');

  const el = document.createElement('div');
  el.className = 'user-arrow';
  el.innerHTML = arrowSVG();
  el.style.width = '40px'; el.style.height = '40px';
  el.style.filter = 'drop-shadow(0 2px 4px rgba(0,0,0,.35))';
  S.userMarker = new maplibregl.Marker({ element: el, rotationAlignment:'map' })
    .setLngLat([0,0]).addTo(S.map);

  S.map.on('load', () => {
    addRouteLayers();
  });

  S.map.on('click', e => {
    if (S.navigating) return;
    setDestination(e.lngLat.lng, e.lngLat.lat, 'Titik dipilih');
  });

  // Waze-style follow: bila pengguna seret peta, berhenti ikut;
  // selepas 5 saat tanpa interaksi semasa navigasi, kembali ikut anak panah.
  let autoRecenterTimer = null;
  const pauseFollow = () => {
    if (!S.navigating) return;
    followMode = false;
    lastMapInteraction = Date.now();
    if (autoRecenterTimer) clearTimeout(autoRecenterTimer);
    autoRecenterTimer = setTimeout(() => {
      // hanya kembali ikut jika tiada interaksi susulan
      if (Date.now() - lastMapInteraction >= 4500 && S.navigating) {
        followMode = true;
        // kekalkan bearing semasa, center ke lokasi
        S.map.easeTo({ center: S.userPos, bearing: S.map.getBearing(), zoom: 17, pitch: 45, padding: { top: 220, bottom: 130, left: 60, right: 60 }, duration: 600 });
      }
    }, 5000);
  };
  S.map.on('mousedown', pauseFollow);
  S.map.on('touchstart', pauseFollow);
  S.map.on('dragstart', pauseFollow);

  getLocation();
}

function emptyLine() {
  return { type:'FeatureCollection', features:[{ type:'Feature',
    geometry:{ type:'LineString', coordinates:[] }, properties:{} }] };
}
function shapeToGeoJSON(shape) {
  return { type:'FeatureCollection', features:[{ type:'Feature',
    geometry:{ type:'LineString', coordinates: shape }, properties:{} }] };
}

// Tambah (atau ganti) sumber & lapisan laluan pada style semasa.
// Dipanggil setiap kali style berubah (init + tukar mod malam) kerana
// setStyle() buang SEMUA source/layer yang sedia ada.
function addRouteLayers() {
  // buang layer lama jika ada (untuk elak konflik id)
  if (S.map.getLayer('route-line')) S.map.removeLayer('route-line');
  if (S.map.getLayer('route-casing')) S.map.removeLayer('route-casing');
  if (S.map.getSource('route')) S.map.removeSource('route');

  const data = (S.route) ? shapeToGeoJSON(S.route.shape) : emptyLine();
  S.map.addSource('route', { type:'geojson', data: data });
  S.map.addLayer({ id:'route-casing', type:'line', source:'route',
    layout:{'line-join':'round','line-cap':'round'},
    paint:{'line-color':'#ffffff','line-width':11} });
  S.map.addLayer({ id:'route-line', type:'line', source:'route',
    layout:{'line-join':'round','line-cap':'round'},
    paint:{'line-color':'#713cc7','line-width':7} });

  // Sumber trafik (bulatan warna) — tambah semula selepas style berubah
  if (!S.map.getSource('traffic')) {
    S.map.addSource('traffic', { type:'geojson', data: { type:'FeatureCollection', features: [] } });
    S.map.addLayer({
      id: 'traffic-layer', type: 'circle', source: 'traffic',
      paint: { 'circle-radius': 18, 'circle-opacity': 0.35, 'circle-color': ['get', 'color'] },
    });
  }
}

// ---- Mod malam ----
function toggleDark() {
  S.darkMode = !S.darkMode;
  localStorage.setItem('halaTuju.dark', S.darkMode ? '1' : '0');
  const style = S.darkMode
    ? 'https://tiles.openfreemap.org/styles/dark'
    : 'https://tiles.openfreemap.org/styles/liberty';
  // setStyle buang semua source/layer. Guna callback diffs untuk pasti
  // style betul-betul siap sebelum tambah semula lapisan laluan.
  const onStyleLoaded = () => {
    // tunggu sehingga style sebenar siap (idle) — lebih andal dari 'style.load'
    addRouteLayers();
  };
  S.map.setStyle(style, { diff: false });
  S.map.once('styledata', () => {
    // styledata fire bila style baru mula dimuat; tunggu idle untuk lapisan penuh
    if (S.map.isStyleLoaded()) {
      onStyleLoaded();
    } else {
      S.map.once('idle', onStyleLoaded);
    }
  });
}

// ---- Lokasi semasa ----
function getLocation() {
  if (!navigator.geolocation) { toast('GPS tidak disokong'); return; }
  toast('Mengesan lokasi…', 4000);
  if (S.watchId != null) navigator.geolocation.clearWatch(S.watchId);
  S.watchId = navigator.geolocation.watchPosition(
    pos => onPosition(pos),
    err => { toast('Gagal mengesan lokasi: ' + err.message); },
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 }
  );
}
function onPosition(pos) {
  const c = pos.coords;
  S.userPos = [c.longitude, c.latitude];
  if (c.speed != null && c.speed >= 0) {
    S.speed = c.speed * 3.6; // m/s -> km/j
  }
  S.userMarker.setLngLat(S.userPos);
  if (!S.firstFix) {
    S.firstFix = true;
    S.map.easeTo({ center: S.userPos, zoom: 15 });
  }
  if (S.navigating) {
    updateNavigation();
    updateSpeedDisplay();
    checkSpeedLimit();
    reportTraffic();
  }
}

// ---- Trafik crowd-source (hantar lokasi anonim + papar) ----
const TRAFFIC_ENDPOINT = 'https://halatuju-traffic.the-emotoy.workers.dev';
let lastTrafficReport = 0;

// Hantar lokasi + kelajuan setiap 15s semasa navigasi (ANONIM, tiada identiti)
function reportTraffic() {
  if (!S.userPos) return;
  const now = Date.now();
  if (now - lastTrafficReport < 15000) return;
  lastTrafficReport = now;
  const [lng, lat] = S.userPos;
  fetch(TRAFFIC_ENDPOINT + '/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lat, lng,
      speed: Math.round(S.speed),
      heading: Math.round(S.map.getBearing() || 0),
    }),
  }).catch(() => {}); // senyap — trafik optional
}

// Tarik trafik sekitar & papar warna pada peta (bulatan separa lutsinar)
let trafficSourceAdded = false;
function fetchTraffic() {
  if (!S.userPos) return;
  const [lng, lat] = S.userPos;
  const d = 0.05; // ~5km
  const url = `${TRAFFIC_ENDPOINT}/traffic?minLat=${lat-d}&maxLat=${lat+d}&minLng=${lng-d}&maxLng=${lng+d}`;
  fetch(url).then(r => r.json()).then(data => {
    if (!data.ok || !data.segments) return;
    drawTraffic(data.segments);
  }).catch(() => {});
}

function drawTraffic(segments) {
  // sumber 'traffic' sudah ditambah dalam addRouteLayers()
  if (!S.map.getSource('traffic')) return;
  const features = segments.map(s => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
    properties: { color: s.level === 'red' ? '#e53935' : s.level === 'yellow' ? '#f9a825' : '#43a047' },
  }));
  S.map.getSource('traffic').setData({ type: 'FeatureCollection', features });
}

// ---- Carian tempat (Nominatim) ----
let searchTimer;
function setupSearch() {
  const q = $('q'), res = $('results'), clear = $('clear');
  q.addEventListener('input', () => {
    clear.style.display = q.value ? 'block' : 'none';
    clearTimeout(searchTimer);
    if (q.value.trim().length < 3) { res.classList.remove('show'); return; }
    searchTimer = setTimeout(() => search(q.value.trim()), 450);
  });
  clear.addEventListener('click', () => {
    q.value=''; clear.style.display='none'; res.classList.remove('show');
  });
}
function search(text) {
  // 0) semak "Tempat Johor" (data terbina dalam — tempat belum ada dalam OSM)
  const extra = (typeof EXTRA_PLACES !== 'undefined' ? EXTRA_PLACES : []).filter(p =>
    p.name.toLowerCase().includes(text.toLowerCase()) ||
    (p.alt || []).some(a => a.toLowerCase().includes(text.toLowerCase()))
  );
  if (extra.length) {
    renderResults(extra.map(p => ({
      display_name: p.name + ', ' + p.addr,
      lon: String(p.lng), lat: String(p.lat),
    })));
    return;
  }
  // 1) semak "Tempat saya" dulu (tempat yang pengguna simpan sendiri)
  const myPlaces = getMyPlaces().filter(p => p.name.toLowerCase().includes(text.toLowerCase()));
  if (myPlaces.length) {
    renderResults(myPlaces.map(p => ({
      display_name: p.name + ', Tempat saya',
      lon: String(p.lng), lat: String(p.lat),
    })));
    return;
  }
  // 1.5) semak pangkalan tempat berkongsi (cloud) — tempat ditambah mana-mana pengguna
  searchCloudPlaces(text);
  // 2) Carian pintar AI — jika ayat lebih dari satu perkataan (niat semula jadi)
  if (text.split(' ').length >= 3 && AI_ENDPOINT) {
    aiSearch(text).then(() => {}).catch(() => {});
    // masih teruskan carian biasa sebagai sandaran selari
  }
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=7&countrycodes=my&q=${encodeURIComponent(text)}&accept-language=ms`;
  fetch(url, { headers:{ 'Accept':'application/json', 'User-Agent':'HalaTuju/1.0' } })
    .then(r => r.json())
    .then(rs => {
      renderResults(rs);
      // Jika OSM tak jumpa hasil, guna OpenCage (geocoder komersial) sebagai sandaran
      if (!rs || !rs.length) searchGeocode(text);
    })
    .catch(() => searchGeocode(text));
}

// Sandaran: OpenCage (proxy worker, key tersembunyi) — liputan lebih penuh
const GEOCODE_ENDPOINT = 'https://halatuju-geocode.the-emotoy.workers.dev';
function searchGeocode(text) {
  const [lng, lat] = S.userPos || [null, null];
  let url = GEOCODE_ENDPOINT + '/search?q=' + encodeURIComponent(text);
  if (lat && lng) url += '&lat=' + lat + '&lng=' + lng;
  fetch(url).then(r => r.json()).then(d => {
    const places = d.places || [];
    if (!places.length) {
      const res = $('results');
      if (!res.querySelector('.res-item')) {
        res.innerHTML = '<div class="res-item">Tiada hasil</div>';
        res.classList.add('show');
      }
      return;
    }
    renderResults(places.map(p => ({
      display_name: p.formatted || p.name,
      lon: String(p.lng), lat: String(p.lat),
    })));
  }).catch(() => {});
}

// Cari dalam pangkalan tempat berkongsi (cloud) — gabung hasil ke UI
function searchCloudPlaces(text) {
  fetch(PLACES_ENDPOINT + '/search?q=' + encodeURIComponent(text))
    .then(r => r.json())
    .then(d => {
      const places = d.places || [];
      if (!places.length) return;
      // Papar sebagai hasil (gabung dengan hasil OSM nanti)
      const res = $('results');
      // Jika hasil OSM belum tiba, tunjuk tempat cloud dulu
      places.forEach(p => {
        const div = document.createElement('div');
        div.className = 'res-item';
        div.innerHTML = `<div class="name">${escapeHtml(p.name)}</div>
                         <div class="sub">🌐 Pangkalan berkongsi · tekan lama untuk padam</div>`;
        div.onclick = () => {
          setDestination(p.lng, p.lat, p.name);
          res.classList.remove('show');
        };
        // Tekan lama = padam (admin)
        div.addEventListener('contextmenu', e => { e.preventDefault(); askDeletePlace(p); });
        let longPressTimer = null;
        div.addEventListener('touchstart', () => {
          longPressTimer = setTimeout(() => askDeletePlace(p), 700);
        });
        div.addEventListener('touchend', () => clearTimeout(longPressTimer));
        div.addEventListener('touchmove', () => clearTimeout(longPressTimer));
        res.appendChild(div);
      });
      if (!res.classList.contains('show')) res.classList.add('show');
    })
    .catch(() => {}); // senyap
}

// Minta kunci admin & padam tempat salah
function askDeletePlace(p) {
  const key = prompt('Padam "' + p.name + '"?\nMasukkan kunci admin:');
  if (!key) return;
  fetch(PLACES_ENDPOINT + '/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: p.id, key: key.trim() }),
  }).then(r => r.json()).then(d => {
    if (d.ok) {
      toast('🗑️ "' + p.name + '" dipadam');
      // segarkan hasil
      const res = $('results');
      res.classList.remove('show');
    } else {
      toast('❌ ' + (d.error || 'Gagal padam'));
    }
  }).catch(() => toast('❌ Gagal padam'));
}

// ---- Carian pintar AI (Cloudflare Workers) ----
// URL worker (AI tersembunyi server-side). Kosong = AI dimatikan.
const AI_ENDPOINT = 'https://halatuju-ai.the-emotoy.workers.dev/smartsearch';

async function aiSearch(text) {
  const [lng, lat] = S.userPos || [null, null];
  const body = { text };
  if (lat && lng) { body.lat = lat; body.lng = lng; }
  try {
    const resp = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await resp.json();
    if (!d.ok || !d.result) return;
    const r = d.result;
    // laksana tindakan berdasarkan hasil AI
    switch (r.action) {
      case 'navigate_home':
        goHome();
        return;
      case 'park_car':
        toggleParking();
        return;
      case 'find_car':
        toggleParking();
        return;
      case 'search':
      default: {
        // Jika query kosong tapi category/amenity ada, guna amenity sebagai kata kunci
        let query = r.query;
        if (!query && r.amenity) {
          query = r.amenity.replace(/_/g, ' ');
        }
        if (!query && r.category) {
          const catMap = { fuel:'stesen minyak', food:'restoran', worship:'masjid', health:'klinik', school:'sekolah', atm:'atm', shopping:'kedai', tourism:'tempat menarik' };
          query = catMap[r.category] || r.category;
        }
        if (query) {
          toast('🤖 "' + query + '"', 2000);
          searchPOIByText(query, r.amenity);
        }
        return;
      }
    }
  } catch(e) {
    // AI gagal — senyap, carian biasa dah jadi sandaran
  }
}

// Carian berasaskan teks (guna Photon + filter amenity kalau ada)
function searchPOIByText(query, amenity) {
  const [lng, lat] = S.userPos || [null, null];
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}${lat && lng ? `&lat=${lat}&lon=${lng}` : ''}&limit=8`;
  fetch(url, { headers:{ 'Accept':'application/json', 'User-Agent':'HalaTuju/1.0' } })
    .then(r => r.json())
    .then(d => {
      let feats = d.features || [];
      if (amenity) feats = feats.filter(f => (f.properties || {}).osm_value === amenity);
      const res = $('results');
      res.innerHTML = '';
      if (!feats.length) { res.innerHTML = '<div class="res-item">Tiada hasil</div>'; }
      feats.slice(0, 8).forEach(f => {
        const p = f.properties || {};
        const [lon, lat2] = f.geometry.coordinates;
        const name = p.name || query;
        const div = document.createElement('div');
        div.className = 'res-item';
        div.innerHTML = `<div class="name">${escapeHtml(name)}</div>
                         <div class="sub">${escapeHtml(p.street || p.city || p.country || '')}</div>`;
        div.onclick = () => {
          setDestination(lon, lat2, name);
          res.classList.remove('show');
        };
        res.appendChild(div);
      });
      res.classList.add('show');
    })
    .catch(() => toast('Carian gagal. Cuba lagi.'));
}
function renderResults(rs) {
  const res = $('results');
  res.innerHTML = '';
  if (!rs.length) { res.innerHTML = '<div class="res-item">Tiada hasil</div>'; }
  rs.forEach(r => {
    const div = document.createElement('div');
    div.className = 'res-item';
    const sub = r.display_name.split(',').slice(0,3).join(',');
    div.innerHTML = `<div class="name">${escapeHtml(r.display_name.split(',')[0])}</div>
                     <div class="sub">${escapeHtml(sub)}</div>`;
    div.onclick = () => {
      setDestination(parseFloat(r.lon), parseFloat(r.lat), r.display_name.split(',')[0]);
      res.classList.remove('show'); $('q').value = ''; $('clear').style.display='none';
    };
    res.appendChild(div);
  });
  res.classList.add('show');
  // Auto-index: senyap simpan hasil carian yang jumpa ke pangkalan berkongsi
  // supaya kawasan (cth. Senai/Kulai/Skudai) makin lengkap untuk pengguna lain.
  autoIndexResults(rs);
}

// Hantar hasil carian berjaya ke pangkalan berkongsi (dedup di server)
function autoIndexResults(rs) {
  const places = rs
    .filter(r => r.lat && r.lon)
    .map(r => ({
      name: r.display_name.split(',')[0].trim(),
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
    }))
    .slice(0, 7); // maks 7
  if (!places.length) return;
  fetch(PLACES_ENDPOINT + '/index', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ places }),
  }).catch(() => {}); // senyap
}

// ---- POI cepat (Photon + tapisan kategori) ----
// Pemetaan: kunci butang -> [kata kunci carian Photon, osm_value yang diterima]
const POI_MAP = {
  masjid:  { q: 'masjid', value: 'place_of_worship' },
  fuel:    { q: 'stesen minyak', value: 'fuel' },
  clinic:  { q: 'klinik', value: 'clinic' },
  atm:     { q: 'atm', value: 'atm' },
  school:  { q: 'sekolah', value: 'school' },
  hospital:{ q: 'hospital', value: 'hospital' },
};
function searchPOI(key) {
  if (!S.userPos) { toast('Lokasi belum dikesan. Tunggu isyarat GPS…'); return; }
  const [lng, lat] = S.userPos;
  const def = POI_MAP[key] || { q: key, value: key };
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(def.q)}&lat=${lat}&lon=${lng}&limit=20`;
  toast('Mencari…', 6000);
  fetch(url, { headers:{ 'Accept':'application/json', 'User-Agent':'HalaTuju/1.0' } })
    .then(r => r.json())
    .then(d => {
      const features = (d.features || []).filter(f => {
        const p = f.properties || {};
        return p.osm_value === def.value || (def.value === 'place_of_worship' && p.osm_value === 'place_of_worship');
      });
      const res = $('results');
      res.innerHTML = '';
      if (!features.length) { res.innerHTML = '<div class="res-item">Tiada hasil berdekatan</div>'; }
      features.slice(0, 8).forEach(f => {
        const p = f.properties;
        const [lon, lat2] = f.geometry.coordinates;
        const name = p.name || def.q;
        const dist = fmtDist(haversine(lat, lng, lat2, lon));
        const div = document.createElement('div');
        div.className = 'res-item';
        div.innerHTML = `<div class="name">${escapeHtml(name)}</div>
                         <div class="sub">${dist} dari lokasi anda</div>`;
        div.onclick = () => {
          setDestination(lon, lat2, name);
          res.classList.remove('show');
        };
        res.appendChild(div);
      });
      res.classList.add('show');
    })
    .catch(() => toast('Carian POI gagal. Cuba lagi.'));
}

// ---- Carian suara (Web Speech API) ----
let recognition = null;
function setupVoiceSearch() {
  const mic = $('micbtn');
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { mic.style.display = 'none'; return; }
  recognition = new SR();
  recognition.lang = 'ms-MY';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const text = event.results[0][0].transcript;
    $('q').value = text;
    $('clear').style.display = 'block';
    if (text.trim().length >= 2) search(text.trim());
    mic.classList.remove('recording');
  };
  recognition.onerror = () => {
    mic.classList.remove('recording');
    toast('Carian suara gagal. Cuba lagi.');
  };
  recognition.onend = () => mic.classList.remove('recording');

  mic.addEventListener('click', () => {
    if (mic.classList.contains('recording')) {
      recognition.stop();
      mic.classList.remove('recording');
      return;
    }
    mic.classList.add('recording');
    toast('🎤 Bercakap sekarang…', 4000);
    try { recognition.start(); } catch(e) {}
  });
}

// ---- Kegemaran (localStorage) ----
function getFavs() {
  try { return JSON.parse(localStorage.getItem('halaTuju.favs') || '[]'); }
  catch(e) { return []; }
}
function saveFavs(favs) { localStorage.setItem('halaTuju.favs', JSON.stringify(favs)); }
function addFav() {
  if (!S.dest) { toast('Tiada destinasi untuk disimpan'); return; }
  let favs = getFavs();
  const exists = favs.some(f => f.lat === S.dest.lat && f.lng === S.dest.lng);
  if (exists) { toast('Sudah ada dalam kegemaran'); return; }
  favs.push({ name: S.dest.name, lat: S.dest.lat, lng: S.dest.lng });
  if (favs.length > 20) favs = favs.slice(-20);
  saveFavs(favs);
  renderFavs();
  toast('⭐ Disimpan ke kegemaran');
}
function removeFav(idx) {
  let favs = getFavs();
  favs.splice(idx, 1);
  saveFavs(favs);
  renderFavs();
}
function renderFavs() {
  const favs = getFavs();
  const bar = $('favbar');
  const list = $('favlist');
  if (!favs.length) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  list.innerHTML = '';
  favs.forEach((f, i) => {
    const div = document.createElement('div');
    div.className = 'fav-item';
    div.innerHTML = `<span>⭐ ${escapeHtml(f.name)}</span><span class="del" data-i="${i}">✕</span>`;
    div.addEventListener('click', e => {
      if (e.target.classList.contains('del')) { removeFav(i); return; }
      setDestination(f.lng, f.lat, f.name);
    });
    list.appendChild(div);
  });
}

// ---- Rumah (satu ketik) ----
function getHome() {
  try { return JSON.parse(localStorage.getItem('halaTuju.home') || 'null'); }
  catch(e) { return null; }
}
function goHome() {
  const home = getHome();
  if (!home) {
    // belum set -> set lokasi semasa sebagai rumah (tanpa dialog yang menghalang)
    if (!S.userPos) { toast('Lokasi belum dikesan. Tunggu isyarat GPS…'); return; }
    localStorage.setItem('halaTuju.home', JSON.stringify({ lat: S.userPos[1], lng: S.userPos[0], name: 'Rumah' }));
    toast('🏠 Rumah disimpan (tekan sekali lagi untuk pandu balik)');
    return;
  }
  setDestination(home.lng, home.lat, home.name);
}

// ---- Parkir (ingat lokasi kereta) ----
function getParking() {
  try { return JSON.parse(localStorage.getItem('halaTuju.parking') || 'null'); }
  catch(e) { return null; }
}
function toggleParking() {
  const park = getParking();
  if (park) {
    // sudah ada parkir -> pandu ke kereta
    setDestination(park.lng, park.lat, 'Kereta saya');
  } else {
    // belum ada -> simpan lokasi semasa
    if (!S.userPos) { toast('Lokasi belum dikesan. Tunggu isyarat GPS…'); return; }
    localStorage.setItem('halaTuju.parking', JSON.stringify({ lat: S.userPos[1], lng: S.userPos[0] }));
    toast('🅿️ Lokasi kereta disimpan');
  }
}

// ---- Sejarah (auto-simpan destinasi terakhir) ----
function getHistory() {
  try { return JSON.parse(localStorage.getItem('halaTuju.history') || '[]'); }
  catch(e) { return []; }
}
function addHistory(name, lat, lng) {
  let hist = getHistory();
  hist = hist.filter(h => !(Math.abs(h.lat-lat) < 0.0001 && Math.abs(h.lng-lng) < 0.0001));
  hist.unshift({ name, lat, lng });
  if (hist.length > 5) hist = hist.slice(0, 5);
  localStorage.setItem('halaTuju.history', JSON.stringify(hist));
  renderHistory();
}
function renderHistory() {
  const hist = getHistory();
  const bar = $('histbar');
  const list = $('histlist');
  if (!hist.length) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  list.innerHTML = '';
  hist.forEach(h => {
    const div = document.createElement('div');
    div.className = 'hist-item';
    div.textContent = '🕘 ' + h.name;
    div.onclick = () => setDestination(h.lng, h.lat, h.name);
    list.appendChild(div);
  });
}

// ---- Tambah tempat (Tempat saya + sumbang ke OSM) ----
let addPlacePos = null; // [lng, lat] lokasi dipilih untuk tambah

// Endpoint pangkalan tempat berkongsi (cloud)
const PLACES_ENDPOINT = 'https://halatuju-places.the-emotoy.workers.dev';

function getMyPlaces() {
  try { return JSON.parse(localStorage.getItem('halaTuju.myplaces') || '[]'); }
  catch(e) { return []; }
}
function saveMyPlaces(places) { localStorage.setItem('halaTuju.myplaces', JSON.stringify(places)); }

function openAddPlace(lng, lat) {
  addPlacePos = [lng, lat];
  $('addplace-coords').textContent = 'Lokasi: ' + lat.toFixed(5) + ', ' + lng.toFixed(5);
  $('addplace-name').value = '';
  // Isi kotak koordinat dengan lokasi semasa (boleh diedit pengguna)
  $('addplace-latlng').value = lat.toFixed(6) + ', ' + lng.toFixed(6);
  // reset dropdown & input custom
  $('addplace-type').value = 'shop';
  $('addplace-custom-type').value = '';
  $('addplace-custom-type').classList.add('hidden');
  $('addplacemodal').classList.remove('hidden');
  setTimeout(() => $('addplace-name').focus(), 100);
}
function closeAddPlace() {
  $('addplacemodal').classList.add('hidden');
  addPlacePos = null;
}

// Parse koordinat dari kotak input (sokong "lat, lng" atau "lat lng")
function parseLatLng(str) {
  if (!str) return null;
  const parts = str.split(/[,;\s]+/).map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
  if (parts.length < 2) return null;
  const lat = parts[0], lng = parts[1];
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function saveMyPlace() {
  const name = $('addplace-name').value.trim();
  if (!name) { toast('Sila masukkan nama tempat'); return; }
  if (!addPlacePos) { toast('Tiada lokasi dipilih'); return; }
  const type = resolveType();

  // Guna koordinat manual jika pengguna isi kotak
  let lat = addPlacePos[1], lng = addPlacePos[0];
  const manual = parseLatLng($('addplace-latlng').value);
  if (manual) {
    lat = manual.lat; lng = manual.lng;
    addPlacePos = [lng, lat];
    $('addplace-coords').textContent = 'Lokasi: ' + lat.toFixed(5) + ', ' + lng.toFixed(5);
  }

  // 1) simpan lokal (offline)
  let places = getMyPlaces();
  places.push({ name, lat, lng, type });
  saveMyPlaces(places);

  // 2) simpan ke cloud (semua pengguna dapat)
  fetch(PLACES_ENDPOINT + '/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, lat, lng, type }),
  }).then(r => r.json()).then(d => {
    if (d.duplicate) {
      toast('ℹ️ "' + name + '" sudah wujud dalam pangkalan');
    } else if (d.ok) {
      toast('✅ "' + name + '" disimpan — boleh dicari semua orang');
    }
  }).catch(() => {
    toast('✅ "' + name + '" disimpan (lokal sahaja)');
  });

  closeAddPlace();
}

// Dapatkan jenis tempat; kalau "custom", guna teks yang ditaip pengguna
function resolveType() {
  const sel = $('addplace-type').value;
  if (sel === 'custom') {
    const custom = $('addplace-custom-type').value.trim();
    return custom ? ('custom:' + custom) : 'other';
  }
  return sel;
}

function contributeToOSM() {
  if (!addPlacePos) { toast('Tiada lokasi dipilih'); return; }
  const name = $('addplace-name').value.trim();
  const type = $('addplace-type').value;
  // Buka editor OSM rasmi di koordinat tepat (iD editor) — pengguna login & simpan di sana
  const url = `https://www.openstreetmap.org/edit?editor=id#map=19/${addPlacePos[1]}/${addPlacePos[0]}`;
  window.open(url, '_blank');
  toast('Editor OSM dibuka — lengkapkan & simpan di sana', 6000);
  closeAddPlace();
}

function setupAddPlace() {
  $('addplacebtn').addEventListener('click', () => {
    if (!S.userPos) { toast('Lokasi belum dikesan. Tunggu isyarat GPS…'); return; }
    // guna lokasi semasa sebagai titik awal
    openAddPlace(S.userPos[0], S.userPos[1]);
  });
  $('addplace-save').addEventListener('click', saveMyPlace);
  $('addplace-osm').addEventListener('click', contributeToOSM);
  $('addplace-cancel').addEventListener('click', closeAddPlace);
  // Tunjuk/sembunyi input custom bila pilih "Custom"
  $('addplace-type').addEventListener('change', () => {
    const isCustom = $('addplace-type').value === 'custom';
    $('addplace-custom-type').classList.toggle('hidden', !isCustom);
    if (isCustom) $('addplace-custom-type').focus();
  });
  // tutup bila ketik luar modal
  $('addplacemodal').addEventListener('click', e => {
    if (e.target === $('addplacemodal')) closeAddPlace();
  });
}

// ---- Tetapkan destinasi ----
function setDestination(lng, lat, name) {
  S.dest = { lng, lat, name };
  if (S.destinationMarker) S.destinationMarker.remove();
  S.destinationMarker = new maplibregl.Marker({ color:'#e53935' })
    .setLngLat([lng, lat]).addTo(S.map);
  // auto-simpan sejarah (kecuali "Rumah"/"Kereta saya" yang bukan carian sebenar)
  if (name && name !== 'Rumah' && name !== 'Kereta saya' && name !== 'Titik dipilih') {
    addHistory(name, lat, lng);
  }
  if (!S.userPos) { toast('Lokasi belum dikesan. Tunggu isyarat GPS…'); return; }
  fetchRoute(S.userPos, [lng, lat]);
}

// ---- Baca pilihan routing dari UI ----
function getRouteOptions() {
  const modeEl = document.querySelector('input[name="mode"]:checked');
  const travelEl = document.querySelector('.travel.active');
  return {
    mode: modeEl ? modeEl.value : 'fastest',
    travel: travelEl ? travelEl.dataset.travel : 'auto',
    avoidToll: $('avoidToll').checked,
    avoidHighway: $('avoidHighway').checked,
  };
}

// ---- Fetch route (Valhalla) ----
async function fetchRoute(from, to) {
  const opts = getRouteOptions();
  // pemetaan mod perjalanan -> costing Valhalla
  // NOTA: Valhalla TIADA "shortest". Paling dekat = "auto_shorter".
  let costing = 'auto';
  if (opts.travel === 'pedestrian') costing = 'pedestrian';
  else if (opts.travel === 'bicycle') costing = 'bicycle';
  else if (opts.mode === 'shortest') costing = 'auto_shorter';

  const costOpts = {};
  if (costing === 'auto' || costing === 'auto_shorter') {
    if (opts.avoidToll) costOpts.use_tolls = 0.0;
    if (opts.avoidHighway) costOpts.use_highways = 0.0;
  }

  const body = {
    locations: [{ lat: from[1], lon: from[0] }, { lat: to[1], lon: to[0] }],
    costing: costing,
    costing_options: { [costing]: costOpts },
    directions_options: { units: 'kilometers' },
    alternates: (costing === 'auto' || costing === 'auto_shorter') ? 2 : 0,
  };

  // Semasa navigasi, jangan tunjuk toast (reroute senyap)
  if (!S.navigating) toast('Mengira laluan…', 6000);
  try {
    const resp = await fetch('https://valhalla1.openstreetmap.de/route', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await resp.json();
    if (!d.trip) { toast('Tiada laluan ditemui'); return; }
    const routes = [d.trip];
    if (d.alternates) d.alternates.forEach(a => routes.push(a.trip));
    S.allRoutes = routes.map(parseTrip);
    S.route = S.allRoutes[0];
    S.steps = S.route.steps;
    S.stepIdx = 0;
    drawRoute(S.route);
    // Semasa navigasi (reroute), JANGAN buka panel laluan / zoom keluar —
    // gerak kerja Waze/Maps: reroute senyap di latar, paparan kekal pada anak panah.
    if (S.navigating) {
      updateNavigation();
    } else {
      showRouteSummary();
      showAlternates();
    }
  } catch(e) {
    toast('Gagal mendapatkan laluan. Semak sambungan internet.');
  }
}

function parseTrip(trip) {
  const shape = decodePolyline6(trip.legs[0].shape);
  const steps = trip.legs[0].maneuvers.map(m => ({
    type: m.type,
    text: (MANEUVER[m.type] || ['Terus','straight'])[0],
    dir: (MANEUVER[m.type] || ['Terus','straight'])[1],
    beginIndex: m.begin_shape_index,
    location: shape[m.begin_shape_index] || shape[0],
    name: (m.street_names && m.street_names[0]) || '',
  }));
  return {
    shape, steps,
    distance: trip.summary.length * 1000,   // km -> m
    duration: trip.summary.time,            // saat
  };
}

function drawRoute(route) {
  const src = S.map.getSource('route');
  if (src) src.setData(shapeToGeoJSON(route.shape));
  // Semasa navigasi, jangan fitBounds (akan zoom keluar dari anak panah)
  if (S.navigating) return;
  const bounds = route.shape.reduce((b,c)=>b.extend(c),
    new maplibregl.LngLatBounds(route.shape[0], route.shape[0]));
  S.map.fitBounds(bounds, { padding: 80 });
}

function showRouteSummary() {
  const r = S.route;
  $('routesummary').innerHTML =
    `<div class="big">${fmtTime(r.duration)}</div>
     <div class="meta">${fmtDist(r.distance)} · ke ${escapeHtml(S.dest.name)}</div>`;
  $('routepanel').classList.remove('hidden');
  // Reset kepada expanded bila laluan baru dikira
  $('routepanel').classList.remove('collapsed');
  const cb = $('collapsebtn');
  if (cb) { cb.classList.remove('expanded'); }
}

function showAlternates() {
  const box = $('alternates');
  if (S.allRoutes.length <= 1) { box.innerHTML=''; box.classList.remove('show'); return; }
  box.innerHTML = '';
  S.allRoutes.forEach((r, i) => {
    const div = document.createElement('div');
    div.className = 'alt-item' + (i===0 ? ' active' : '');
    div.innerHTML = `<span class="alt-label">Laluan ${i+1}</span>
      <span class="alt-time">${fmtTime(r.duration)}</span>
      <span class="alt-dist">${fmtDist(r.distance)}</span>`;
    div.onclick = () => {
      S.route = r; S.steps = r.steps; S.stepIdx = 0;
      drawRoute(r);
      showRouteSummary();
      box.querySelectorAll('.alt-item').forEach((e,k)=>e.classList.toggle('active', k===i));
    };
    box.appendChild(div);
  });
  box.classList.add('show');
}

// ---- Navigasi turn-by-turn ----
function startNavigation() {
  if (!S.route || !S.steps.length) return;
  S.navigating = true;
  $('routepanel').classList.add('hidden');
  $('navbanner').classList.remove('hidden');
  $('searchbar').classList.add('hidden');
  $('fab-stack').classList.add('hidden');
  $('quickmenu').classList.add('hidden');
  $('speedbox').classList.remove('hidden');
  $('limitbox').classList.remove('hidden');
  followMode = true;
  S.map.easeTo({ zoom: 17, pitch: 45, padding: { top: 220, bottom: 130, left: 60, right: 60 } });
  S._lastStep = -1;
  updateNavigation();
}
function stopNavigation() {
  S.navigating = false;
  $('navbanner').classList.add('hidden');
  $('searchbar').classList.remove('hidden');
  $('fab-stack').classList.remove('hidden');
  $('speedbox').classList.add('hidden');
  $('limitbox').classList.add('hidden');
  $('poibar').classList.remove('hidden');
  const src = S.map.getSource('route');
  if (src) src.setData(emptyLine());
  if (S.destinationMarker) { S.destinationMarker.remove(); S.destinationMarker=null; }
  S.dest = null; S.route = null; S.steps = []; S.allRoutes = [];
  speak('');
  toast('Pandu arah ditamatkan');
}

function nearestShapeIndex(shape, pos) {
  let min=Infinity, idx=0;
  for(let i=0;i<shape.length;i++){
    const d = haversine(pos[1],pos[0], shape[i][1], shape[i][0]);
    if(d<min){min=d;idx=i;}
  }
  return idx;
}

function updateNavigation() {
  if (!S.navigating || !S.userPos || !S.route) return;
  const shape = S.route.shape;
  const curIdx = nearestShapeIndex(shape, S.userPos);

  // auto-reroute: hanya bila betul-betul terpesong jauh (>150m, bukan lompatan GPS kecil).
  // Gerak kerja Waze/Maps: reroute senyap, tak buka menu, tak mengganggu pemandu.
  const offRouteDist = haversine(S.userPos[1], S.userPos[0], shape[curIdx][1], shape[curIdx][0]);
  if (offRouteDist > 150 && S.dest && Date.now() - (S._lastReroute||0) > 20000) {
    S._lastReroute = Date.now();
    fetchRoute(S.userPos, [S.dest.lng, S.dest.lat]).then(() => {
      if (S.navigating) updateNavigation();
    });
    return;
  }

  // maneuver seterusnya = pertama dengan beginIndex > curIdx
  let next = null, nextStepNum = 0;
  for (let i=0;i<S.steps.length;i++) {
    if (S.steps[i].beginIndex > curIdx) { next = S.steps[i]; nextStepNum = i; break; }
  }
  if (!next) {
    $('navinstruction').textContent = 'Anda telah tiba di destinasi';
    $('navdistance').textContent = fmtDist(segDist(shape[curIdx], shape[shape.length-1]));
    $('navmaneuver').innerHTML = maneuverSVG('arrive');
    $('navremaining').textContent = '0 m';
    $('naveta').textContent = 'Tiba';
    return;
  }

  S.stepIdx = nextStepNum;
  const distToManeuver = distanceAlong(shape, curIdx, next.beginIndex);

  const instr = next.text + (next.name ? ' ke ' + next.name : '');
  $('navinstruction').textContent = next.text;
  $('navdistance').textContent = fmtDist(distToManeuver) + (next.name ? ' · ' + next.name : '');
  $('navmaneuver').innerHTML = maneuverSVG(next.dir);

  if (S._lastStep !== S.stepIdx) {
    S._lastStep = S.stepIdx;
    speak(instr);
  }

  const remaining = S.route.distance - distanceAlong(shape, 0, curIdx);
  $('navremaining').textContent = fmtDist(Math.max(0, remaining));
  $('naveta').textContent = etaText(remaining);

  followBearing(bearingTo(S.userPos, next.location));
}

function etaText(remainingM) {
  const speed = S.speed > 5 ? S.speed : 40; // km/j
  const remainSec = remainingM / (speed*1000/3600);
  const arr = new Date(Date.now() + remainSec*1000);
  return 'Tiba ' + arr.toLocaleTimeString('ms-MY', {hour:'2-digit', minute:'2-digit'});
}

// ---- Paparan kelajuan ----
function updateSpeedDisplay() {
  const box = $('speedbox');
  $('speedval').textContent = Math.round(S.speed);
  box.classList.toggle('over', S.speed > 120);
}

// ---- Had laju (dari OSM via Overpass, graceful fallback) ----
function checkSpeedLimit() {
  if (Date.now() - S.lastSpeedCheck < 30000) return; // semak tiap 30s
  S.lastSpeedCheck = Date.now();
  if (!S.userPos) return;
  const [lng, lat] = S.userPos;
  const q = `[out:json][timeout:10];way(around:80,${lat},${lng})["maxspeed"];out tags 3;`;
  fetch('https://overpass-api.de/api/interpreter', {
    method:'POST', headers:{ 'User-Agent':'HalaTuju/1.0' },
    body: 'data=' + encodeURIComponent(q),
  })
    .then(r => r.json())
    .then(d => {
      const els = (d.elements || []).filter(e => e.tags && e.tags.maxspeed);
      if (!els.length) { $('limitbox').classList.add('hidden'); return; }
      let ms = els[0].tags.maxspeed;
      ms = String(ms).replace(/\D/g, '');
      if (!ms) { $('limitbox').classList.add('hidden'); return; }
      $('limitval').textContent = ms + ' km/j';
      $('limitbox').classList.remove('hidden');
    })
    .catch(() => { /* senyap - had laju optional */ });
}

let followMode = true;
let lastMapInteraction = 0;
// Waze-style: anak panah di bahagian bawah skrin (bukan tengah), via padding atas besar
function followBearing(bearing) {
  if (!followMode) return;
  S.map.easeTo({
    bearing,
    center: S.userPos,
    zoom: 17,
    pitch: 45,
    padding: { top: 220, bottom: 130, left: 60, right: 60 },
    duration: 800,
  });
}

// ---- TTS (sebutan Melayu) ----
function speak(text) {
  if (!text) return;
  try {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ms-MY';
    u.rate = 1.0;
    const voices = speechSynthesis.getVoices();
    const ms = voices.find(v => v.lang && v.lang.toLowerCase().startsWith('ms'));
    if (ms) u.voice = ms;
    speechSynthesis.speak(u);
  } catch(e) {}
}

// ---- Butang ----
function setupButtons() {
  $('myloc').addEventListener('click', () => {
    if (S.userPos) S.map.easeTo({ center:S.userPos, zoom:15 });
    else getLocation();
  });
  $('darkbtn').addEventListener('click', toggleDark);
  $('homebtn').addEventListener('click', () => { goHome(); $('quickmenu').classList.add('hidden'); });
  $('parkbtn').addEventListener('click', () => { toggleParking(); $('quickmenu').classList.add('hidden'); });
  // Menu "Lagi" toggle
  $('menubtn').addEventListener('click', () => $('quickmenu').classList.toggle('hidden'));
  $('gobtn').addEventListener('click', startNavigation);
  $('savefav').addEventListener('click', addFav);
  $('cancelroute').addEventListener('click', () => {
    $('routepanel').classList.add('hidden');
    const src = S.map.getSource('route');
    if (src) src.setData(emptyLine());
    if (S.destinationMarker){S.destinationMarker.remove();S.destinationMarker=null;}
    S.dest=null; S.route=null; S.allRoutes=[];
  });
  $('stopnav').addEventListener('click', stopNavigation);
  $('recenter').addEventListener('click', () => {
    followMode = true;
    if (S.userPos) S.map.easeTo({ center:S.userPos, zoom:17, pitch:45 });
  });

  // Butang POI
  document.querySelectorAll('.poi').forEach(btn => {
    btn.addEventListener('click', () => searchPOI(btn.dataset.amenity));
  });

  // Mod perjalanan (butang .travel)
  document.querySelectorAll('.travel').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.travel').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (S.dest && S.userPos) fetchRoute(S.userPos, [S.dest.lng, S.dest.lat]);
    });
  });

  // Bottom sheet: lipat / buka (butang + pemegang tarik)
  const collapseBtn = $('collapsebtn');
  const sheetHandle = $('sheethandle');
  function toggleSheet() {
    const panel = $('routepanel');
    const collapsed = panel.classList.toggle('collapsed');
    collapseBtn.classList.toggle('expanded', collapsed);
  }
  if (collapseBtn) collapseBtn.addEventListener('click', toggleSheet);
  if (sheetHandle) sheetHandle.addEventListener('click', toggleSheet);

  // Tukar pilihan routing -> kira semula
  document.querySelectorAll('input[name="mode"], #avoidToll, #avoidHighway').forEach(el => {
    el.addEventListener('change', () => {
      if (S.dest && S.userPos) fetchRoute(S.userPos, [S.dest.lng, S.dest.lat]);
    });
  });
}

// ---- Daftar service worker + mula ----
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      // Auto-update: bila versi baru tersedia, aktifkan & muat semula
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            newWorker.postMessage('SKIP_WAITING');
            setTimeout(() => location.reload(), 300);
          }
        });
      });
    });
    // semak update setiap kali app dibuka
    navigator.serviceWorker.ready.then(reg => reg.update());
  });
}

// pulih mod malam
S.darkMode = localStorage.getItem('halaTuju.dark') === '1';

initMap();
setupSearch();
setupVoiceSearch();
setupAddPlace();
setupButtons();
renderFavs();
renderHistory();
setupStats();

// Tarik trafik sekitar setiap 30 saat (sekali lokasi dah sedia)
setInterval(() => {
  if (S.userPos) fetchTraffic();
}, 30000);

// ---- Statistik (panel 📊) ----
function setupStats() {
  $('statsbtn').addEventListener('click', () => {
    // isi statistik lokal
    $('stat-favs').textContent = getFavs().length;
    $('stat-history').textContent = getHistory().length;
    $('statsmodal').classList.remove('hidden');
    // tarik statistik cloud
    fetch(PLACES_ENDPOINT + '/stats')
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          $('stat-total').textContent = d.total;
          $('stat-today').textContent = d.addedToday;
        }
      })
      .catch(() => {
        $('stat-total').textContent = '—';
        $('stat-today').textContent = '—';
      });
  });
  $('stats-close').addEventListener('click', () => $('statsmodal').classList.add('hidden'));
  $('statsmodal').addEventListener('click', e => {
    if (e.target === $('statsmodal')) $('statsmodal').classList.add('hidden');
  });
}
