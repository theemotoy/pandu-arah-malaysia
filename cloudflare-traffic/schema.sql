-- HalaTuju Traffic — skema pangkalan data D1 (Cloudflare)
-- Simpan laporan lokasi (anonim) untuk kira trafik masa nyata.

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  speed REAL DEFAULT 0,      -- km/j
  heading REAL DEFAULT 0,    -- darjah
  ts INTEGER NOT NULL        -- unix epoch (saat)
);

CREATE INDEX IF NOT EXISTS idx_ts ON reports(ts);
CREATE INDEX IF NOT EXISTS idx_ll ON reports(lat, lng);
