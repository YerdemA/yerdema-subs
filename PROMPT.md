Bu klasörde Yerdema Subs adlı bir Chrome/Edge eklentisini sıfırdan geliştireceksin.

Önce şu dosyaları sırasıyla ve tamamen oku: CLAUDE.md, SPEC.md, TASKS.md, DECISIONS.md.
SPEC.md tek doğru kaynaktır; TASKS.md ilerleme durumudur.

Sonra TASKS.md'deki ilk işaretlenmemiş maddeden başla ve Phase 0'dan Phase 7'ye kadar tüm
fazları, ardından "Final report" maddesini kesintisiz tamamla. Zaman kalırsa Phase 8'e geç.

Kurallar:
- Ben uyuyorum, hiçbir soruya cevap veremem. Bana soru sorma, onay isteme, "devam edeyim mi"
  deme. Belirsiz bir durumda SPEC.md'ye uyan en basit seçeneği seç, DECISIONS.md'ye bir satır
  yaz ve devam et.
- Her maddeyi bitirince TASKS.md'de hemen işaretle. Her fazın sonunda typecheck, test ve build
  çalıştır; hepsi geçince commit at. Asla git push yapma.
- Context sıkıştırılırsa CLAUDE.md, SPEC.md ve TASKS.md'yi yeniden okuyup kaldığın yerden devam et.
- Tüm fazlar bitmeden durma. Bitince REPORT.md'yi Türkçe yaz ve bana kısa bir özet ver.
