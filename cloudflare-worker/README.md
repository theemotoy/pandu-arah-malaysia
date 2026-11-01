# HalaTuju AI — Cloudflare Worker

Pekerja Cloudflare yang memberi **carian pintar** kepada aplikasi HalaTuju.
API key AI kekal tersembunyi di sini (server-side), bukan dalam kod browser.

## Apa ia buat

Terima ayat Bahasa Melayu semula jadi → faham niat → tukar kepada tindakan:

| Ayat pengguna | Hasil |
|---|---|
| "cari kedai makan halal dekat sini" | carian restoran halal berdekatan |
| "aku nak isi minyak dulu" | carian stesen minyak |
| "bawa aku balik rumah" | navigasi ke Rumah |
| "simpan lokasi kereta aku" | simpan lokasi parkir |
| "mana klinik yang dekat" | carian klinik |

Model: `@cf/meta/llama-3.1-8b-instruct` (PERCUMA, tanpa kad kredit).

## Cara deploy (sekali sahaja, ~5 minit)

### 1. Daftar Cloudflare (percuma)
Buka https://dash.cloudflare.com/sign-up — daftar dengan email, pilih plan **Free**.

### 2. Pasang Wrangler (CLI Cloudflare)
```bash
npm install -g wrangler
```

### 3. Login
```bash
wrangler login
```
(Buka browser, benarkan akses Cloudflare)

### 4. Deploy worker ini
```bash
cd cloudflare-worker
wrangler deploy
```

Wrangler akan beri URL macam:
```
https://halatuju-ai.NAMA-KAU.workers.dev
```

### 5. Aktifkan AI dalam app
Buka `app.js`, cari baris:
```js
const AI_ENDPOINT = '';
```
Tukar kepada:
```js
const AI_ENDPOINT = 'https://halatuju-ai.NAMA-KAU.workers.dev/smartsearch';
```

### 6. Commit & push
```bash
git add -A
git commit -m "Aktifkan carian pintar AI"
git push origin main
```

Siap. Sekarang bila pengguna taip ayat penuh (3+ perkataan), app panggil worker
ini untuk faham niat & buat carian yang betul.

## Nota

- **Kos**: PERCUMA (Workers free tier + Llama 3.1 8B free).
- **Token**: setiap carian guna <300 token (input + output), jadi jauh dalam had percuma.
- **Sekiranya AI gagal/tak capai**: app terus guna carian biasa (Nominatim) sebagai sandaran.
