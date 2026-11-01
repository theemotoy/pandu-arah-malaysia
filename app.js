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

// ---- Penanda arah ----
function arrowSVG() {
  return `<svg viewBox="0 0 24 24"><path d="M12 2 L21 20 L12 16 L3 20 Z" fill="#1e88e5" stroke="#fff" stroke-width="1"/></svg>`;
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
  S.map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');

  const el = document.createElement('div');
  el.className = 'user-arrow';
  el.innerHTML = arrowSVG();
  el.style.width = '28px'; el.style.height = '28px';
  S.userMarker = new maplibregl.Marker({ element: el, rotationAlignment:'map' })
    .setLngLat([0,0]).addTo(S.map);

  S.map.on('load', () => {
    addRouteLayers();
  });

  S.map.on('click', e => {
    if (S.navigating) return;
    setDestination(e.lngLat.lng, e.lngLat.lat, 'Titik dipilih');
  });

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
    paint:{'line-color':'#ffffff','line-width':10} });
  S.map.addLayer({ id:'route-line', type:'line', source:'route',
    layout:{'line-join':'round','line-cap':'round'},
    paint:{'line-color':'#1e88e5','line-width':6} });
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
  }
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
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=7&countrycodes=my&q=${encodeURIComponent(text)}&accept-language=ms`;
  fetch(url, { headers:{ 'Accept':'application/json', 'User-Agent':'HalaTuju/1.0' } })
    .then(r => r.json())
    .then(rs => renderResults(rs))
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

function getMyPlaces() {
  try { return JSON.parse(localStorage.getItem('halaTuju.myplaces') || '[]'); }
  catch(e) { return []; }
}
function saveMyPlaces(places) { localStorage.setItem('halaTuju.myplaces', JSON.stringify(places)); }

function openAddPlace(lng, lat) {
  addPlacePos = [lng, lat];
  $('addplace-coords').textContent = 'Lokasi: ' + lat.toFixed(5) + ', ' + lng.toFixed(5);
  $('addplace-name').value = '';
  $('addplacemodal').classList.remove('hidden');
  setTimeout(() => $('addplace-name').focus(), 100);
}
function closeAddPlace() {
  $('addplacemodal').classList.add('hidden');
  addPlacePos = null;
}

function saveMyPlace() {
  const name = $('addplace-name').value.trim();
  if (!name) { toast('Sila masukkan nama tempat'); return; }
  if (!addPlacePos) { toast('Tiada lokasi dipilih'); return; }
  const type = $('addplace-type').value;
  let places = getMyPlaces();
  places.push({ name, lat: addPlacePos[1], lng: addPlacePos[0], type });
  saveMyPlaces(places);
  toast('✅ "' + name + '" disimpan — boleh dicari sekarang');
  closeAddPlace();
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
  const travelEl = document.querySelector('input[name="travel"]:checked');
  return {
    mode: modeEl ? modeEl.value : 'fastest',
    travel: travelEl ? travelEl.value : 'auto',
    avoidToll: $('avoidToll').checked,
    avoidHighway: $('avoidHighway').checked,
  };
}

// ---- Fetch route (Valhalla) ----
async function fetchRoute(from, to) {
  const opts = getRouteOptions();
  // pemetaan mod perjalanan -> costing Valhalla
  let costing = 'auto';
  if (opts.travel === 'pedestrian') costing = 'pedestrian';
  else if (opts.travel === 'bicycle') costing = 'bicycle';
  else if (opts.mode === 'shortest') costing = 'shortest';

  const costOpts = {};
  if (costing === 'auto' || costing === 'shortest') {
    if (opts.avoidToll) costOpts.use_tolls = 0.0;
    if (opts.avoidHighway) costOpts.use_highways = 0.0;
  }

  const body = {
    locations: [{ lat: from[1], lon: from[0] }, { lat: to[1], lon: to[0] }],
    costing: costing,
    costing_options: { [costing]: costOpts },
    directions_options: { units: 'kilometers' },
    alternates: (costing === 'auto' || costing === 'shortest') ? 2 : 0,
  };

  toast('Mengira laluan…', 6000);
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
    showRouteSummary();
    showAlternates();
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
  $('poibar').classList.add('hidden');
  $('speedbox').classList.remove('hidden');
  $('limitbox').classList.remove('hidden');
  S.map.easeTo({ zoom: 16 });
  S._lastStep = -1;
  updateNavigation();
}
function stopNavigation() {
  S.navigating = false;
  $('navbanner').classList.add('hidden');
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

  // auto-reroute: jika pengguna jauh dari laluan (>80m), kira semula
  const offRouteDist = haversine(S.userPos[1], S.userPos[0], shape[curIdx][1], shape[curIdx][0]);
  if (offRouteDist > 80 && S.dest && Date.now() - (S._lastReroute||0) > 15000) {
    S._lastReroute = Date.now();
    toast('Mengira semula laluan…', 3000);
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
function followBearing(bearing) {
  if (!followMode) return;
  S.map.easeTo({ bearing, center: S.userPos, zoom: 17, pitch: 45, duration: 800 });
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
  $('homebtn').addEventListener('click', goHome);
  $('parkbtn').addEventListener('click', toggleParking);
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

  // Tukar pilihan routing -> kira semula
  document.querySelectorAll('input[name="mode"], input[name="travel"], #avoidToll, #avoidHighway').forEach(el => {
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
