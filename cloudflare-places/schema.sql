-- HalaTuju Places — pangkalan tempat berkongsi (cloud D1)
-- Semua tempat ditambah oleh pengguna tersimpan di sini, boleh dicari semua orang.

CREATE TABLE IF NOT EXISTS places (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  type TEXT DEFAULT 'other',    -- amenity / kategori
  ts INTEGER NOT NULL           -- unix epoch (saat)
);

CREATE INDEX IF NOT EXISTS idx_name ON places(name);
CREATE INDEX IF NOT EXISTS idx_ll ON places(lat, lng);
