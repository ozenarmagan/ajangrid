# AjanGrid Kullanım Kılavuzu

AjanGrid, birden fazla yapay zekâ ajanını tek bir **yönetici** üzerinden çalıştırman için tasarlandı. Sen yöneticiye bir hedef verirsin. Yönetici işi adımlara böler, her adımı en uygun ajana verir, çıktıları kontrol eder ve sonucu sana raporlar. Sen yalnızca gerektiğinde onay verir ya da düzeltme istersin.

Ajanlar farklı "motorlarla" çalışabilir:

- **CLI:** Bilgisayarında kurulu Claude Code, Codex, Antigravity gibi araçlar. Ücretli aboneliğinin limitlerini kullanır.
- **API:** Anthropic, OpenAI, Google ve OpenRouter. Kullandığın kadar ödersin.
- **Yerel araç:** Bilgisayarındaki bir program ya da model, örneğin seslendirme modeli ya da ffmpeg.

> Bu kılavuz uygulamanın içinde de var: sol menüde **Kullanım Kılavuzu**.

---

## 1. Temel kavramlar

**Ekip**
Birlikte çalışan ajanlar grubu. Her ekibin bir **çalışma klasörü** vardır. Ajanlar dosyaları bu klasörde okur ve yazar. Farklı işler için farklı ekipler kurabilirsin: "Blog → Video", "Lead Bulma", "Haftalık Rapor" gibi.

**Yönetici**
Ekibin şefi. Hedefini alır, plan yapar, görevleri alt ajanlara dağıtır ve çıktıları denetler. Bir çıktıyı yetersiz bulursa aynı ajana düzeltme gönderir. Bir ekipte yalnızca bir yönetici olabilir.

**Alt ajan**
Belirli bir işi yapan ajan: özetleyici, senarist, video yapımcısı, seslendirmen gibi. Her alt ajanın bir **rolü** (talimatları), bir **motoru**, bir **modeli** ve **izinleri** vardır.

**Hedef ve döngü**
Yöneticiye verdiğin göreve **hedef** denir. Yöneticinin bu hedef için yürüttüğü "planla → görev ver → kontrol et" sürecine **döngü** denir. Döngü bittiğinde yönetici bir **sonuç özeti** yazar.

**Motor**
Bir ajanın arkasında çalışan yapay zekâ:

| Motor                 | Ne zaman?                                            | Ücret                         |
| --------------------- | ---------------------------------------------------- | ----------------------------- |
| CLI · abonelik        | Dosya okuyup yazan, komut çalıştıran asıl işler için | Aboneliğinin limitinden düşer |
| API · kullandıkça öde | Kısa metin işleri ya da yedek olarak                 | Token başına ücretlendirilir  |
| Yerel araç / model    | Seslendirme, video birleştirme gibi program işleri   | Ücretsiz                      |

**Efor**
Modelin ne kadar "düşüneceği". Düşük efor hızlıdır ve limitten az harcar; yüksek efor daha dikkatli çalışır ama yavaştır. Yönetici için **yüksek**, basit işler için **düşük ya da orta** efor önerilir.

**İzinler**
Bir ajanın neler yapabileceği:

- **Dosya yazabilir:** Çalışma klasörüne dosya oluşturur ve değiştirir.
- **Komut çalıştırabilir:** Terminal komutları çalıştırır (ör. ffmpeg).
- **İnternete erişebilir:** Web sayfası okur ve arama yapar.

Ajanlar sana sormadan çalışır. Bu yüzden her ajana yalnızca gerçekten ihtiyaç duyduğu izni ver.

**Onay noktası**
Seçtiğin ajanlara görev gitmeden önce uygulama durur ve senin onayını ister. Örneğin "seslendirmeden önce senaryoyu görmek istiyorum" dersen Seslendirmen'i onay noktası yaparsın.

---

## 2. İlk kurulum

### 2.1 CLI araçlarını kur ve giriş yap

AjanGrid CLI araçlarını kendisi kurmaz, bilgisayarında kurulu olanları bulur. Kullanmak istediklerini Terminal'den kur ve her birinde **bir kez** giriş yap:

| Araç            | Kurulum                                                        | Giriş                                       |
| --------------- | -------------------------------------------------------------- | ------------------------------------------- |
| Claude Code     | `npm install -g @anthropic-ai/claude-code`                     | Terminal'de `claude` yaz, girişi tamamla    |
| Codex CLI       | `npm install -g @openai/codex`                                 | `codex login`                               |
| Antigravity CLI | `curl -fsSL https://antigravity.google/cli/install.sh \| bash` | Terminal'de `agy` yaz, Google ile giriş yap |

> **Gemini CLI:** Google, Gemini CLI'ı bireysel, Pro ve Ultra hesaplar için 18 Haziran 2026'da kapattı. "IneligibleTierError" hatası alırsan Antigravity CLI kullan.

Sonra AjanGrid'de **Motorlar ve Limitler** ekranını aç. Kurulu araçlar yeşil noktayla görünür. Görünmüyorsa **Bilgisayarı yeniden tara** düğmesine bas.

### 2.2 API anahtarları (isteğe bağlı)

API ajanları kullanacaksan ya da abonelik limiti dolunca API'ye geçilmesini istiyorsan:

1. **Motorlar ve Limitler → API anahtarları** bölümünde sağlayıcının yanındaki **Ekle** düğmesine bas.
2. Anahtarı yapıştır ve kaydet. Anahtar macOS Anahtar Zinciri ile şifrelenir ve ekranda bir daha gösterilmez.
3. Maliyet görmek istiyorsan **Fiyat $/1M** sütununa sağlayıcının güncel fiyatlarını yaz.
4. Harcamayı sınırlamak için **Günlük tavan $** gir. Tavana ulaşılınca o gün o sağlayıcıya istek gönderilmez.

### 2.3 Yerel araç tanımla (isteğe bağlı)

**Motorlar ve Limitler → Yerel araçlar → + Araç tanımla.** Bir ad ve bir komut şablonu yaz. Şablonda şu **yer tutucuları** kullanabilirsin:

| Yer tutucu      | Yerine gelen                              |
| --------------- | ----------------------------------------- |
| `{prompt}`      | Görev metni (tırnaklanmış)                |
| `{prompt_file}` | Görev metninin yazıldığı dosyanın yolu    |
| `{workdir}`     | Ekibin çalışma klasörü                    |
| `{out_dir}`     | Çıktı klasörü (`çalışma klasörü/outputs`) |

Örnek: Yazgı seslendirme aracı:

```
/Users/kullanici/Developer/blog-seslendirici/.venv/bin/python /Users/kullanici/Developer/blog-seslendirici/seslendir_cli.py --girdi {prompt_file} --klasor {workdir} --cikti {out_dir}/ses.wav --motor yazgi:male-01
```

### 2.4 Bildirimler ve Telegram (isteğe bağlı)

Bilgisayar başında değilken onay vermek için:

1. Telegram'da **@BotFather**'a `/newbot` yaz ve bota bir ad ver.
2. Verdiği anahtarı (`123456:ABC…` biçiminde) **Motorlar ve Limitler → Bildirimler ve Telegram** bölümüne yapıştır ve kaydet.
3. **Eşleştir** düğmesine bas. Ekranda çıkan `/start 123456` mesajını botuna gönder.
4. "Eşleşti" mesajını görürsen hazırsın. **Test mesajı gönder** ile kontrol edebilirsin.

Masaüstü bildirimlerini aynı bölümdeki kutucukla açıp kapatabilirsin.

---

## 3. İlk ekibini kur

Sol menüde **Ekipler** başlığının yanındaki **+** düğmesine bas. Üç yol var:

1. **Şablondan:** "Blog → Video" şablonu 6 ajanı rolleriyle birlikte hazır kurar: yönetici, özetleyici, senarist, video yapımcısı, seslendirmen ve montajcı.
2. **Boş ekip:** Yalnızca yönetici ile başlar. Yöneticiye hedefini yazdığında, ekipte uygun ajan yoksa **bir ekip önerir**. Sen onaylayınca ajanlar oluşturulur. En kolay yol budur.
3. **Dosyadan içe aktar:** Daha önce dışa aktarılmış bir ekip şablonunu (`.ajangrid.json`) yükler.

Her yolda ekibin çalışma klasörünü seçmen istenir. Bu klasör için boş ya da yalnızca bu işe ait bir klasör seç. Ajanlar bu klasörde dosya oluşturup değiştirecek.

---

## 4. Yöneticiye hedef vermek

**Komuta Merkezi**'nde alttaki kutuya hedefini yaz ve **Başlat**'a bas (ya da Ctrl/⌘+Enter).

### İyi bir hedef nasıl yazılır?

- **Sonucu söyle:** "60 saniyelik dikey bir video istiyorum, sonunda web adresim yazsın."
- **Girdiyi belirt:** "Şu blog yazısından: https://…" ya da "kaynak/blog.md dosyasından."
- **Ölçütleri yaz:** Süre, ton, dil, dosya adı, biçim gibi.
- **Sınırları yaz:** "index.html'e dokunma", "müzik ekleme" gibi.

Örnek:

```
https://armaganozen.com/blog/... yazısını 60 saniyelik dikey (9:16) videoya çevir.
Ton samimi olsun, Türkçe seslendirme olsun, sonuna hngbilisim.com yazsın.
Final dosya outputs/final.mp4 olsun.
```

### Dosya ve bağlantı eklemek

Bir dosyayı ya da bağlantıyı hedef kutusuna **sürükleyip bırak**. Dosyalar ekip klasöründeki `kaynak/` altına kopyalanır ve hedef metnine eklenir. Böylece yönetici ve ajanlar o dosyayı görür.

### Onay iste

Hedef kutusunun altında ekibin ajanları düğme olarak listelenir. Bir ajanın düğmesine basarsan (sarı olur), o ajana görev gitmeden önce senin onayın istenir. Bu seçim ekip için kaydedilir.

---

## 5. Süreci izlemek

Komuta Merkezi iki bölümden oluşur: solda yönetici, sağda **Ekip** paneli.

### 5.1 Akış görünümü

Yöneticiyle olan konuşma burada görünür:

- **Senin hedefin:** Sağda gri balon.
- **Yöneticinin değerlendirmesi:** "Yönetici · saat" başlıklı kutu.
- **Görev kartları:** "→ Ajan adı" başlıklı kart. Kartta görevin kendisi ve ajanın çıktısının özeti bulunur. Durum sağ üstte yazar: Çalışıyor, Tamamlandı ya da Hata.
- **Sarı kartlar:** Senden yanıt bekleyen sorular (bkz. Bölüm 6).
- **Mor "Sonuç" kartı:** Yöneticinin bitiş özeti.

### 5.2 Kanban görünümü

Yönetici başlığındaki **Akış / Kanban** düğmesiyle geçersin. Görevler dört sütunda görünür:

| Sütun             | Anlamı                                                 |
| ----------------- | ------------------------------------------------------ |
| Onay bekliyor     | Senin onayını ya da yanıtını bekleyenler               |
| Çalışıyor         | Şu an yürüyen görevler ve yöneticinin planlaması       |
| Tamamlandı        | Bitmiş görevler                                        |
| Hata / durduruldu | Başarısız olan, durdurulan ya da limiti dolan görevler |

Üstteki **Gösterilen hedef** listesinden belirli bir hedefi ya da tümünü seçebilirsin. Bir karta tıklayınca o ajanın çıktısı sağ panelde açılır.

### 5.3 Ekip paneli (sağ taraf)

Her alt ajan için bir kart vardır. Kartta ajanın durumu, süresi, son görevi ve çıktısının son satırları görünür. Karta tıklayınca:

- Çıktının tamamı okunur biçimde açılır.
- **Ham terminal:** Ajanın gerçek terminal çıktısını gösterir.
- **Ayarlar:** Ajanı düzenleme ekranına götürür.
- **Durdur:** Çalışan görevi keser.

Sol menüde bir ajanın adına tıklamak da onun kartını açar.

### 5.4 Dosyalar

Ekip panelinin altındaki **Dosyalar** bölümü ekip klasörünü gösterir. Bir klasöre tıklayınca içine girersin. Bir dosyaya tıklayınca uygulama içinde **önizleme** açılır: metinler okunur, görseller gösterilir, video ve ses oynatılır. **Uygulamada aç** düğmesi dosyayı varsayılan programda açar.

---

## 6. Onaylar ve sorular

Yönetici bazı durumlarda durur ve sana sarı bir kart gösterir:

| Kart                   | Ne zaman?                                                  | Ne yaparsın?                                                                       |
| ---------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Onay noktası**       | Onay iste dediğin bir ajana görev gidecekken               | **Onayla, devam et** ya da kutuya düzeltme yazıp **Düzeltme iste**                 |
| **Ekip önerisi**       | Ekipte uygun ajan yokken yönetici yeni ajanlar önerdiğinde | Önerilen ajanları incele ve **Ekibi oluştur, devam et**. Değişiklik istiyorsan yaz |
| **Yöneticinin sorusu** | Yöneticinin karar veremediği bir nokta olduğunda           | Yanıtını yaz ve **Yanıtla**                                                        |
| **Limit doldu**        | Bir ajanın aboneliği dolduğunda                            | Ne yapılacağını yaz: "bekle", "X ajanını kullan", "bu adımı atla"                  |

Ekip önerisinde ⚠ işareti görürsen dikkat et. Örneğin "codex bu bilgisayarda bulunamadı" yazıyorsa o ajan çalışmaz. Onaylamadan önce düzeltme iste ya da sonradan ajanın motorunu değiştir.

Telegram eşleştirdiysen aynı sorular telefonuna da gelir. Düğmeyle onaylarsın, düzeltmeyi mesaj olarak yazarsın.

---

## 7. Ajanları düzenlemek

Sol menüde **Ajanlar**'a gir ya da bir ajan kartında **Ayarlar**'a bas.

| Alan                        | Açıklama                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Ajan adı**                | Yöneticinin görev verirken kullandığı ad. Kısa ve net olsun.                                                              |
| **Görev unvanı**            | Yöneticinin bu ajanı tanıdığı tek cümle: "Özetten 60 sn senaryo yazar". Yönetici görevleri buna bakarak dağıtır; net yaz. |
| **Rol ve talimatlar**       | Ajanın her görevde uyacağı kurallar: tarz, dosya adları, sınırlar.                                                        |
| **Bu ekibin yöneticisi**    | İşaretlersen bu ajan yönetici olur; önceki yönetici alt ajana döner.                                                      |
| **Motor**                   | CLI, API ya da yerel araç.                                                                                                |
| **CLI aracı / Sağlayıcı**   | Hangi CLI ya da hangi API.                                                                                                |
| **Model**                   | Claude için `opus`, `sonnet`, `haiku`. Diğer CLI'larda boş bırakırsan varsayılan model kullanılır.                        |
| **Çalışma klasörü**         | Boş bırakırsan ekibin klasörü kullanılır.                                                                                 |
| **Efor seviyesi**           | Düşük → Maks. Bazı CLI'lar en fazla "Yüksek"i destekler.                                                                  |
| **İzinler**                 | Dosya yazma, komut çalıştırma, internet.                                                                                  |
| **MCP sunucuları**          | Yalnızca Claude Code ajanlarında. Tanımlı dış araçları bu ajana bağlar.                                                   |
| **Abonelik limiti dolunca** | Hata olarak bitir, API yedeğine geç (sağlayıcı ve model seç), bekle ve tekrar dene, ya da sor.                            |

Sağdaki **Çalıştırılacak komut** kutusu, bu ajan için bilgisayarında tam olarak hangi komutun çalışacağını gösterir. Bir ajan hata verirse önce buraya bak.

**Test et** düğmesi ajana kısa bir bağlantı testi gönderir. Sonucu Komuta Merkezi'nin ekip panelinde görürsün.

---

## 8. Motorlar ve Limitler ekranı

- **CLI araçları:** Hangi araçların kurulu olduğunu ve sürümlerini gösterir. Her kartta AjanGrid üzerinden son 5 saatte ve bugün kaç çalışma yapıldığı ile son limit uyarısının saati yazar. CLI'lar abonelik yüzdesini dışarıya vermediği için bu bir sayımdır, kesin limit değildir.
- **API anahtarları:** Sağlayıcı başına bugünkü ve bu ayki kullanım, fiyat ve günlük tavan.
- **Bildirimler ve Telegram:** Bkz. Bölüm 2.4.
- **MCP sunucuları:** Ajanların n8n, Google Drive, veritabanı gibi dış araçlara erişmesi için. "Komut" türünde bir başlatma komutu ve gerekirse ortam değişkenleri (her satıra `ANAHTAR=değer`) girilir. "HTTP" türünde bir adres girilir. Tanımladıktan sonra Ajanlar ekranında istediğin Claude Code ajanına bağla.
- **Yönetici döngüsü:** Bir hedefte yöneticinin en fazla kaç adım atabileceği (varsayılan 30). Yöneticinin sonsuz döngüye girip aboneliğini tüketmesini önler.
- **Yerel araçlar:** Bkz. Bölüm 2.3.

---

## 9. Geri alma ve sürdürme

### Adımı geri al

Yönetici her görev turundan önce çalışma klasörünün bir **anlık görüntüsünü** alır. Bir ajan dosyaları bozduysa:

1. Döngü çalışmıyorken (bitmiş, durdurulmuş ya da yanıt bekliyorken) ilgili görev kartını bul.
2. **↶ Bu adımdan önceki hale dön** düğmesine bas ve onayla.
3. Klasör, o görev başlamadan önceki haline döner. Geri almadan önceki hal de ayrıca kaydedilir.

Anlık görüntüler klasördeki `.ajangrid/snap.git` içinde tutulur. Senin kendi git deposuna dokunulmaz. `node_modules`, `.venv` ve `.git` klasörleri anlık görüntüye girmez. Büyük video dosyaları ise her anlık görüntüde disk alanı kaplar.

### Kaldığı yerden devam et

Uygulama kapanırsa, döngüyü durdurursan ya da bir hata olursa döngünün altında **↻ Kaldığı yerden devam et** düğmesi çıkar. Yönetici o ana kadar yapılanları görerek devam eder. Yarıda kalan bir görevin dosyaları eksik olabilir; yönetici bunu kontrol eder.

### Bağlam koruma

Claude Code ajanları aynı hedef boyunca **önceki işlerini hatırlar**. Yönetici "4. sahneyi kısalt" dediğinde ajan baştan başlamaz. Bir adımı geri aldığında bu hafıza sıfırlanır.

---

## 10. Zamanlanmış hedefler

Tekrarlanan işler için (ör. her pazartesi 09:00'da haftalık rapor):

1. Hedef kutusuna hedefi yaz.
2. **Zamanla** düğmesine bas.
3. Günleri ve saati seç, sonra **Zamanla**'ya bas.

Zamanlanmış hedefler aynı panelde listelenir. Kutucukla geçici olarak kapatabilir, çöp kutusuyla silebilirsin. Zamanlanmış hedefler yalnızca **AjanGrid açıkken** çalışır. O saatte ekipte süren bir iş varsa o seferlik atlanır ve bildirim gelir.

---

## 11. Ekip yönetimi

Sol menüde fareyle bir ekibin üzerine gelince üç simge çıkar:

- **✏️ Yeniden adlandır**
- **⇩ Dışa aktar:** Ekibi, ajanları, kullandığı yerel araçları ve MCP sunucularını tek bir `.ajangrid.json` dosyasına kaydeder. Bu dosyayı başka bir bilgisayara ya da bir müşteriye verebilirsin. Şifre ve anahtar gibi gizli değerler dosyaya yazılmaz.
- **🗑 Sil:** Ekibi ve ajanlarını siler, süren işleri durdurur. Klasördeki dosyalara dokunmaz. Son kalan ekip silinemez.

İçe aktarmak için **Ekipler → + → Dosyadan içe aktar…** yolunu izle.

---

## 12. Güvenlik ve maliyet ipuçları

- **Klasör:** Ekip klasörü olarak önemli belgelerinin bulunduğu bir klasörü seçme. Ajanlar bu klasörde dosya yazıp silebilir.
- **İzinler:** "Dosya yazma + komut çalıştırma" birlikte açık olan bir ajan klasörde her şeyi yapabilir. Bu ikisini yalnızca gerçekten gereken ajanlarda aç.
- **Maliyet:** Yönetici için yüksek efor iyidir. Alt ajanlarda düşük ya da orta efor çoğu iş için yeterlidir ve limitini korur.
- **API harcaması:** Günlük tavan koy.
- **Onay noktası:** Uzun ve pahalı adımların (video render gibi) önüne koy. Yanlış bir senaryo için saatlerce render beklemezsin.

---

## 13. Sorun giderme

| Belirti                                   | Olası neden ve çözüm                                                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `"claude" bulunamadı`                     | CLI kurulu değil ya da uygulama göremiyor. Terminal'den kur, Motorlar ekranında **Bilgisayarı yeniden tara**'ya bas.     |
| `unexpected argument …`                   | CLI sürümün bir bayrağı tanımıyor. Ajanlar ekranındaki **Çalıştırılacak komut**'u ve hata satırını geliştiriciye gönder. |
| `IneligibleTierError: UNSUPPORTED_CLIENT` | Gemini CLI artık bireysel hesaplarda çalışmıyor. Ajanın CLI'ını **Antigravity CLI** yap.                                 |
| Ajan "web sayfasına erişemedim" diyor     | Ajanın **İnternete erişebilir** izni kapalı. Aç ve kaydet.                                                               |
| Ajan "dosya yazamadım" diyor              | **Dosya yazabilir** izni kapalı.                                                                                         |
| "Abonelik limiti doldu"                   | Limit yenilenene kadar bekle ya da ajanın **Abonelik limiti dolunca** ayarını "API yedeğine geç" yap.                    |
| Yönetici aynı şeyi tekrar tekrar yapıyor  | Hedef belirsiz olabilir. Döngüyü durdur, hedefi ölçütlerle yeniden yaz. Adım sınırı yöneticiyi zaten durdurur.           |
| Telegram mesajı gelmiyor                  | AjanGrid açık mı? Motorlar ekranında "eşleşti" yazıyor mu? **Test mesajı gönder**'i dene.                                |
| Önizleme açılmıyor                        | O dosya türü desteklenmiyor olabilir. **Uygulamada aç** düğmesini kullan.                                                |

Her çalışmanın tam kaydı, ekip klasöründeki `.ajangrid/runs/` altında `.log` dosyası olarak durur.

---

## 14. Sık sorulan sorular

**Alt ajanlara doğrudan görev verebilir miyim?**
AjanGrid yönetici merkezlidir: işleri yöneticiye verirsin. Bir ajanı tek başına denemek için Ajanlar ekranındaki **Test et** düğmesini kullan.

**Aynı anda birden fazla hedef çalıştırabilir miyim?**
Her ekipte aynı anda bir döngü çalışır. Farklı ekiplerde aynı anda farklı hedefler yürüyebilir.

**Ajanlar birbirinin çıktısını nasıl görüyor?**
Ortak çalışma klasörü üzerinden. Yönetici görev verirken hangi dosyanın okunup hangisine yazılacağını söyler. API ajanlarının yanıtları otomatik olarak `outputs/` klasörüne kaydedilir.

**Verilerim nerede?**
Ekipler, ajanlar ve ayarlar bilgisayarındaki uygulama veri klasöründe durur. API anahtarları ve Telegram anahtarı şifreli olarak saklanır. Ajanların ürettiği her şey ekip klasöründedir.

**Uygulama kapanınca iş durur mu?**
Evet. Süren işler durdurulur. Yeniden açınca **Kaldığı yerden devam et** ile sürdürebilirsin.

---

## 15. Sözlük

| Terim             | Anlamı                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| **CLI**           | Komut satırı aracı. Claude Code, Codex, Antigravity gibi.                                                     |
| **API**           | Bir yapay zekâ servisine internet üzerinden doğrudan erişim. Anahtar ile kullanılır, token başına ücretlidir. |
| **Token**         | Modelin işlediği metin parçası. Ücretlendirme buna göre yapılır.                                              |
| **Efor**          | Modelin bir işe ne kadar "düşünerek" yaklaşacağı.                                                             |
| **Döngü**         | Yöneticinin bir hedef için planlama, görev verme ve kontrol süreci.                                           |
| **Onay noktası**  | Belirli bir ajana görev gitmeden önce senin onayının istendiği yer.                                           |
| **Anlık görüntü** | Klasörün belirli bir andaki kaydı. Geri almak için kullanılır.                                                |
| **MCP**           | Model Context Protocol. Ajanların dış araçlara (Drive, n8n vb.) bağlanma standardı.                           |
| **Notarization**  | Apple'ın uygulamayı onaylaması. Onaylanan uygulama uyarısız açılır.                                           |
