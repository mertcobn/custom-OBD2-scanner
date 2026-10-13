# Vercel'de yayınlama

Uygulama tamamen statik bir SPA'dır (sunucu kodu yok). Vercel ayarları `vercel.json` içinde hazır.

## İlk kurulum (bir kez)
1. https://vercel.com → **Add New… → Project** → GitHub'dan `mertcobn/custom-OBD2-scanner` deposunu seç.
2. **Framework Preset:** Vite (otomatik algılanır). Build: `npm run build`, Output: `dist` (zaten `vercel.json`'da).
3. **Production Branch:** `main`. Deploy'a bas.
4. (Önerilen) Proje → **Analytics → Web Analytics → Enable**. Çerezsiz sayfa görüntüleme sayımı.
   Uygulama analitiği yalnızca production ortamında ve kullanıcı Ayarlar'dan kapatmadıysa yükler.
5. (İsteğe bağlı) **Settings → Domains** ile kendi alan adını bağla (ör. `shindan.app`).

Sonrasında `main`'e her birleştirme otomatik yayınlanır; her dal için önizleme (preview) adresi oluşur.

## Hata raporları (isteğe bağlı, Sentry)
Gerçek kullanıcılarda oluşan hataları görmek için. Kurulmazsa ayar hiç görünmez ve hiçbir şey gönderilmez.
1. https://sentry.io → ücretsiz hesap → **Create Project → Browser JavaScript / React**.
2. Projenin **DSN** değerini kopyala (`https://…@o….ingest.sentry.io/…`).
3. Vercel → Proje → **Settings → Environment Variables** → `VITE_SENTRY_DSN` = DSN (Production) → yeniden deploy.
4. Uygulamada **Ayarlar → Gizlilik → Hata raporlarını gönder** görünür. Varsayılan **kapalı**; yalnızca açan kullanıcılardan rapor gelir.

Gönderimden önce: şasi numarası (VIN) `[VIN]` ile değiştirilir, URL sorgu parametreleri, kullanıcı/IP, çerez ve
başlıklar ile konsol kayıtları silinir. Araç değerleri gönderilmez. Sentry kodu (~450 KB) yalnızca açan kullanıcıya
indirilir ve çevrimdışı önbelleğe alınmaz. Production sourcemap'leri sayesinde Sentry'deki yığın izleri gerçek kaynak satırlarını gösterir.

## Neden HTTPS şart?
Web Bluetooth ve Web Serial yalnızca güvenli bağlamda (HTTPS veya `localhost`) çalışır. Vercel HTTPS'i otomatik sağlar.

## Güvenlik başlıkları
`vercel.json` şunları ekler: sıkı Content-Security-Policy (satır içi script yok; dışarıya yalnızca `*.sentry.io` bağlantısına izin), `Permissions-Policy`
(Bluetooth ve Serial yalnızca kendi alanımızda; kamera/mikrofon/konum kapalı), `X-Frame-Options: DENY`,
`nosniff`. CSP'nin uygulamayı bozmadığı E2E testiyle doğrulanır (`e2e/quality.spec.ts`).

## Güncellemeler ve çevrimdışı
Uygulama bir PWA'dır: ilk ziyaretten sonra çevrimdışı açılır, "Ana ekrana ekle" ile kurulabilir.
Yeni sürüm yayınlandığında kullanıcıya "Yeni sürüm hazır · Güncelle" sorulur. Kayıt sürerken bu soru gösterilmez.
