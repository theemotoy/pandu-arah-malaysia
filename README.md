# 🚗 Pandu Arah Malaysia

Aplikasi penunjuk arah **ringan** untuk Malaysia — percuma, Bahasa Melayu, install terus di Android.

## Apa yang ada
- 🗺️ Peta OpenStreetMap **terkini** (dikemaskini harian oleh komuniti)
- 🔍 Cari tempat (sekolah, masjid, kedai, jalan…) — hasil biaskan ke Malaysia
- 🛣️ Routing turn-by-turn (enjin Valhalla)
- 🚀 **Paling cepat** / 📏 **Paling pendek** (pilihan mod)
- 🚧 **Elak tol** & 🛣️ **Elak lebuhraya** (toggle)
- 🔀 **Laluan alternatif** (sehingga 3, pilih & banding jarak/masa)
- 🧭 Navigasi sebenar: ikut bearing, auto-putar peta, anak panah belok
- 🔊 Arahan suara Bahasa Melayu (native TTS telefon)
- 📍 GPS lokasi semasa (panah ikut arah gerak)
- ⚡ Ringan (~50 KB kod, bukan ratusan MB macam Waze/Google Maps)

## Cara install di Android

### Cara paling mudah — terus jadi app (PWA)
1. Host folder ini ke internet (GitHub Pages / Netlify / Vercel — semua percuma).
2. Buka URL tu dalam **Chrome Android**.
3. Ketik menu ⋮ → **"Tambahkan ke skrin utama"**.
4. Siap — jadi app penuh dengan ikon sendiri.

### Cara dapat fail .apk (untuk install macam APK biasa)
1. Host dulu ke internet (dapatkan URL HTTPS).
2. Buka **[pwabuilder.com](https://www.pwabuilder.com/)** — percuma, tak perlu install apa-apa.
3. Tampal URL aplikasi → pilih platform **Android** → muat turun `.apk`.
4. Install `.apk` di telefon (benarkan "install dari sumber tidak diketahui").
   > PWABuilder bungkus PWA jadi APK sebenar tanpa perlu Java/Android Studio di PC kau.

## Nota teknikal (kejujuran)
- **Peta**: OpenStreetMap + gaya "Liberty" (OpenFreeMap) — terkini & percuma.
- **Routing**: Valhalla (`valhalla1.openstreetmap.de`) — sokong elak tol/lebuhraya, terpendek & alternatif. Pelayan demo awam, percuma untuk kegunaan peribadi. Untuk produksi/trafik tinggi perlu self-host.
- **Server**: TIADA server sendiri. Semua data datang dari servis awam percuma (peta, routing, carian). PC kau tak perlu hidup; yang perlu hidup cuma hosting fail statik (GitHub Pages).
- **"100% tepat"**: tiada peta yang 100%. OSM Malaysia antara paling terperinci, sentiasa dikemaskini.
- **Trafik/keseesakan masa nyata**: belum ada (perlu data crowd-sourced macam Waze).

## Struktur fail
```
index.html     — UI utama
app.js         — logik peta, carian, routing (Valhalla), navigasi, suara
style.css      — gaya
manifest.json  — konfigurasi PWA (boleh install)
sw.js          — service worker (offline shell)
icon-192/512   — ikon aplikasi
```

## Penambahbaikan akan datang
- [ ] Simpan tempat kegemaran & sejarah
- [ ] Trafik / kesesakan (perlu backend)
- [ ] POI kategori cepat (stesen minyak, klinik, ATM, masjid)
- [ ] Mod berjalan kaki / basikal
