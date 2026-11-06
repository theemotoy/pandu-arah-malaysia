// HalaTuju — Data Kawasan Rehat & Rawat (R&R) + plaza tol utama Malaysia.
// Sumber: data awam LLM + OpenStreetMap. Koordinat anggaran (pusat kawasan).
// Kegunaan: papar R&R/tol di sepanjang laluan (ciri mesra Malaysia, gaya TuJu).

const RNR_PLACES = [
  // Lebuh raya PLUS (E1) — utara ke selatan
  { name: 'R&R Rawang (Arah Utara)', lat: 3.335, lng: 101.555, type: 'rnr', hwy: 'E1' },
  { name: 'R&R Rawang (Arah Selatan)', lat: 3.335, lng: 101.557, type: 'rnr', hwy: 'E1' },
  { name: 'R&R Sungai Buloh', lat: 3.180, lng: 101.570, type: 'rnr', hwy: 'E1' },
  { name: 'R&R Ayer Keroh (Arah Utara)', lat: 2.280, lng: 102.280, type: 'rnr', hwy: 'E2' },
  { name: 'R&R Ayer Keroh (Arah Selatan)', lat: 2.280, lng: 102.285, type: 'rnr', hwy: 'E2' },
  { name: 'R&R Machap', lat: 1.850, lng: 103.300, type: 'rnr', hwy: 'E2' },
  { name: 'R&R Pagoh', lat: 2.150, lng: 102.750, type: 'rnr', hwy: 'E2' },
  { name: 'R&R Yong Peng (Arah Utara)', lat: 2.000, lng: 103.050, type: 'rnr', hwy: 'E2' },
  { name: 'R&R Yong Peng (Arah Selatan)', lat: 2.000, lng: 103.055, type: 'rnr', hwy: 'E2' },
  { name: 'R&R Dengkil', lat: 2.870, lng: 101.670, type: 'rnr', hwy: 'E6' },
  { name: 'R&R Seremban', lat: 2.700, lng: 101.900, type: 'rnr', hwy: 'E2' },
  { name: 'R&R Tapah', lat: 4.200, lng: 101.250, type: 'rnr', hwy: 'E1' },
  { name: 'R&R Gunung Semanggol', lat: 4.950, lng: 100.650, type: 'rnr', hwy: 'E1' },
  { name: 'R&R Gurun', lat: 5.810, lng: 100.490, type: 'rnr', hwy: 'E1' },
  { name: 'R&R Juru', lat: 5.340, lng: 100.450, type: 'rnr', hwy: 'E1' },
  { name: 'R&R Hentian Sg. Perak', lat: 4.150, lng: 100.950, type: 'rnr', hwy: 'E1' },
];

const TOLL_PLAZAS = [
  { name: 'Plaza Tol Skudai', lat: 1.550, lng: 103.660, hwy: 'E3' },
  { name: 'Plaza Tol Kempas', lat: 1.570, lng: 103.720, hwy: 'E3' },
  { name: 'Plaza Tol Senai', lat: 1.620, lng: 103.640, hwy: 'E3' },
  { name: 'Plaza Tol Jalan Duta', lat: 3.175, lng: 101.670, hwy: 'E1' },
  { name: 'Plaza Tol Sungai Besi', lat: 3.060, lng: 101.710, hwy: 'E2' },
  { name: 'Plaza Tol Ayer Keroh', lat: 2.270, lng: 102.280, hwy: 'E2' },
  { name: 'Plaza Tol Juru', lat: 5.340, lng: 100.450, hwy: 'E1' },
  { name: 'Plaza Tol Rawang Selatan', lat: 3.300, lng: 101.540, hwy: 'E1' },
  { name: 'Plaza Tol Tanjung Malim', lat: 3.680, lng: 101.530, hwy: 'E1' },
];
