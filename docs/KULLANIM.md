# AjanGrid Kullanım Kılavuzu

AjanGrid, birden fazla yapay zekâ ajanını tek bir **yönetici** üzerinden çalıştırman için tasarlandı. Sen yöneticiye bir hedef verirsin. Yönetici işi adımlara böler, her adımı en uygun ajana verir, çıktıları kontrol eder ve sonucu sana raporlar. Sen yalnızca gerektiğinde onay verir ya da düzeltme istersin.

Ajanlar farklı "motorlarla" çalışabilir:

- **CLI:** Bilgisayarında kurulu Claude Code, Codex, Antigravity gibi araçlar. Ücretli aboneliğinin limitlerini kullanır.
- **API:** Anthropic, OpenAI, Google ve OpenRouter. Kullandığın kadar ödersin.
- **Yerel araç:** Bilgisayarındaki bir program ya da model, örneğin seslendirme modeli ya da ffmpeg.

> Bu kılavuz uygulamanın içinde de var: sol menüde **Kullanım Kılavuzu**.

---

## 1. Temel kavramlar

**Yönetici**
Tek bir yönetici vardır ve bütün işleri o yürütür. Hedefini alır, plan yapar, görevleri **ajan havuzundaki** uygun ajanlara dağıtır ve çıktıları denetler. Bir çıktıyı yetersiz bulursa aynı ajana düzeltme gönderir.

**Ajan havuzu ve alt ajanlar**
Bütün alt ajanlar tek bir havuzda durur: özetleyici, senarist, video yapımcısı, seslendirmen, lead araştırmacısı gibi. Ekip kurman gerekmez. Yönetici her hedefte yalnızca o işe uygun ajanları seçer. Her alt ajanın bir **rolü** (talimatları), bir **motoru**, bir **modeli** ve **izinleri** vardır.

**Hedef**
Yöneticiye verdiğin işe **hedef** denir. Her hedef sol menüde **Hedefler** listesinde ayrı bir sohbet olarak durur. Yöneticinin bu hedef için yürüttüğü "planla → görev ver → kontrol et" sürecine **döngü** denir. Döngü bittiğinde yönetici bir **sonuç özeti** yazar. Bitmiş bir hedefe yeni mesaj yazarak devam ettirebilirsin.

**Hedef klasörü**
Her hedef kendi klasöründe çalışır. Varsayılan olarak `~/AjanGrid/isler/` altında tarih ve hedef adıyla yeni bir klasör açılır (ör. `2026-11-07-blog-videosu`). Ajanlar dosyaları bu klasörde okur ve yazar, böylece farklı işlerin dosyaları birbirine karışmaz. İstersen hedefi başlatmadan önce var olan bir klasör de seçebilirsin.

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

## 3. Ajan havuzunu doldur

Hiçbir şey yapmadan da başlayabilirsin: yöneticiye hedefini yaz. Havuzda bu iş için uygun ajan yoksa yönetici **yeni ajanlar önerir**, sen onaylayınca havuza eklenir. En kolay yol budur.

Diğer yollar sol menüde **Ajan havuzu** başlığının yanındaki **⇩** düğmesinde:

1. **Blog → Video ajanlarını ekle:** Özetleyici, senarist, video yapımcısı, seslendirmen ve montajcıyı rolleriyle birlikte havuza ekler.
2. **Dosyadan ajan ekle…:** Daha önce dışa aktarılmış bir ajan paketini (`.ajangrid.json`) yükler. Eski sürümün ekip dosyaları da çalışır.
3. **+** düğmesi: Ajanı kendin tanımlarsın (bkz. Bölüm 7).

---

## 4. Yöneticiye hedef vermek

Sol menüde **+ Yeni hedef**'e bas, alttaki kutuya hedefini yaz ve **Enter**'a bas. Yeni satır için **Shift+Enter** kullan.

Başlattığın hedef sol menüdeki **Hedefler** listesine eklenir. Birden fazla hedef aynı anda çalışabilir; biri onay beklerken diğeri devam eder. Listedeki noktanın rengi durumu gösterir: yeşil çalışıyor, sarı senden yanıt bekliyor, mor tamamlandı, kırmızı hata.

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

### Dosya, görsel ve bağlantı eklemek

Mesajına üç yolla dosya ekleyebilirsin:

- Kutunun solundaki **📎 ataç** düğmesiyle dosya seç.
- Dosyayı kutuya **sürükleyip bırak**.
- Bir görseli kopyalayıp kutuya **yapıştır** (⌘V / Ctrl+V). Ekran görüntüleri de olur.

Eklenen dosyalar kutunun üstünde küçük etiketler olarak görünür; ✕ ile çıkarabilirsin. Gönderdiğinde dosyalar hedef klasöründeki `kaynak/` altına kopyalanır ve mesajın sonuna yazılır. Böylece yönetici ve ajanlar o dosyayı görür. Bir bağlantıyı sürüklersen mesaja metin olarak eklenir.

### Klasör seçmek

Yeni hedef ekranında kutunun altındaki **Klasör: yeni** düğmesiyle var olan bir klasör seçebilirsin (ör. bir web sitesi projesi). Seçmezsen hedef için yeni bir klasör açılır.

### Onay noktaları

Kutunun altındaki **Onay noktaları** düğmesi havuzdaki ajanları listeler. Bir ajanı seçersen (sarı olur), o ajana görev gitmeden önce senin onayın istenir. Bu seçim bütün hedefler için geçerlidir.

### Hedefle konuşmaya devam etmek

Aynı kutu her durumda yöneticiye yazmak içindir:

- **Yönetici soru sorduysa:** yazdığın şey yanıt olur.
- **Onay bekliyorsa:** sarı karttaki **Onayla** düğmesine bas ya da kutuya yazarak düzeltme iste.
- **Hedef bittiyse ya da durduysa:** yazdığın şey yeni talimat olur ve yönetici aynı klasörde, önceki işi hatırlayarak devam eder. Örneğin "videoyu 30 saniyeye kısalt".
- **Yönetici çalışıyorsa:** kutu kapalıdır; **Durdur** düğmesi görünür.

---

## 5. Süreci izlemek

Komuta Merkezi iki bölümden oluşur: solda seçili hedefle ilgili yöneticiyle konuşman, sağda **ajanlar** paneli.

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

### 5.3 Ajanlar paneli (sağ taraf)

Bir hedef seçiliyse üstte **o hedefte görev alan ajanlar** görünür; havuzdaki diğerleri altta katlanmış listededir. Kartlar yalnızca bu hedefe ait çalışmaları gösterir. Yeni hedef ekranında bütün havuz görünür. Kartta ajanın durumu, süresi, son görevi ve çıktısının son satırları görünür. Karta tıklayınca:

- Çıktının tamamı okunur biçimde açılır.
- **Ham terminal:** Ajanın gerçek terminal çıktısını gösterir.
- **Ayarlar:** Ajanı düzenleme ekranına götürür.
- **Durdur:** Çalışan görevi keser.

Sol menüde bir ajanın adına tıklamak da onun kartını açar.

### 5.4 Dosyalar

Panelin altındaki **Bu hedefin dosyaları** bölümü hedef klasörünü gösterir; klasörün tam yolu da altında yazar. Bir klasöre tıklayınca içine girersin. Bir dosyaya tıklayınca uygulama içinde **önizleme** açılır: metinler okunur, görseller gösterilir, video ve ses oynatılır. **Uygulamada aç** düğmesi dosyayı varsayılan programda açar.

---

## 6. Onaylar ve sorular

Yönetici bazı durumlarda durur ve sana sarı bir kart gösterir:

| Kart                   | Ne zaman?                                                   | Ne yaparsın?                                                                          |
| ---------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Onay noktası**       | Onay iste dediğin bir ajana görev gidecekken                | **Onayla, devam et** ya da alttaki kutuya düzeltme yazıp gönder                       |
| **Yeni ajan önerisi**  | Havuzda uygun ajan yokken yönetici yeni ajanlar önerdiğinde | Önerilen ajanları incele ve **Ajanları oluştur, devam et**. Değişiklik istiyorsan yaz |
| **Yöneticinin sorusu** | Yöneticinin karar veremediği bir nokta olduğunda            | Yanıtını alttaki kutuya yaz ve Enter                                                  |
| **Limit doldu**        | Bir ajanın aboneliği dolduğunda                             | Ne yapılacağını yaz: "bekle", "X ajanını kullan", "bu adımı atla"                     |

Ajan önerisinde ⚠ işareti görürsen dikkat et. Örneğin "codex bu bilgisayarda bulunamadı" yazıyorsa o ajan çalışmaz. Onaylamadan önce düzeltme iste ya da sonradan ajanın motorunu değiştir.

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

**Test et** düğmesi ajana kısa bir bağlantı testi gönderir. Sonucu Komuta Merkezi'nde, yeni hedef ekranının ajanlar panelinde görürsün.

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

1. **+ Yeni hedef** ekranında kutuya hedefi yaz.
2. **Zamanla** düğmesine bas.
3. Günleri ve saati seç, sonra **Zamanla**'ya bas.

Zamanlanmış hedefler aynı panelde listelenir. Kutucukla geçici olarak kapatabilir, çöp kutusuyla silebilirsin. Zamanlanmış hedefler yalnızca **AjanGrid açıkken** çalışır. Her çalışmada yeni bir hedef klasörü açılır ve hedef listeye eklenir.

---

## 11. Hedefleri ve havuzu yönetmek

- **Hedef silmek:** Sol menüde fareyle bir hedefin üzerine gelince 🗑 simgesi çıkar. Hedef listeden silinir, sürüyorsa durdurulur. Klasördeki dosyalara dokunulmaz.
- **Ajanları dışa aktar:** **Ajan havuzu → ⇩ → Ajanları dışa aktar…** yönetici dışındaki ajanları, kullandıkları yerel araçları ve MCP sunucularını tek bir `.ajangrid.json` dosyasına kaydeder. Bu dosyayı başka bir bilgisayara ya da bir müşteriye verebilirsin. Şifre ve anahtar gibi gizli değerler dosyaya yazılmaz.
- **İçe aktar:** **Ajan havuzu → ⇩ → Dosyadan ajan ekle…** Aynı adlı ajan varsa yenisinin adının sonuna sayı eklenir.

**Eski sürümden geçiş:** Ekipli sürümden güncellediğinde bütün ekiplerin ajanları tek havuzda birleşir. Aynı adlı ajanların adına ekip adı eklenir (ör. "Yazar (Blog)"). Aktif ekibin yöneticisi kalır; diğer ekiplerin yöneticileri havuza alınmaz. Eski veri dosyası `ajangrid.v1-yedek.json` adıyla yedeklenir. Eski hedefler listede görünür ve dosyaları eski ekip klasörlerinde kalır.

---

## 12. Güvenlik ve maliyet ipuçları

- **Klasör:** Var olan bir klasör seçeceksen önemli belgelerinin bulunduğu bir klasörü seçme. Ajanlar bu klasörde dosya yazıp silebilir. Emin değilsen yeni klasörde başlat.
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

Her çalışmanın tam kaydı, hedef klasöründeki `.ajangrid/runs/` altında `.log` dosyası olarak durur.

---

## 14. Sık sorulan sorular

**Alt ajanlara doğrudan görev verebilir miyim?**
AjanGrid yönetici merkezlidir: işleri yöneticiye verirsin. Bir ajanı tek başına denemek için Ajanlar ekranındaki **Test et** düğmesini kullan.

**Aynı anda birden fazla hedef çalıştırabilir miyim?**
Evet. Her hedef kendi klasöründe ayrı yürür. Aynı ajan iki hedefte aynı anda görev alabilir; aboneliğinin limitini ikisi birlikte harcar.

**Ajanlar birbirinin çıktısını nasıl görüyor?**
Hedefin ortak klasörü üzerinden. Yönetici görev verirken hangi dosyanın okunup hangisine yazılacağını söyler. API ajanlarının yanıtları otomatik olarak `outputs/` klasörüne kaydedilir.

**Verilerim nerede?**
Ajanlar, hedef kayıtları ve ayarlar bilgisayarındaki uygulama veri klasöründe durur. API anahtarları ve Telegram anahtarı şifreli olarak saklanır. Ajanların ürettiği her şey hedef klasöründedir.

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
| **Ajan havuzu**   | Yöneticinin görev verebileceği bütün alt ajanlar.                                                             |
| **Onay noktası**  | Belirli bir ajana görev gitmeden önce senin onayının istendiği yer.                                           |
| **Anlık görüntü** | Klasörün belirli bir andaki kaydı. Geri almak için kullanılır.                                                |
| **MCP**           | Model Context Protocol. Ajanların dış araçlara (Drive, n8n vb.) bağlanma standardı.                           |
| **Notarization**  | Apple'ın uygulamayı onaylaması. Onaylanan uygulama uyarısız açılır.                                           |
