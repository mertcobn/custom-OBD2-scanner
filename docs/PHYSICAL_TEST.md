# Faz 7: Fiziksel test kontrol listesi

Gerçek araç ve adaptörle yapılacak testler. Bir adım başarısız olursa **Araç → Adaptör ve bağlantı → Adaptör günlüğü →
Tüm günlüğü kopyala** ile ham trafiği kopyala ve paylaş; sorunların çoğu bu günlükten anlaşılır.

## 0. Hazırlık
- [ ] Telefon (Android + Chrome) ve/veya bilgisayar (Chrome/Edge) hazır.
- [ ] Uygulama Vercel adresinden açılıyor (HTTPS).
- [ ] Telefonda Bluetooth ve **konum** açık (Android, BLE taraması için konum izni isteyebilir).
- [ ] Başka bir OBD uygulaması adaptöre bağlı **değil** (Car Scanner, Torque vb. kapat).

## 1. Adaptör tipini belirle (HH OBD Advanced)
- [ ] Telefona **nRF Connect** kur → **Scan**.
  - Listede `OBDII`, `OBDBLE`, `V-LINK`, `IOS-Vlink` vb. görünüyorsa → **BLE** ✅ (telefon + bilgisayar).
  - Görünmüyor ama telefon Bluetooth ayarlarında PIN (1234/0000) ile eşleşiyorsa → **Klasik** → bilgisayar + "Klasik Bluetooth / USB".
- [ ] nRF Connect'te cihaza bağlanıp servis UUID'lerini not et (`FFF0`, `FFE0`, `18F0`…). Tanınmazsa bunu paylaş.

## 2. Bağlantı
- [ ] Adaptörü tak, kontağı aç (II). Adaptör ışığı yanıyor.
- [ ] **Bluetooth ile bağlan** → listede adaptör görünüyor. Görünmüyorsa: **"Adaptörüm listede yok, tüm cihazları göster"**.
- [ ] Adımlar sırayla tamamlanıyor: Adaptör bulundu → hazırlandı (ELM327 v1.x) → protokol → araç yanıt verdi.
- [ ] Bağlantı süresi: ____ sn (ilk bağlantıda protokol araması 5–10 sn sürebilir).
- [ ] Üst çubukta voltaj görünüyor (kontak açık ≈ 12,2–12,8 V; motor çalışırken ≈ 13,5–14,7 V).

## 3. Göstergeler ve canlı veri
- [ ] Motoru çalıştır: devir rölantide makul (≈ 650–950).
- [ ] Gaza basınca devir ve gaz kelebeği tepki veriyor (gecikme < 1 sn).
- [ ] Canlı Veri sayfasında sinyal sayısı: ____ ; okuma hızı (/s): ____.
- [ ] Soğutma suyu sıcaklığı araç göstergesiyle uyumlu.
- [ ] Bir satıra dokun → grafik akıyor.
- [ ] Birimi Ayarlar'dan değiştir (°F, mph) → değerler doğru dönüşüyor.

## 4. Arıza kodları
- [ ] Arıza sayfası kodları okuyor (kod yoksa "Arıza kodu yok").
- [ ] Varsa: kod, açıklama ve donmuş kare görünüyor; araçtaki başka bir uygulamayla aynı kodlar.
- [ ] (İsteğe bağlı, bilerek) **Kodları sil**: motor kapalı, kontak açık → lamba söner, monitörler "hazır değil" olur.

## 5. Araç bilgisi
- [ ] VIN doğru (ruhsatla karşılaştır). Bazı eski araçlar VIN bildirmez; bu normal.
- [ ] Marka / model yılı mantıklı; protokol görünüyor.
- [ ] Muayene hazırlığı listesi dolu.

## 6. Kayıt
- [ ] "Günlük sürüş" ile 5–10 dk kayıt; yolda bir kez **Anı işaretle** + not.
- [ ] Ekran kayıt boyunca kapanmıyor.
- [ ] Adaptörü kısa süre çıkar-tak (ya da araçtan uzaklaş): durum "Yeniden bağlanıyor…" → tekrar bağlı; kayıt devam ediyor.
- [ ] Durdur → özet, grafik, istatistikler doğru.
- [ ] Sayfayı kayıt sırasında yenile → açılışta "yarıda kaldı" uyarısı ve kurtarılmış veri.

## 7. Dışa aktarım
- [ ] PDF rapor iniyor; Türkçe karakterler, grafikler ve arıza tablosu doğru.
- [ ] AI paketi (ZIP) iniyor; `summary.md` ve `session.json` açılıyor. Paketi bir yapay zekâya ver ve yorumunu değerlendir.
- [ ] CSV Excel/Sheets'te düzgün açılıyor.
- [ ] Telefonda **Paylaş** düğmesi (WhatsApp/Drive) çalışıyor.

## 8. Kurulum ve çevrimdışı
- [ ] Chrome menüsü → **Ana ekrana ekle** → uygulama simgesiyle açılıyor.
- [ ] Uçak modunda uygulama açılıyor (bağlantı Bluetooth olduğundan internetsiz çalışır).

## Sonuçları paylaşırken
Araç marka/model/yıl, adaptör adı, telefon/tarayıcı sürümü ve gerekirse **adaptör günlüğü**.
