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

-- Insiden (kemalangan/jam/rosak/polisi) — TTL 30 minit
CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  type TEXT NOT NULL,        -- accident | jam | hazard | police
  ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inc_ts ON incidents(ts);
CREATE INDEX IF NOT EXISTS idx_inc_ll ON incidents(lat, lng);
