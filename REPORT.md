# Yerdema Subs v0.1.0 — Gece Raporu

## Ne yapıldı

SPEC.md'deki tüm kapsam (Phase 0–7) tamamlandı, her faz ayrı commit olarak kaydedildi
(`git log --oneline`). `npm run typecheck`, `npm test` (98 test), `npm run build` ve
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

Tarayıcıdaki istekler curl'den farklı davranabilir; sabah çeviri gelmiyorsa
`chrome://extensions` → Yerdema Subs → "Service worker" konsolundaki hatalara bakın.

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

Bu ortamda tarayıcıya tıklanamadığı için doğrulama birim testleri (98), derleme çıktısı
kontrolü (`scripts/verify-dist.mjs`: manifest, dosya referansları, içerik betiklerinde
`import/export` olmaması, yerelleştirme anahtarları) ile yapıldı. Phase 8'deki Playwright
E2E testinin sonucu aşağıda.

## Engellenen maddeler

Yok. Not: Mesajınızda geçen GitHub deposu (`YerdemA/yerdema-subs`) CLAUDE.md kuralı gereği
uzak depo olarak **eklenmedi** ve hiçbir şey push edilmedi.

## Phase 8 (stretch)

_Durum aşağıda güncellenecek._
