# Yerdema Subs
[![CI](https://github.com/YerdemA/yerdema-subs/actions/workflows/ci.yml/badge.svg)](https://github.com/YerdemA/yerdema-subs/actions/workflows/ci.yml)

İzlediğiniz videonun **İngilizce altyazılarını** okuyup gerçek zamanlı olarak **Türkçeye**
çeviren ve videonun üzerinde gösteren bir Chrome / Edge (Manifest V3) eklentisi.

- **YouTube** (`youtube.com/watch`): YouTube oynatıcısının kendi indirdiği altyazıları kullanır
  (elle eklenmiş ya da otomatik oluşturulmuş). Otomatik altyazılardaki kelime parçalarını
  cümlelere birleştirir; gerekirse ekrandaki altyazıyı okumaya geri döner.
- Yerel altyazı parçası (`<track kind="subtitles|captions">`) olan **her HTML5 video**,
  iframe içindekiler dahil.
- Görünüm: yalnız Türkçe ya da Türkçe + İngilizce. Yazı boyutu, konum ve arka plan opaklığı
  ayarlanabilir. Sitenin kendi altyazısını gizleme seçeneği.
- Açılır pencere tarayıcı diline göre Türkçe ya da İngilizce; **Alt+Shift+T** kısayolu ile
  aç/kapat.
- Açılır pencerede "Bu sitede kapat" anahtarı ve "Geçerli altyazıyı kopyala" (Türkçe +
  İngilizce) düğmesi.

## Sınırlamalar

- **Var olan bir altyazı gerekir.** Altyazısı olmayan videolar desteklenmez (konuşmadan yazıya
  çevirme yok).
- Desteklenmeyenler: Netflix, Prime Video, Disney+, Twitch, canlı yayınlar, YouTube Shorts,
  başka sitelere gömülü YouTube videoları, altyazıyı düz DOM metni olarak çizen oynatıcılar
  (YouTube hariç), Firefox/Safari.
- CORS izni olmadan başka bir kaynaktan sunulan altyazı dosyaları tarayıcı tarafından
  okunamaz (durum: "kullanılabilir altyazı yok").
- Bir site doğrudan `<video>` öğesini tam ekran yaparsa (bir kapsayıcı yerine) üzerine hiçbir
  şey çizilemez; oynatıcıların çoğu kapsayıcıyı tam ekran yapar, bu durumda çalışır.
- Çeviri için ücretsiz, resmî olmayan Google Çeviri adresi kullanılır. Hız sınırına (HTTP 429)
  takılabilir. Bu durumda eklenti ikinci bir Google adresini dener, bekleyip yeniden dener;
  beklerken İngilizce metin italik olarak gösterilir.

## Kurulum ("Paketlenmemiş öğe yükle")

1. `npm install`, ardından `npm run build` (ya da `release/yerdema-subs-v0.1.0.zip` dosyasını
   bir klasöre açın).
2. **Chrome:** `chrome://extensions` adresini açın, **Geliştirici modu**nu açın,
   **Paketlenmemiş öğe yükle**'ye tıklayıp `dist/` klasörünü seçin.
3. **Edge:** `edge://extensions` adresini açın, **Geliştirici modu**nu açın,
   **Paketlenmemiş öğe yükle**'ye tıklayıp `dist/` klasörünü seçin.
4. **Önceden açık olan sekmeleri yenileyin** — içerik betikleri yalnızca eklenti kurulduktan
   sonra yüklenen sayfalara eklenir.
5. Eklentiyi araç çubuğuna sabitleyin ve bir video sayfasında açılır pencereyi açın.

Kısayol atanmamışsa (başka bir eklenti kullanıyor olabilir) `chrome://extensions/shortcuts`
ya da `edge://extensions/shortcuts` sayfasından atayın.

## Geliştirme

Gereksinimler: Node 20+, npm. Windows, macOS ve Linux'ta çalışır.

| Komut | Ne yapar |
|---|---|
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm test` | Vitest birim testleri |
| `npm run build` | `dist/` içine paketlenmemiş eklentiyi derler ve doğrular (`scripts/verify-dist.mjs`) |
| `npm run package` | Derleme + `release/yerdema-subs-v<sürüm>.zip` |
| `npm run icons` | `assets/icon.svg` dosyasından PNG simgeler üretir |
| `npm run serve:test` | `test-page/` klasörünü http://localhost:5173 adresinde sunar (`PORT` ile değiştirilebilir) |
| `npm run test:e2e` | Derleme + Playwright E2E: `dist/` klasörünü Chromium'a yükleyip test sayfasındaki katmanı kontrol eder (ilk sefer: `npx playwright install chromium`; gerçek Google için `E2E_REAL_TRANSLATE=1`) |

Test sayfası (`npm run serve:test`) İngilizce VTT altyazılı, kısa ve döngüde oynayan bir HTML5
video içerir — eklentinin çalıştığını görmenin en hızlı yolu.

## Gizlilik

Altyazı metni çeviri için Google Çeviri'ye (`translate.googleapis.com`, yedek
`clients5.google.com`) gönderilir. Başka hiçbir veri toplanmaz ve hiçbir yere gönderilmez:
analitik yok, hesap yok, sunucu yok. Ayarlar `chrome.storage.sync` içinde; son 30 videonun
çevirileri `chrome.storage.local` içinde önbelleğe alınır. Eklenti kapalıyken hiçbir metin
gönderilmez.

## Proje yapısı

Ayrıntılı dosya listesi için `README.md` dosyasındaki "Project structure" bölümüne bakın.
Kısaca: `src/shared/` (birim testli saf mantık), `src/background/` (çeviri servis çalışanı),
`src/content/` (katman, senkronizasyon, YouTube ve HTML5 adaptörleri), `src/popup/` (açılır
pencere), `_locales/` (TR/EN metinler), `test-page/` (test sayfası), `scripts/` (derleme
yardımcıları).

Geliştirme sırasında alınan kararlar `DECISIONS.md` dosyasındadır.
