# Shindan 診断 — Web OBD2 scanner

Tarayıcıdan Bluetooth ile ELM327 uyumlu OBD2 adaptörüne bağlanan, canlı veri okuyan,
arıza kodlarını gösteren/silen, sürüş kaydedip PDF ve yapay zekâya hazır veri paketi
olarak dışa aktaran web uygulaması. Hesap ve sunucu yoktur; veriler cihazda kalır.

- Ürün ve teknik plan: [`docs/PLAN.md`](docs/PLAN.md)
- Vercel kurulumu: [`docs/DEPLOY.md`](docs/DEPLOY.md)
- Gerçek araçla test listesi: [`docs/PHYSICAL_TEST.md`](docs/PHYSICAL_TEST.md)
- Örnek çıktılar: [`docs/samples/`](docs/samples)
- Desteklenen tarayıcılar: Chrome / Edge / Opera / Samsung Internet (Android, Windows, macOS, Linux).
  iPhone/iPad'de Bluetooth için **Bluefy** tarayıcısı gerekir. Demo modu her yerde çalışır.

## Geliştirme

```bash
npm install
npm run dev        # http://localhost:5173
npm run check      # lint + typecheck + unit tests + build
npm run e2e        # Playwright (mobil + masaüstü), demo moduyla tüm ekranlar
```

Vercel: framework "Vite", build `npm run build`, çıktı `dist` (bkz. `vercel.json`).
