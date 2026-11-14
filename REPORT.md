# Yerdema Subs v0.1.0 — Gece Raporu

## Ne yapıldı

SPEC.md'deki tüm kapsam (Phase 0–7) tamamlandı, her faz ayrı commit olarak kaydedildi
(`git log --oneline`). `npm run typecheck`, `npm test` (101 birim testi), `npm run test:e2e` (4 Playwright testi), `npm run build` ve
`npm run package` hatasız çalışıyor. Yüklemeye hazır paket:
`release/yerdema-subs-v0.1.0.zip` (ya da `dist/` klasörü).

- **Arka plan (service worker):** Google Çeviri istemcisi; 40 satır / 4000 karakterlik
  gruplar, en fazla 2 eşzamanlı istek, satır sayısı tutmazsa tek tek çeviri, 429/5xx/ağ
  hatalarında 1-2-4 sn bekleyerek yeniden deneme. Bellek önbelleği (5000 kayıt) +
  `chrome.storage.local` içinde son 30 videonun çevirileri. Alt+Shift+T kısayolu.
- **Katman (overlay):** Shadow DOM, TR veya TR+EN, ayarlar sayfa yenilemeden uygulanır, çeviri
  gelmeden önce İngilizce metin italik/soluk. Senkronizasyon yalnızca video oynarken
  `requestAnimationFrame` ile, ikili arama ile aktif altyazı bulunur.
- **Çeviri önceliği:** Önce videonun o anki konumundan sonraki ~60 sn, sonra kalanı. İleri
  sarınca öncelik otomatik yeniden hesaplanır.
- **HTML5 adaptörü:** `textTracks` okur, İngilizce parçayı tercih eder, yerel altyazıyı gizler,
  iframe'lerde de çalışır, kaydırma/boyut/tam ekran değişikliklerini takip eder.
- **YouTube adaptörü:** MAIN dünyada `fetch`/XHR araya girerek oynatıcının indirdiği json3
  altyazıları yakalar (kendisi asla altyazı indirmez), otomatik altyazıları cümlelere
  birleştirir, CC kapalıysa oynatıcı API'si ile İngilizce altyazıyı açmayı dener (elle eklenen
  altyazıyı otomatiğe tercih eder). 4 sn içinde veri gelmezse ekrandaki altyazıyı okuma moduna
  geçer. Sayfa içi gezinme, reklamlar, sinema/tam ekran/mini oynatıcı desteklenir.
- **Açılır pencere:** Türkçe/İngilizce, karanlık mod, ana anahtar, durum satırı, TR/TR+EN
  seçimi, 3 kaydırıcı, "orijinal altyazıyı gizle", canlı önizleme, gizlilik notu, kısayol.
- **Belgeler:** `README.md`, `README.tr.md`, `MANUAL_TEST.md`, `DECISIONS.md`.

## Önemli: Google hız sınırı (429)

Bu makineden `translate.googleapis.com` (SPEC'teki `client=gtx` adresi) her curl denemesinde
**HTTP 429 "unusual traffic"** döndü — gece başında da sonunda da. Aynı biçimde yanıt veren
`clients5.google.com/translate_a/single?client=dict-chrome-ex` adresi ise çalıştı. Bu yüzden:

- Çevirmen önce SPEC'teki adresi, 429 veya HTML yanıt alırsa yedek adresi dener ve çalışan
  adresi hatırlar. `host_permissions` içine ikinci adres eklendi (SPEC §9'dan sapma).
- Test fikstürü (`google-sample.json`) yedek adresten alındı; biçim SPEC §4.1 ile aynı.

**Sonradan doğrulandı:** Eklentinin servis çalışanından (Playwright Chromium) yapılan istekte
**her iki adres de HTTP 200** döndü ("Good morning" → "Günaydın"). Yani 429 yalnızca curl'e
özgüydü; tarayıcıda SPEC'teki asıl adres çalışıyor, yedek adres yalnızca güvenlik ağı.
Sabah çeviri gelmiyorsa `chrome://extensions` → Yerdema Subs → "Service worker" konsoluna bakın.

## SPEC'ten bilinçli sapmalar (ayrıntılar DECISIONS.md'de)

- Kalıcı önbellek video başına **dizi değil `metin → çeviri` haritası** saklıyor (aynı video
  için farklı altyazı parçası/birleştirme gelirse yine geçerli kalsın diye).
- İkinci Google adresi + ek host izni (yukarıda).
- Çeviri hataları 20 sn'den 5 dk'ya kadar artan aralıklarla 5 kez otomatik yeniden denenir.

## Bilinen sınırlamalar

- Altyazısı olmayan videolar, Netflix/Prime/Disney+/Twitch, canlı yayın, Shorts, başka
  sitelere gömülü YouTube videoları desteklenmez (SPEC kapsamı dışında).
- `<video>` öğesinin kendisi tam ekran yapılırsa (kapsayıcı değil) üzerine çizim yapılamaz.
- Eklenti kurulmadan önce açık olan sekmeler yenilenmeli.
- CORS izni olmayan farklı kaynaklı altyazı dosyaları okunamaz.
- YouTube'un iç oynatıcı API'si (`getOption/setOption`) belgelenmemiş; değişirse CC'yi otomatik
  açma çalışmayabilir — bu durumda CC'yi elle açmak yeterli.

## Sabah önce neyi test etmeli

1. `npm run serve:test` → http://localhost:5173 → oynat: Türkçe altyazı görünüyor mu?
   (Bu, çeviri adresinin tarayıcıdan çalıştığını da gösterir.)
2. Elle eklenmiş İngilizce altyazılı bir YouTube videosu (ör. TED).
3. Yalnız otomatik altyazılı bir YouTube videosu.
4. YouTube'da öneriden başka videoya geçiş.

Tam liste: `MANUAL_TEST.md`.

## Gerçek tarayıcıda doğrulama

Elle tıklama yapılamadığı için doğrulama üç katmanda yapıldı:

1. **101 birim testi** (Vitest) — tüm saf mantık, YouTube json3/ASR birleştirme, çevirmen
   kuyruğu/yeniden deneme, katman ve senkronizasyon, MAIN-world yakalayıcı.
2. **`scripts/verify-dist.mjs`** her derlemede: manifest MV3, tüm dosya referansları mevcut,
   içerik betiklerinde `import/export` yok, `eval` yok, yerelleştirme anahtarları tam.
3. **Playwright E2E (`npm run test:e2e`, 4 test)** — paketlenmemiş eklenti gerçek Chromium'a
   yüklendi: servis çalışanı açılıyor, test sayfasında katman videonun üzerinde Türkçe satır
   gösteriyor, yerel altyazı gizleniyor, açılır pencere çiziliyor, aç/kapat ve site bazında
   kapatma canlı çalışıyor. **Gerçek Google ile** (`E2E_REAL_TRANSLATE=1`) de geçti:
   "This flower is beautiful." → **"Bu çiçek çok güzel."** Yani çeviri adresi tarayıcıdan bu
   makinede çalışıyor (curl'ün aldığı 429'a rağmen).

**YouTube:** `E2E_YOUTUBE=1 npx playwright test e2e/youtube.spec.ts` ile gerçek YouTube'da
denendi. YouTube, otomasyonla açılan Chromium'da (headless ve görünür pencerede) videoyu
oynatmayı reddetti ("Something went wrong") — bot koruması, eklentiyle ilgisi yok. Yine de
şu kısım **gerçek YouTube'da çalıştı**: MAIN-world betiği yüklendi, `#movie_player` API'si ile
altyazı listesi okundu ve elle eklenmiş İngilizce parça seçildi (`YT_CC_RESULT: ok, manual`).
Video oynamadığı için oynatıcı altyazı dosyasını indirmedi; yakalama (fetch/XHR) ve katman
kısmı gerçek YouTube'da doğrulanamadı (birim testleriyle doğrulandı). **Sabah ilk olarak
YouTube adımlarını (MANUAL_TEST.md bölüm 2–5) deneyin.**

## Engellenen maddeler

Yok. Not: Mesajınızda geçen GitHub deposu (`YerdemA/yerdema-subs`) CLAUDE.md kuralı gereği
uzak depo olarak **eklenmedi** ve hiçbir şey push edilmedi. İsterseniz:
`git remote add origin https://github.com/YerdemA/yerdema-subs.git` ve `git push -u origin main`.

## Phase 8 (stretch) — tamamlandı

- **Playwright E2E** (yukarıda).
- **Site bazında kapatma:** açılır pencerede "Bu sitede kapat (alan adı)". Ayarlara
  `disabledSites` listesi eklendi (iframe'ler üst sayfanın alan adını kullanır).
- **Geçerli altyazıyı kopyala:** Türkçe satır + İngilizce satır panoya kopyalanır.
