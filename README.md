# AjanGrid

Yönetici ve alt ajanlardan oluşan ajan ekiplerini kurup çalıştırmak için bir masaüstü uygulaması (Windows / macOS). Her ajan farklı bir motorla çalışabilir:

- **CLI · abonelik**: Bilgisayarında kurulu Claude Code, Codex CLI, Gemini CLI ya da şablonla tanımlanan herhangi bir CLI. Ücretli aboneliğinin limitlerini kullanır.
- **API · kullandıkça öde**: Anthropic, OpenAI, Google ve OpenRouter.
- **Yerel araç / model**: Seslendirme modeli, ffmpeg, Hyperframes gibi komut şablonuyla çalışan programlar.

## Durum: 0.2

| Özellik                                                                             | Durum |
| ----------------------------------------------------------------------------------- | ----- |
| Ekipler, ajan oluşturma/düzenleme (rol, motor, model, efor, klasör, izinler)        | ✅    |
| CLI ajanlarını headless çalıştırma, canlı çıktı                                     | ✅    |
| API ajanları (yanıt `outputs/` klasörüne kaydedilir)                                | ✅    |
| Yerel araç ajanları (komut şablonu)                                                 | ✅    |
| Otonom yönetici döngüsü: planla → dağıt (sıralı / paralel) → denetle → bitir        | ✅    |
| Onay noktaları ve yöneticinin kullanıcıya soru sorması                              | ✅    |
| Limit algılama ve limit dolunca API yedeği, bekle-tekrar dene ya da sor             | ✅    |
| API token/maliyet takibi, sağlayıcı başına günlük harcama tavanı                    | ✅    |
| "Blog → Video" ekip şablonu                                                         | ✅    |
| Terminal ızgarası, Komuta Merkezi, çalışma klasörü görünümü, aydınlık/karanlık tema | ✅    |

## Yönetici döngüsü

Yöneticiye bir hedef verildiğinde her turda şu adımlar işler:

1. **Yöneticiye sorulur.** Yönetici normal bir ajan gibi kendi motoruyla çalıştırılır. Komut isteminde hedef, ekip kartları (ad, unvan, motor), çalışma klasöründeki dosyalar ve o ana kadarki tüm adımlar ile çıktıları yer alır.
2. **Yanıt bir eylem içerir.** Yönetici yanıtını tek bir json bloğuyla bitirir: `assign`, `assign_parallel`, `ask_user` ya da `finish`.
3. **Görevler çalıştırılır.** AjanGrid görevleri ilgili ajanlarda çalıştırır, bitmelerini bekler ve çıktılarının son kısmını geçmişe ekler.
4. **Onay noktaları uygulanır.** Onay noktası olarak işaretlenen ajanlara giden görevler çalıştırılmadan önce senin onayına sunulur. Bu kontrol yöneticiye bırakılmaz, sistem tarafından yapılır.
5. **Limit durumunda akış durur.** Bir ajan limitine takılırsa ve yedek ayarı yoksa, nasıl devam edileceği sana sorulur.

Güvenlik sınırları:

- Bir hedefte en fazla N yönetici adımı çalışır (varsayılan 30, Motorlar ekranından değiştirilebilir).
- Yönetici üst üste 3 kez geçerli bir eylem bloğu döndürmezse döngü durur.
- Her döngü `<klasör>/.ajangrid/yonetici/<id>.json` dosyasına kaydedilir ve uygulama yeniden açılınca geçmiş olarak görünür.

## Limitler hakkında

CLI'lar abonelik limitlerinin yüzdesini dışarıya güvenilir şekilde vermiyor. Bu yüzden AjanGrid iki şey yapar:

- **Sayım:** AjanGrid üzerinden yapılan çalışmaları sayar (son 5 saat ve bugün).
- **Algılama:** CLI çıktısındaki "usage limit", "rate limit" ve benzeri mesajları yakalar.

Limit algılandığında ajanın ayarına göre üç seçenek vardır: aynı rol ve görevle API yedeğine geçmek, belirli bir süre bekleyip tekrar denemek ya da sana sormak.

## Kurulum (çift tıkla)

[Releases](../../releases) sayfasından işletim sistemine uygun dosyayı indir:

| Sistem                              | Dosya                      |
| ----------------------------------- | -------------------------- |
| macOS · Apple Silicon (M1/M2/M3/M4) | `ajangrid-x.y.z-arm64.dmg` |
| macOS · Intel                       | `ajangrid-x.y.z-x64.dmg`   |
| Windows                             | `ajangrid-x.y.z-setup.exe` |

Uygulama imzasız olduğu için ilk açılışta işletim sistemi uyarı verir:

- **macOS:** DMG'yi açıp AjanGrid'i Applications klasörüne sürükle. "Hasarlı" ya da "açılamıyor" uyarısı çıkarsa Terminal'de bir kez şunu çalıştır:
  `xattr -cr /Applications/AjanGrid.app`
- **Windows:** SmartScreen uyarısında "Ek bilgi" → "Yine de çalıştır" seç.

Yeni sürüm yayınlamak için bir etiket push etmen yeterli. Örneğin `git tag v0.2.1 && git push --tags` komutundan sonra GitHub Actions macOS ve Windows kurulum dosyalarını üretip Releases sayfasına ekler.

## Nasıl çalışır

Bir ajana görev verildiğinde AjanGrid, ajanın motoruna göre bir komut oluşturur ve ajanın çalışma klasöründe çalıştırır. Görev metni programa **stdin** üzerinden verilir. Böylece uzun ya da özel karakterli metinler tırnaklama sorununa takılmaz (Windows dahil).

| CLI         | Çalıştırılan komut (özet)                                                                                            |
| ----------- | -------------------------------------------------------------------------------------------------------------------- |
| Claude Code | `claude -p --output-format text --append-system-prompt-file <rol> --model <m> --effort <e> --permission-mode <izin>` |
| Codex CLI   | `codex exec --skip-git-repo-check -C <klasör> -m <m> -c model_reasoning_effort=<e> [--full-auto \| -s read-only] -`  |
| Gemini CLI  | `gemini -m <m> [--yolo] -p "…"` (rol + görev stdin'den)                                                              |
| Özel CLI    | Senin şablonun: `{model}`, `{effort}`, `{workdir}` yer tutucularıyla                                                 |

İzinlerin karşılıkları:

- **Claude Code:** Yazma + komut açıksa `bypassPermissions`, yalnızca yazma açıksa `acceptEdits`, ikisi de kapalıysa `default`. İnternet izni kapalıysa WebFetch ve WebSearch araçları kapatılır.
- **Codex:** Yazma ya da komut izni açıksa `--full-auto`, kapalıysa `-s read-only`.
- **Gemini:** Yazma ya da komut izni açıksa `--yolo`.

Her çalışma `<klasör>/.ajangrid/runs/` altına log olarak yazılır. API yanıtları `<klasör>/outputs/` altına `.md` olarak kaydedilir. Böylece bir ajanın çıktısını diğer ajan dosyadan okuyabilir.

> Komut bayrakları CLI sürümlerine göre değişebilir. Bir ajan hata verirse Ajanlar ekranındaki "Çalıştırılacak komut" önizlemesini kendi CLI'ının `--help` çıktısıyla karşılaştır. Ayarlar `src/main/engines/cli.ts` dosyasında.

## Veriler nerede

| İçerik                    | Konum                      |
| ------------------------- | -------------------------- |
| Ekipler, ajanlar, araçlar | `<userData>/ajangrid.json` |
| API anahtarları           | `<userData>/secrets.json`  |

API anahtarları Electron `safeStorage` ile şifrelenir (macOS Keychain, Windows DPAPI) ve arayüze geri gönderilmez.

## Geliştirme

Node 20+ gerekir. Native modül yoktur, ek derleme araçlarına gerek yok.

```bash
npm install
npm run dev          # geliştirme modu
npm run build:win    # Windows kurulum dosyası (dist/)
npm run build:mac    # macOS dmg (dist/)
```

macOS'ta Finder'dan açılan uygulamalar kabuk PATH'ini görmez. AjanGrid açılışta giriş kabuğundan PATH'i okur. Bu sayede Homebrew veya npm ile global kurulan CLI'lar da bulunur.

## Mimari

```
src/main/
  index.ts          pencere + IPC
  store.ts          ekipler/ajanlar/araçlar (JSON)
  secrets.ts        şifreli API anahtarları
  runner.ts         çalışma yöneticisi: süreç başlatma, canlı çıktı, durdurma, log
  shellEnv.ts       PATH, which/where, tırnaklama
  engines/cli.ts    CLI başına headless komut planı
  engines/api.ts    sağlayıcı istekleri
  engines/detect.ts kurulu CLI'ları bulma
src/renderer/src/
  views/            Komuta Merkezi, Terminal Izgarası, Ajanlar, Motorlar
  components/       kenar çubuğu, xterm tabanlı ajan terminali
```
