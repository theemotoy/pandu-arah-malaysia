# HalaTuju Traffic — Cloudflare Worker (Fasa 1)

Kumpul & agih trafik masa nyata secara crowd-source. Semua data **ANONIM**.

## Endpoint

- `POST /report` — terima `{lat, lng, speed, heading}` dari pengguna semasa navigasi
- `GET /traffic?minLat=..&maxLat=..&minLng=..&maxLng=..` — tarik kelajuan purata per grid

## Privasi (PDPA Malaysia)

- **TIADA identiti** disimpan — cuma koordinat + kelajuan + masa
- Data dipadam automatik selepas **10 minit**
- Tiada user ID, tiada device ID, tiada IP logging oleh worker

## Struktur

```
wrangler.toml      — konfigurasi + binding D1
schema.sql         — skema pangkalan data (table reports)
src/index.js       — logik worker
```

## Cara deploy (ulang bila perlu)

```bash
cd cloudflare-traffic
wrangler deploy
```

D1 database: `halatuju-traffic-db` (id: 4139f48c-3625-4eef-9809-67240d2a3bc9)
