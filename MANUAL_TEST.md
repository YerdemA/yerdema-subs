# Elle Test Listesi — Yerdema Subs v0.1.0

Sabah sırayla takip edin. Her adımın yanına ✅ / ❌ koyun; ❌ olanlarda açılır penceredeki durum
metnini ve (varsa) konsol hatasını not edin.

> Hata ayıklama ipucu: İçerik betiği hataları sayfanın DevTools konsolunda, arka plan hataları
> `chrome://extensions` → Yerdema Subs → "Service worker" bağlantısında görünür.

## 0. Hazırlık

- [ ] `npm install` ve `npm run build` hatasız biter (`verify-dist OK` yazar).
- [ ] Chrome → `chrome://extensions` → Geliştirici modu → **Paketlenmemiş öğe yükle** → `dist/`.
      Eklenti hata göstermeden yüklenir, simge (kırmızı konuşma balonu, "TR") görünür.
- [ ] Eklentiyi araç çubuğuna sabitleyin.
- [ ] **Önemli:** Daha önce açık olan sekmeleri yenileyin (yoksa açılır pencere "Bu sayfa
      desteklenmiyor" der).

## 1. Test sayfası (HTML5)

- [ ] Terminalde `npm run serve:test` → http://localhost:5173 adresini açın.
- [ ] Oynat'a basın. Birkaç saniye içinde videonun alt kısmında **Türkçe** altyazı görünür
      (ör. "Merhaba ve hoş geldiniz!"). Çeviri gelmeden önce kısa bir an İngilizce metin italik
      görünebilir.
- [ ] Tarayıcının kendi (İngilizce) altyazısı görünmez ("Orijinal altyazıları gizle" açık).
- [ ] Açılır pencere: durum "Türkçe altyazı etkin." ve "Kaynak: HTML5 video altyazı parçası".
- [ ] Sayfayı aşağı kaydırın: altyazı videoyla birlikte hareket eder.
- [ ] "Fullscreen (container)" düğmesi: tam ekranda da altyazı görünür. Esc ile çıkın.
- [ ] Videonun kendi kontrol çubuğundaki tam ekran düğmesi: altyazı **görünmeyebilir**
      (bilinen sınırlama: `<video>` öğesinin kendisi tam ekran olduğunda üzerine çizilemez).
- [ ] Videoyu durdurun → altyazı o anki cümlede kalır; ileri/geri sarın → altyazı hemen güncellenir.

## 2. YouTube — elle eklenmiş İngilizce altyazılı video

Örnek: TED konuşmaları genelde elle eklenmiş İngilizce altyazı içerir (ör. youtube.com'da
"TED talk" araması yapıp bir video açın).

- [ ] Video açılır, 1–3 saniye içinde Türkçe altyazı görünür. CC kapalıysa eklenti açmayı dener.
- [ ] YouTube'un kendi altyazısı görünmez.
- [ ] Açılır pencere: "Türkçe altyazı etkin." / "Kaynak: YouTube altyazıları".
- [ ] Videoyu ileri sarın (ör. ortasına) → altyazı birkaç saniye içinde Türkçe görünür.
- [ ] Reklam çıkarsa reklam süresince altyazı gizlenir, reklam bitince geri gelir.

## 3. YouTube — yalnızca otomatik oluşturulmuş altyazısı olan video

Örnek: altyazı ayarlarında yalnızca "İngilizce (otomatik oluşturuldu)" olan bir vlog/oyun videosu.

- [ ] Türkçe altyazı görünür; kelime kelime değil, **cümle/ifade halinde** gelir (en fazla ~7 sn
      ve ~120 karakter).
- [ ] Altyazı konuşmayla makul ölçüde senkron.
- [ ] Bir videoda otomatik altyazı hiç gelmezse 4 sn sonra "ekran altyazıları" moduna geçer
      (açılır pencerede "Kaynak: YouTube ekran altyazıları"); bu modda da Türkçe görünür.

## 4. YouTube — sayfa içi gezinme (SPA)

- [ ] Bir videodan sağdaki öneriler listesinden başka bir videoya geçin (sayfa yenilenmeden).
      Önceki videonun altyazısı kaybolur, yeni videonun Türkçe altyazısı gelir.
- [ ] Tarayıcının Geri düğmesiyle önceki videoya dönün → altyazı yine çalışır (ikinci seferde
      önbellekten anında gelir).
- [ ] YouTube ana sayfasına gidin → açılır pencere "Bu sayfada video bulunamadı."

## 5. YouTube — görünüm modları

- [ ] Sinema modu (t tuşu), tam ekran (f tuşu) ve mini oynatıcı (i tuşu): altyazı her modda
      videonun üzerinde kalır.

## 6. Ayarlar (açılır pencere)

Bir video oynarken açılır pencereyi açıp şunları deneyin; değişiklikler **sayfa yenilemeden**
uygulanmalı:

- [ ] **TR / TR + EN**: TR + EN'de Türkçe satırın altında daha küçük, soluk İngilizce satır çıkar.
- [ ] **Yazı boyutu** kaydırıcısı (14–48 px): altyazı büyür/küçülür.
- [ ] **Alttan konum** (2–40 %): altyazı yukarı/aşağı kayar.
- [ ] **Arka plan opaklığı** (0–100 %): arka plan kutusu şeffaflaşır/koyulaşır.
- [ ] **Orijinal altyazıları gizle** kapatılınca sitenin kendi altyazısı da görünür.
- [ ] Önizleme kutusu tüm ayarları anında yansıtır.
- [ ] Ana anahtar kapatılınca altyazı kaybolur, durum "Kapalı."; açılınca geri gelir.
- [ ] Açılır pencereyi kapatıp açın: ayarlar korunur. Tarayıcı karanlık temadaysa açılır
      pencere de karanlık görünür.
- [ ] Tarayıcı dili Türkçe ise açılır pencere Türkçe, İngilizce ise İngilizce.

## 7. Klavye kısayolu

- [ ] Video sayfasında **Alt+Shift+T** → altyazı kapanır; tekrar basınca açılır.
- [ ] Açılır pencerenin altında atanmış kısayol yazar. Kısayol atanmamışsa
      `chrome://extensions/shortcuts` üzerinden atayın.

## 8. Microsoft Edge

- [ ] `edge://extensions` → Geliştirici modu → **Paketlenmemiş öğe yükle** → `dist/`.
- [ ] Bölüm 1 (test sayfası) ve Bölüm 2 (YouTube) adımlarını Edge'de tekrarlayın.

## 9. Hata durumları

- [ ] Altyazısı olmayan bir YouTube videosu: durum "Bu videoda kullanılabilir altyazı yok." ve
      "Oynatıcıda altyazıyı (CC, İngilizce) açın." ipucu.
- [ ] `chrome://extensions` gibi bir sayfada açılır pencere: "Bu sayfa desteklenmiyor."
- [ ] İnternet bağlantısını kısa süre kesin: İngilizce metin italik görünür, durum "Çeviri
      başarısız oldu…"; bağlantı gelince 20 sn – birkaç dk içinde Türkçe gelir.

## Bilinen risk: Google hız sınırı

Geliştirme makinesinden `translate.googleapis.com` (client=gtx) adresine yapılan **tüm** curl
denemeleri HTTP 429 ("unusual traffic") döndü; `clients5.google.com` yedek adresi çalıştı.
Eklenti önce asıl adresi, 429 alırsa yedek adresi dener. Altyazılar hiç Türkçeye dönmüyorsa
Service worker konsolunda `HTTP 429` hatalarını kontrol edin ve not edin.
