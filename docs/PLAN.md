# Shindan 診断 — Web OBD2 Tarayıcı · Ürün ve Teknik Plan

> Durum: **Canlı belge.** Her faz bitince ilgili bölüm güncellenir.
> Dil: Türkçe (kod, değişken ve commit mesajları İngilizce).

---

## 0. Özet

**Shindan** (診断, Japonca "teşhis"), tarayıcı üzerinden **Bluetooth** ile bir
ELM327 uyumlu OBD2 adaptörüne bağlanan, aracın tüm standart (SAE J1979) verilerini
okuyan, gösteren, kaydeden ve **insanlar (PDF)** ve **yapay zekâ (JSON/CSV/Markdown)**
için dışa aktaran, Vercel'de yayınlanan, hesapsız ve sunucusuz bir web uygulamasıdır.

| Karar | Seçim | Gerekçe |
|---|---|---|
| Hedef kullanıcı | Herkese açık ürün | Kullanıcı soru turu |
| Hesap / sunucu | **Yok.** Tüm veri cihazda; kullanıcı indirir | Gizlilik, sıfır işletme maliyeti |
| Kalıcılık | Yalnızca **cihazda geçici tampon** (IndexedDB) | Sekme kapanırsa kayıt kaybolmasın |
| Platform | Web (PWA). Android + Windows + macOS + Linux | Web Bluetooth desteği |
| iPhone | Safari'de imkânsız (Apple engelliyor) → **Bluefy** yönlendirmesi | Platform kısıtı |
| Adaptör | Genel: **ELM327 komut seti** + çoklu BLE profil + Web Serial | Kullanıcının adaptörü: HH OBD Advanced (ELM327) |
| Veri kapsamı | Standart OBD2 (Mode 01,02,03,04,06*,07,09,0A) | Üreticiye özel PID'ler ileride eklenti |
| Dil | TR + EN (i18n altyapısı) | |
| Birim | Metrik / Imperial + tek tek özelleştirme | |
| Dışa aktarım | PDF (insan), JSON + CSV + Markdown özet (AI paketi) | "İnsan da AI da anlamalı" |
| Analitik | Vercel Web Analytics (çerezsiz) + opsiyonel hata takibi. **Araç verisi asla gönderilmez** | |
| Tema | Japon minimalizmi: washi, sumi, sakura, ensō, hanko | Kullanıcı isteği |

\* Mode 06 (on-board test sonuçları) Faz 3'te "ileri seviye" sekmesi olarak.

---

## 1. Platform Gerçekleri ve Kısıtlar (önemli)

### 1.1 Web Bluetooth
- Yalnızca **BLE (Bluetooth Low Energy / GATT)** cihazlarla konuşur.
- Destek: Chrome / Edge / Opera / Samsung Internet (Android, Windows, macOS, Linux, ChromeOS).
- **Desteklemeyen:** iOS'taki tüm tarayıcılar (WebKit zorunlu), Safari (macOS dahil), Firefox.
- HTTPS zorunlu (Vercel sağlıyor; yerelde `localhost` muaf).
- `requestDevice()` **kullanıcı hareketi (tık)** gerektirir; otomatik bağlanma yalnızca
  `navigator.bluetooth.getDevices()` destekleniyorsa (Chrome bayraklı / yeni sürümler) denenir.

### 1.2 Classic Bluetooth (SPP) adaptörler
- Ucuz ELM327'lerin bir kısmı Classic BT'dir; **Web Bluetooth bunlara bağlanamaz.**
- Çözüm: **Web Serial API** — masaüstü Chrome/Edge 117+ Bluetooth RFCOMM
  servislerine (SPP UUID `00001101-0000-1000-8000-00805f9b34fb`) doğrudan bağlanabilir;
  ayrıca işletim sisteminde eşleştirilmiş BT'nin oluşturduğu sanal COM portu da seçilebilir.
- Android Chrome'da Web Serial desteği sürüme göre değişir → çalışma zamanında özellik tespiti.

### 1.3 Kullanıcının adaptörü — HH OBD Advanced (ELM327)
Bu model iki versiyonla satılıyor. İlandaki "iOS" ibaresi BLE (4.0) olduğuna işaret ediyor.
**Adaptör gelince 30 saniyelik test:**
1. Telefona **nRF Connect** (Nordic) uygulamasını kur → Scan.
2. Listede `OBDII`, `OBDBLE`, `IOS-Vlink`, `V-LINK` vb. bir isim görünüyorsa → **BLE** ✅ (Web Bluetooth ile çalışır).
3. Görünmüyor ama telefonun normal Bluetooth ayarlarında `OBDII` olarak eşleşiyorsa (PIN 1234/0000) → **Classic** → laptop + Web Serial ile çalışır.

### 1.4 ELM327 hız gerçeği
- Tek PID sorgusu ~30–120 ms (protokole ve klon kalitesine bağlı).
- Pratikte **5–15 sorgu/sn toplam**. 10 PID izlenirse her biri ~1 Hz.
- Hızlandırma teknikleri (Faz 2/3): CAN'de çoklu PID isteği (`01 0C 0D 05 ...` 6 PID'e kadar),
  `ATAT2` adaptif zamanlama, yanıt sayısı ipucu (`010C1`), öncelik katmanlı yoklama.

---

## 2. Teknoloji Yığını

| Katman | Seçim | Neden |
|---|---|---|
| Build | **Vite 8** + **React 19** + **TypeScript** | Sunucu yok → saf SPA en sade ve hızlı. Vercel statik olarak sunar |
| Stil | **Tailwind CSS 4** + CSS değişkenleri (tasarım token'ları) | Tema/koyu mod için token tabanlı |
| Router | React Router | Sekmeler arası derin bağlantı (`/live`, `/dtc` ...) |
| Durum | **Zustand** | Küçük, hızlı, React dışından (OBD motoru) erişilebilir |
| i18n | i18next + react-i18next | TR/EN, ileride başka diller |
| Grafik | **uPlot** | Binlerce noktalı zaman serisinde en hızlı kütüphane |
| Gösterge | Özel SVG (ensō fırça halkası) | Tema kimliği |
| Depolama | `idb` (IndexedDB) | Kayıt tamponu, ayarlar |
| PDF | jsPDF (+ grafik için canvas → görüntü) | Tamamen istemci tarafı |
| Arşiv | fflate (ZIP) | AI paketini tek dosya olarak indirmek |
| PWA | vite-plugin-pwa (Workbox) | Çevrimdışı çalışma, "Ana ekrana ekle" |
| Analitik | @vercel/analytics | Çerezsiz |
| Test | Vitest (birim), Testing Library, Playwright (E2E, yerleşik Chromium) | |
| Kalite | ESLint + Prettier + `tsc --noEmit` | |
| Fontlar | @fontsource (kendi barındırma, çevrimdışı çalışsın) — Shippori Mincho (başlık), Zen Kaku Gothic New (gövde), JetBrains Mono (sayılar) | |

---

## 3. Mimari

```
┌──────────────────────────── UI (React) ────────────────────────────┐
│ Pages: Gösterge · Canlı Veri · Arıza · Araç · Kayıt · Ayarlar     │
│ Design system (src/ui)   ·   i18n   ·   units formatter            │
└──────────────▲───────────────────────────────▲──────────────────────┘
               │ zustand stores (seçiciler)   │ komutlar (connect, scan, record)
┌──────────────┴───────────────────────────────┴──────────────────────┐
│ Session / Services (src/obd/services)                              │
│  ConnectionManager (durum makinesi) · PollScheduler · Recorder     │
│  DtcService · VehicleInfoService · ReadinessService · FreezeFrame  │
├─────────────────────────────────────────────────────────────────────┤
│ Protocol (src/obd/protocol) — saf fonksiyonlar, %100 test edilebilir │
│  PID tablosu + decoder'lar · DTC çözücü · ISO-TP/çok çerçeve birleştirme│
│  supported-PID bitmask · VIN parse · readiness bit çözümleme        │
├─────────────────────────────────────────────────────────────────────┤
│ Adapter driver (src/obd/elm)                                       │
│  Elm327Driver: komut kuyruğu, '>' istemi, zaman aşımı, init dizisi │
│  (ileride: StnDriver – OBDLink ST komutları)                        │
├─────────────────────────────────────────────────────────────────────┤
│ Transport (src/obd/transport) — interface Transport                │
│  BleTransport (Web Bluetooth) · SerialTransport (Web Serial)       │
│  SimTransport (sanal ELM327 + sanal araç fizik modeli)             │
└─────────────────────────────────────────────────────────────────────┘
```

**Temel ilke:** Her katman bir altındakini yalnızca arayüz üzerinden tanır.
`SimTransport`, gerçek bir ELM327 gibi AT komutlarına ve OBD isteklerine **ham metin**
yanıt verir; böylece sürücü ve protokol katmanı arabasız uçtan uca test edilir,
kullanıcılar da **Demo modu** ile uygulamayı deneyebilir.

### 3.1 Klasör yapısı
```
src/
  app/            App, router, layout, providers
  ui/             tasarım sistemi: Button, Card, Gauge(Enso), Hanko, Sheet, Tabs, Toggle, ...
  features/
    connect/      bağlantı akışı, uyumluluk kontrolü, iOS yönlendirme
    dashboard/    ensō göstergeler, özelleştirilebilir ızgara
    live/         tüm PID'lerin listesi, arama, sabitleme, grafik
    dtc/          arıza kodları, açıklama, silme akışı, freeze frame
    vehicle/      VIN, ECU'lar, protokol, desteklenen PID'ler, readiness
    record/       kayıt sihirbazı, canlı kayıt ekranı, oturumlar
    export/       PDF, JSON, CSV, MD üreticileri
    settings/     dil, birim, tema, adaptör, gizlilik
  obd/
    transport/    Transport arayüzü + ble, serial, sim
    elm/          Elm327Driver
    protocol/     pids.ts, decoders.ts, dtc.ts, isotp.ts, vin.ts, readiness.ts
    services/     connection, poller, recorder, ...
    sim/          sanal araç modeli
  data/           dtc-tr.json, dtc-en.json (P0/P2/C/B/U genel kodlar)
  storage/        idb şeması, kayıt tamponu
  i18n/           tr.json, en.json
  units/          birim dönüşümleri, biçimlendirme
  state/          zustand store'ları
```

### 3.2 Transport arayüzü
```ts
interface Transport {
  readonly kind: 'ble' | 'serial' | 'sim';
  connect(): Promise<void>;          // kullanıcı tıkı içinde çağrılır
  disconnect(): Promise<void>;
  write(data: string): Promise<void>; // ASCII, '\r' sonlandırma sürücüde
  onData(cb: (chunk: string) => void): () => void;
  onClose(cb: (reason?: Error) => void): () => void;
  readonly deviceName?: string;
}
```

**BLE profil tablosu** (genişletilebilir; yeni adaptör = tabloya bir satır):

| Profil | Servis | Yazma | Bildirim | Görülen cihazlar |
|---|---|---|---|---|
| FFF0 | `0000fff0-…` | `fff2` | `fff1` | Çoğu ELM327 BLE klonu, HH OBD, Veepeak |
| FFE0 | `0000ffe0-…` | `ffe1` | `ffe1` | HM-10 tabanlı klonlar |
| 18F0 | `000018f0-…` | `2af1` | `2af0` | Vgate iCar Pro BLE, Vlinker |
| OBDLink | `e7810a71-73ae-499d-8c15-faa9aef0c3f2` | `bef8d6c9-9c21-4c9e-b632-bd58c1009f9f` | aynı | OBDLink CX / MX+ |

`requestDevice({ filters: [...namePrefix], optionalServices: [tüm profiller] })` →
bağlandıktan sonra servisler sırayla denenir, ilk eşleşen profil kullanılır ve cihaz için hatırlanır.
BLE yazma 20 bayt MTU'ya göre parçalanır.

### 3.3 ELM327 sürücüsü
- **Kuyruk:** Aynı anda tek komut. Her komut `{cmd, timeoutMs, priority}`. Yanıt `>` istemi gelince tamamlanır.
- **Init dizisi:** `ATZ` (reset, 1.5 sn bekle) → `ATE0` (echo kapalı) → `ATL0` (satır sonu) →
  `ATS0` (boşluk yok) → `ATH1` (başlıklar açık: çoklu ECU ayırt etmek için) →
  `ATAT1`/`ATAT2` → `ATSP0` (otomatik protokol) → `0100` (ilk sorgu protokolü belirler) → `ATDPN` (protokol no).
  `ATI` (sürüm), `ATRV` (akü voltajı) bilgi olarak.
- **Hata yönetimi:** `NO DATA`, `?`, `STOPPED`, `BUS INIT: ...ERROR`, `UNABLE TO CONNECT`,
  `CAN ERROR`, `BUFFER FULL`, `SEARCHING...` metinleri tiplenmiş hatalara dönüşür.
- **Klon tuzakları:** sahte `v2.1` klonlarında bazı AT komutları `?` döner → komut başarısızsa atla.
- **Yeniden bağlanma:** BLE kopunca 3 deneme, üstel bekleme; kayıt sürüyorsa kayıt "duraklatıldı" olur, devam eder.

### 3.4 Protokol katmanı
- **Mode 01 PID tablosu:** 0x00–0xC8 arası tüm SAE J1979 PID'leri: ad (TR/EN), birim, min/max,
  bayt sayısı, decoder fonksiyonu, kategori (motor, yakıt, hava, emisyon, elektrik, sıcaklık, durum).
- **Desteklenen PID keşfi:** `0100, 0120, 0140, 0160, 0180, 01A0, 01C0` bitmask zinciri; ECU başına.
- **Çok çerçeve (ISO-TP):** `ATH1` ile gelen CAN çerçeveleri (ilk çerçeve `10 xx`, devam `21, 22…`) birleştirilir.
- **DTC çözümleme:** 2 bayt → `P0301` biçimi; Mode 03/07/0A; ECU başına gruplanır.
- **VIN:** Mode 09 PID 02 çok çerçeve → 17 karakter; WMI'dan üretici/ülke, 10. karakterden model yılı.
- **Readiness:** PID 01 → MIL durumu, DTC sayısı, kıvılcım/dizel monitörleri, tamamlandı/tamamlanmadı.
- **Freeze frame:** Mode 02 + PID + çerçeve no.

### 3.5 Yoklama zamanlayıcı (PollScheduler)
- PID'ler 3 öncelik katmanına ayrılır: **hızlı** (RPM, hız, gaz, yük), **orta** (MAF, MAP, yakıt trim),
  **yavaş** (sıcaklıklar, yakıt seviyesi, voltaj).
- Ağırlıklı round-robin: hızlı katman her turda, orta 3 turda bir, yavaş 10 turda bir.
- Ekranda görünen + kayıtta seçilen PID'lerin birleşimi yoklanır (görünmeyen sekme yoklamaz).
- Gerçek ölçülen örnekleme hızı UI'da gösterilir (Hz).

### 3.6 Kayıt motoru
- Her örnek: `{t: ms (oturum başlangıcına göre), pid, value (SI birim), raw?: hex}`.
- 1 saniyelik partiler halinde IndexedDB'ye yazılır (performans).
- Oturum başlarken ve bitince **anlık görüntü**: VIN, protokol, DTC'ler, readiness, desteklenen PID'ler.
- **İşaretler (marker):** Kullanıcı kayıt sırasında "📍 İşaretle" + isteğe bağlı not ("burada titreme oldu").
  AI analizinde altın değerinde bağlam.
- Sekme yenilenirse: açılışta "Yarım kalan kayıt bulundu → İndir / Sil" uyarısı.
- Kayıtlar indirildikten sonra kullanıcı silebilir; ayarlardan "her şeyi sil" mevcut.

---

## 4. Ürün / UX Tasarımı

### 4.1 Bilgi mimarisi
Mobilde alt sekme çubuğu (başparmak erişimi), masaüstünde sol kenar çubuğu.

| Sekme | JP alt başlık | İçerik |
|---|---|---|
| **Gösterge** | 計器 keiki | Ensō göstergeler (RPM, hız, soğutma, yük…), özelleştirilebilir ızgara |
| **Canlı Veri** | 数値 sūchi | Desteklenen tüm PID'ler; kategori filtresi, arama, sabitle, satıra dokun → grafik |
| **Arıza** | 故障 koshō | Kayıtlı / bekleyen / kalıcı kodlar, açıklama, ciddiyet, freeze frame, güvenli silme |
| **Kayıt** | 記録 kiroku | Kayıt sihirbazı, canlı kayıt, geçmiş oturumlar, dışa aktarım |
| **Araç** (Daha fazla altında mobilde) | 車両 sharyō | VIN, üretici, model yılı, protokol, ECU'lar, readiness (muayene hazırlığı), adaptör bilgisi |
| **Ayarlar** | 設定 settei | Dil, birimler, tema, adaptör, gizlilik, hakkında |

Üst çubukta **her zaman**: bağlantı durumu "hanko" mührü (kırmızı mühür = bağlı) + adaptör adı + akü voltajı.
Tıklayınca bağlantı paneli açılır.

### 4.2 Bağlantı akışı (ilk kullanım)
1. **Uyumluluk kontrolü** (sessiz): Web Bluetooth / Web Serial var mı?
   - iOS → "iPhone'da Safari Bluetooth'a izin vermiyor. **Bluefy** ile açın" + uygulama mağazası bağlantısı + "Demo modunu dene".
   - Firefox/Safari masaüstü → "Chrome veya Edge ile açın".
2. **3 adımlı hazırlık kartı:** Adaptörü tak (direksiyon altı) → Kontağı aç (motor çalışabilir) → Bağlan.
3. **Bağlan** → tarayıcı cihaz seçici → bağlanıyor animasyonu (ensō fırça halkası çizilir) →
   adımlar canlı gösterilir: *Adaptör bulundu → ELM327 v1.5 → Protokol aranıyor → ISO 15765-4 CAN → Araç yanıt verdi*.
4. Başarı → hafif sakura yaprağı animasyonu (hareket azaltma tercihine saygı) → Gösterge'ye geçiş.
5. Hata → insan diliyle sebep + çözüm önerisi (kontak kapalı, yanlış adaptör tipi, başka uygulama bağlı…).

Bağlı değilken tüm sekmeler gezilebilir; veri alanlarında "Bağlan" çağrısı + "Demo" seçeneği.

### 4.3 Kayıt akışı (UX + veri faydası için tasarlandı)
**Adım 1 — Ne kaydedilecek?** Hazır şablonlar (PID'leri otomatik seçer, düzenlenebilir):
- 🚗 **Genel sürüş** — RPM, hız, yük, gaz, soğutma, emme havası, MAF, yakıt trimleri, voltaj
- ⚡ **Performans** — RPM, hız, gaz, yük, MAP, ateşleme avansı (yüksek örnekleme)
- ⛽ **Yakıt / tüketim** — hız, MAF, yakıt seviyesi, trimler, lambda
- 🩺 **Motor sağlığı** — trimler, O2 sensörleri, soğutma, ateşleme avansı, katalizör sıcaklığı
- ✏️ **Özel** — kullanıcı seçer

**Adım 2 — Ne kadar?** "Ben durdurana kadar" (varsayılan) · süre (1/5/15/30 dk) · uzunluğa değil
**seçilen PID sayısına göre tahmini örnekleme hızı** gösterilir ("~1.4 Hz/PID").

**Adım 3 — Kayıt ekranı:** büyük süre sayacı, örnek sayısı, canlı Hz, mini grafikler,
büyük **📍 İşaretle** ve **■ Durdur** düğmeleri. Ekran kapanmasın (Screen Wake Lock).

**Adım 4 — Özet:** süre, örnek sayısı, min/maks/ortalama tablosu, işaretler →
**Dışa aktar:** PDF rapor · AI paketi (ZIP) · CSV.

İleri sürüm: tetikleyiciler (RPM > X olunca başla), 0-100 ölçümü, zamanlanmış başlatma.

### 4.4 Arıza (DTC) akışı
- Kod kartı: `P0301` · "1. silindirde tekleme tespit edildi" · sistem (Güç aktarma) · tür (Kayıtlı/Bekleyen/Kalıcı) · ECU.
- Kodu sil: **iki aşamalı onay** + uyarı ("Kodlar ve readiness monitörleri sıfırlanır; muayeneden hemen önce silmeyin. Motor çalışmıyor, kontak açık olmalı").
- Açıklama veritabanı: genel (SAE) P0xxx, P2xxx, P3xxx(kısmen), U0xxx, C0xxx, B0xxx kodları TR+EN.
  Üreticiye özel kodlar (P1xxx) "üreticiye özel" olarak işaretlenir.

### 4.5 Görsel dil — Japon minimalizmi
**İlke:** *Ma* (間, boşluk), *Kanso* (簡素, sadelik), *Shibui* (渋い, ölçülü güzellik). Süs işleve hizmet eder.

**Renk token'ları:**

| Token | Açık (washi) | Koyu (yoru 夜) | Kullanım |
|---|---|---|---|
| `--bg` | `#F6F1E7` washi kâğıdı | `#121417` gece | Zemin |
| `--surface` | `#FBF8F2` | `#1A1D21` | Kart |
| `--ink` | `#1E1C1A` sumi | `#ECE6DA` | Ana metin |
| `--ink-muted` | `#6B655C` | `#9A9387` | İkincil metin |
| `--line` | `#E4DCCD` | `#2A2E33` | Ayraç |
| `--sakura` | `#E7A3B5` | `#E59AAE` | Vurgu, seçili durum |
| `--sakura-deep` | `#C76A84` | `#F0B3C3` | Etkileşim |
| `--beni` 紅 | `#B8342F` | `#E0574F` | Hata, hanko mühür, uyarı |
| `--matcha` 抹茶 | `#6E7F3B` | `#9DB35A` | Başarılı / normal aralık |
| `--kin` 金 | `#B08D3C` | `#D2AE5A` | Uyarı (sarı yerine) |
| `--ai` 藍 indigo | `#2D4A63` | `#7FA6C6` | Bilgi, grafik ana çizgi |

**Tipografi:** Başlıklar Shippori Mincho (serif, fırça hissi) · gövde Zen Kaku Gothic New ·
sayılar JetBrains Mono, sabit genişlikli rakamlar (değerler titreşmesin).

**Motifler:**
- **Ensō (円相) gösterge:** fırça halkası şeklinde dairesel gösterge; ölçek dolarken mürekkep kalınlaşır.
- **Hanko (判子):** bağlantı durum mührü, rapor PDF'inde imza mührü.
- **Seigaiha (青海波):** çok soluk dalga deseni, boş durum ekranlarında.
- **Sakura:** seçili sekme göstergesi yaprak, başarı animasyonu, boş durum illüstrasyonu.
- Japonca karakterler yalnızca **ikincil süs** (sekme alt yazısı); anlam her zaman TR/EN metinde.

**UX kuralları:** min 44px dokunma hedefi · WCAG AA kontrast · `prefers-reduced-motion` ·
klavye ile tam gezinme · kritik eylemler başparmak bölgesinde · durum renkle **ve** metin/ikonla anlatılır.

---

## 5. Dışa Aktarım Formatları

### 5.1 İnsan için — PDF rapor
1. Kapak: araç (VIN, üretici, yıl), tarih, hanko mühür, uygulama sürümü.
2. **Özet karnesi:** MIL durumu, DTC sayısı, readiness (muayeneye hazır mı?), akü voltajı.
3. Arıza kodları: kod, açıklama, tür, ECU, freeze frame değerleri, sade dille "ne anlama gelir".
4. Kayıt varsa: her PID için grafik + min/maks/ortalama/p95 + normal aralık karşılaştırması.
5. İşaretler ve kullanıcı notları zaman çizelgesi.
6. Ek: desteklenen PID listesi, protokol, adaptör bilgisi. Sözlük (MAF, STFT, LTFT…).

### 5.2 Yapay zekâ için — "AI paketi" (`shindan-<vin>-<tarih>.zip`)
- `README.md`: Paketin ne olduğunu ve alanların anlamını bir LLM'e anlatan açıklama.
- `summary.md`: İnsan + AI için okunabilir Markdown özet (tablolar, istatistikler, DTC'ler, işaretler).
- `session.json` — **şema `shindan.session/v1`:**
  ```jsonc
  {
    "schema": "shindan.session/v1",
    "generatedAt": "2026-10-12T19:31:00Z",
    "app": { "name": "Shindan", "version": "1.0.0" },
    "units": "SI",                       // değerler daima SI; görüntü birimi ayrıca belirtilir
    "vehicle": { "vin": "...", "make": "...", "modelYear": 2018, "protocol": "ISO 15765-4 CAN (11 bit, 500 kbaud)", "ecus": ["7E8","7E9"] },
    "adapter": { "transport": "ble", "name": "OBDII", "elmVersion": "ELM327 v1.5", "voltage": 12.6 },
    "snapshot": {
      "mil": true, "dtcCount": 2,
      "dtcs": [{ "code": "P0301", "type": "stored", "ecu": "7E8", "description": "...", "system": "powertrain" }],
      "readiness": [{ "monitor": "catalyst", "supported": true, "complete": false }],
      "freezeFrame": { "dtc": "P0301", "values": { "rpm": 812, "coolantTemp": 88 } }
    },
    "signals": [
      { "id": "rpm", "mode": "01", "pid": "0C", "name": "Engine speed", "unit": "rpm",
        "min": 0, "max": 16383.75, "formula": "(256*A+B)/4",
        "stats": { "count": 1820, "min": 780, "max": 4120, "mean": 1893.2, "p05": 790, "p95": 3550, "std": 612.1 } }
    ],
    "samples": {                          // sütunsal: dosya küçük, AI/pandas için kolay
      "format": "columnar",
      "t_ms": [0, 105, 212],
      "rpm": [812, 815, null]             // null = o anda örneklenmedi
    },
    "markers": [{ "t_ms": 64200, "note": "Rölantide titreme" }],
    "rawLog": [ { "t_ms": 0, "tx": "010C", "rx": "7E804410C0CB4" } ]  // isteğe bağlı
  }
  ```
- `samples.csv`: `t_ms, iso_time, rpm, speed_kmh, ...` sütun başlıklarında birim, tek satır = tek zaman dilimi
  (sütunsal veri ileri doldurma **yapılmadan**; boş hücre = örnek yok).

Ayrıca her biri tek tek de indirilebilir. Tüm üretim istemci tarafında yapılır.

---

## 6. Gizlilik ve Güvenlik
- Araç verisi (VIN dahil) **asla** cihazdan çıkmaz. Analitik yalnızca sayfa görüntüleme + anonim olaylar
  (`connect_success{transport, elmVersion, protocol}`, `connect_fail{reason}`) — VIN/konum yok.
- Hata takibi (Sentry vb.) **varsayılan kapalı**, ayarlardan açılabilir; açılırsa PII temizleme.
- CSP başlıkları `vercel.json` içinde.
- DTC silme = araç üzerinde yazma eylemi → çift onay, motor çalışıyorsa uyarı (RPM > 0).

---

## 7. Test Stratejisi
| Seviye | Araç | Kapsam |
|---|---|---|
| Birim | Vitest | Tüm PID decoder'ları (spesifikasyon örnekleriyle), DTC çözücü, ISO-TP birleştirme, VIN, readiness, birim dönüşümü, ELM yanıt ayrıştırıcı |
| Entegrasyon | Vitest + SimTransport | Bağlan → init → keşif → yoklama → kayıt → dışa aktarım uçtan uca, hata senaryoları (NO DATA, kopma, sahte klon) |
| Bileşen | Testing Library | Bağlantı akışı, DTC silme onayı, kayıt sihirbazı |
| E2E | Playwright (Chromium) | Demo moduyla tüm sekmeler, mobil + masaüstü görünüm, ekran görüntüleri |
| Fiziksel | Kullanıcı + gerçek araç | Faz 7 kontrol listesi |

Her faz sonunda: `lint` + `typecheck` + `test` + `build` + E2E temiz → `main`'e birleştir.

---

## 8. Yol Haritası (fazlar)

| Faz | Kapsam | Çıktı / Kabul kriteri |
|---|---|---|
| **0** | Plan + proje iskeleti, araçlar, Vercel yapılandırması | Bu belge; `npm run build` temiz |
| **1** | **UI/UX + tasarım sistemi** (kullanıcı önceliği). Tüm ekranlar, demo verisiyle çalışan sahte durum, i18n TR/EN, birimler, koyu/açık tema, uyumluluk/iOS ekranı, mobil + masaüstü | Tüm sekmeler gezilebilir, Playwright ekran görüntüleri, erişilebilirlik kontrolü |
| **2** | Transport (BLE, Serial, Sim) + ELM327 sürücüsü + bağlantı durum makinesi | SimTransport ile init/protokol tespiti testleri geçer; UI gerçek bağlantı akışına bağlı |
| **3** | Protokol: tüm Mode 01 PID'leri, keşif, DTC (03/07/0A/04), freeze frame (02), VIN/CALID (09), readiness, DTC açıklama veritabanı | Decoder birim testleri; Demo modunda tüm sekmeler gerçek protokol yolundan beslenir |
| **4** | Yoklama zamanlayıcı + kayıt motoru + IndexedDB tamponu + işaretler + kurtarma | Kayıt → sayfa yenile → kurtar testi |
| **5** | Dışa aktarım: PDF rapor, AI paketi (JSON/MD/CSV ZIP) | Şema doğrulama testi, örnek çıktılar `docs/samples/` |
| **6** | PWA (çevrimdışı), analitik, CSP, performans, son cilalar, E2E kapsamı | Lighthouse PWA ✓, çevrimdışı açılış |
| **7** | **Fiziksel test** (kullanıcıyla): adaptör tipi tespiti, gerçek araçta kontrol listesi, sorun giderme | Kullanıcı onayı |

### Genişleme yolları (mimari hazır)
- Üreticiye özel PID profilleri (VAG, Toyota, Renault…) → `protocol/profiles/*` eklentileri + özel başlık (`ATSH`).
- Kullanıcı tanımlı PID (mode, PID, header, formül) ve paylaşılabilir profil dosyası.
- OBDLink STN sürücüsü (çok daha hızlı yoklama).
- Tetikleyicili kayıt, 0-100 / 100-0 ölçümü, yakıt tüketimi hesaplayıcı.
- JSON oturumu uygulamaya geri yükleyip yeniden inceleme.
- Capacitor ile native iOS/Android paket (iPhone sorununu kökten çözer).
- Opsiyonel hesap + bulut senkron (şu an kapsam dışı).

---

## 9. İsim
Öneri: **Shindan 診断** ("teşhis"). Alternatifler: *Kuruma* (車, araba), *Hana OBD*, *Sumi Scan*.
İlk yayın `shindan.vercel.app` (müsaitse) ya da proje adıyla; alan adı sonra bağlanır.

---

## 10. Faz Günlüğü
- **Faz 0** ✅ Plan yazıldı. Vite + React + TS + Tailwind iskeleti, ESLint, Vitest, Playwright ve `vercel.json` kuruldu.
- **Faz 1** ✅ UI/UX ve tasarım sistemi tamamlandı:
  - Token tabanlı Japon teması (washi/yoru), ensō gösterge, hanko mühür, sakura animasyonu, seigaiha.
  - Gösterge, Canlı Veri (görünür satırları yoklama, sabitleme, arama, kategori, uPlot detay), Arıza (tür grupları,
    donmuş kare, çift onaylı silme), Araç (VIN, muayene hazırlığı, adaptör), Kayıt (şablonlar, süre, işaret + not,
    özet, istatistik, grafik), Ayarlar (dil, tema, birimler, gizlilik, uyumluluk).
  - Bağlantı paneli: uyumluluk/iOS-Bluefy yönlendirmesi, adım adım bağlantı ilerlemesi, hata açıklamaları.
  - Demo modu: tutarlı sanal araç modeli + gerçek yoklama zamanlayıcısı ile.
  - Testler: birim (birimler, zamanlayıcı, araç modeli, DTC, istatistik, uyumluluk) + Playwright E2E (mobil + masaüstü).
  - Not: Japonca fontlar yalnızca Latin alt kümesiyle yüklenir; süs amaçlı kanjiler sistemin Japonca fontundan gelir
    (CSS 729 KB → 74 KB).
- **Faz 2** ✅ Taşıma + sürücü + bağlantı yöneticisi:
  - `BleTransport`: 5 GATT profili (FFF0, FFE0, 18F0, OBDLink, Nordic UART) + bilinmeyen adaptörler için genel
    notify/write keşfi, ad önekiyle filtreleme, "tüm cihazları göster" seçeneği, 20 baytlık parçalı yazma, GATT tekrar denemesi.
  - `SerialTransport`: Web Serial; Classic Bluetooth SPP (RFCOMM) ve USB/COM port.
  - `Elm327`: komut kuyruğu, parçalı çıktıyı '>' istemine kadar birleştirme, echo/SEARCHING temizleme,
    durum kelimelerini tipli hatalara çevirme, zaman aşımı sonrası geç yanıtı atma.
  - Çerçeve ayrıştırıcı: CAN 11/29 bit + ISO-TP çok çerçeve birleştirme, eski protokoller (J1850/ISO9141/KWP).
  - `RealBackend`: ATZ → ATE0/L0/S1/H1/AT1/SP0 → protokol arama → desteklenen PID keşfi (ECU başına) →
    öncelikli yoklama döngüsü, ölçülen hız, ardışık hata takibi, ham trafik kaydı.
  - `SimTransport` + `Elm327Emulator`: gerçek adaptör gibi metin üreten sanal ELM327 (echo, başlıklar, çok çerçeve,
    BLE parçalanması, gecikme). Tüm katmanlar bununla uçtan uca test edilir.

