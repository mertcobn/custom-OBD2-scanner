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

## Neden HTTPS şart?
Web Bluetooth ve Web Serial yalnızca güvenli bağlamda (HTTPS veya `localhost`) çalışır. Vercel HTTPS'i otomatik sağlar.

## Güvenlik başlıkları
`vercel.json` şunları ekler: sıkı Content-Security-Policy (satır içi script yok), `Permissions-Policy`
(Bluetooth ve Serial yalnızca kendi alanımızda; kamera/mikrofon/konum kapalı), `X-Frame-Options: DENY`,
`nosniff`. CSP'nin uygulamayı bozmadığı E2E testiyle doğrulanır (`e2e/quality.spec.ts`).

## Güncellemeler ve çevrimdışı
Uygulama bir PWA'dır: ilk ziyaretten sonra çevrimdışı açılır, "Ana ekrana ekle" ile kurulabilir.
Yeni sürüm yayınlandığında kullanıcıya "Yeni sürüm hazır · Güncelle" sorulur. Kayıt sürerken bu soru gösterilmez.
