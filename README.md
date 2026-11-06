# AjanGrid

Yönetici ve alt ajanlardan oluşan ajan ekiplerini kurup çalıştırmak için bir masaüstü uygulaması (Windows / macOS). Her ajan farklı bir motorla çalışabilir:

- **CLI · abonelik**: Bilgisayarında kurulu Claude Code, Codex CLI, Gemini CLI ya da şablonla tanımlanan herhangi bir CLI. Ücretli aboneliğinin limitlerini kullanır.
- **API · kullandıkça öde**: Anthropic, OpenAI, Google ve OpenRouter.
- **Yerel araç / model**: Seslendirme modeli, ffmpeg, Hyperframes gibi komut şablonuyla çalışan programlar.

## Durum: 0.1 (1. tur)

| Özellik                                                                      | Durum  |
| ---------------------------------------------------------------------------- | ------ |
| Ekipler, ajan oluşturma/düzenleme (rol, motor, model, efor, klasör, izinler) | ✅     |
| CLI ajanlarını headless çalıştırma, canlı çıktı                              | ✅     |
| API ajanları (yanıt `outputs/` klasörüne kaydedilir)                         | ✅     |
| Yerel araç ajanları (komut şablonu)                                          | ✅     |
| Terminal ızgarası, Komuta Merkezi, çalışma klasörü görünümü                  | ✅     |
| CLI'ları otomatik bulma, şifreli API anahtarı saklama                        | ✅     |
| Aydınlık / karanlık tema                                                     | ✅     |
| Otonom yönetici döngüsü (planla → dağıt → denetle → onay noktaları)          | 2. tur |
| Abonelik limit takibi, limit dolunca API yedeğine geçiş, maliyet             | 3. tur |

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
