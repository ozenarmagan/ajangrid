import type { Agent, AppData, LocalTool } from '../shared/types'
import { newId } from './store'

export interface TeamTemplate {
  id: string
  name: string
  description: string
}

export const TEMPLATES: TeamTemplate[] = [
  {
    id: 'blog-video',
    name: 'Blog → Video',
    description:
      'Blog yazısını özetler, senaryoya çevirir, Hyperframes ile sahneleri üretir, seslendirir ve montajlar.'
  }
]

const perms = (write: boolean, shell: boolean, network = false): Agent['permissions'] => ({
  write,
  shell,
  network
})

/** Şablondaki ajanları havuza ekler (veriyi yerinde değiştirir); eklenen adları döner. */
export function applyTemplate(data: AppData, templateId: string): string[] {
  if (templateId !== 'blog-video') return []
  const now = Date.now()
  let order = 0
  const agent = (a: Omit<Agent, 'id' | 'createdAt'>): Agent => ({
    ...a,
    id: newId(),
    createdAt: now + order++
  })

  const tts: LocalTool = data.localTools.find((t) => t.name === 'Seslendirme (TTS)') ?? {
    id: newId(),
    name: 'Seslendirme (TTS)',
    template:
      'echo "Seslendirme komutunu Motorlar ekranında tanımla. Örnek: tts --file {prompt_file} --out {out_dir}/ses.wav" && exit 1',
    note: 'Kendi yerel seslendirme modelinin komutunu yaz. {prompt_file} seslendirilecek metni içerir.'
  }
  if (!data.localTools.includes(tts)) data.localTools.push(tts)

  const members: Agent[] = [
    agent({
      name: 'Özetleyici',
      title: 'Blog yazısını kısa ve akıcı bir özete dönüştürür',
      role: 'Verilen blog yazısını oku ve ana fikri koruyan, 150-200 kelimelik akıcı bir Türkçe özet yaz. Özeti istenen dosyaya kaydet. Abartılı ifadeler kullanma.',
      isManager: false,
      color: '#93c5fd',
      engine: 'cli',
      cli: 'codex',
      model: '',
      effort: 'medium',
      permissions: perms(true, false)
    }),
    agent({
      name: 'Senarist',
      title: 'Özetten dikey kısa video senaryosu yazar',
      role: 'Özetten 9:16 dikey, yaklaşık 60 saniyelik bir video senaryosu yaz. Senaryoyu sahnelere böl; her sahne için süre (en fazla 15 sn), ekranda görünecek kısa metin ve seslendirme metni ver. Ton samimi olsun. Ayrıca yalnızca seslendirme metinlerini art arda içeren ayrı bir dosya da üret (seslendirme.txt).',
      isManager: false,
      color: '#f9a8d4',
      engine: 'cli',
      cli: 'claude',
      model: 'sonnet',
      effort: 'medium',
      permissions: perms(true, false)
    }),
    agent({
      name: 'Video Yapımcısı',
      title: 'Senaryodan Hyperframes ile sahne sahne video üretir',
      role: 'Sen dikey (9:16) kısa video üreten bir motion tasarımcısısın. Senaryodaki her sahne için sahneler/ klasöründe bir Hyperframes HTML dosyası yaz ve render ederek sahneler/sahne-XX.mp4 üret. Sahne süresi senaryodakine uysun. İşin bitince ürettiğin dosyaları listele.',
      isManager: false,
      color: '#fcd34d',
      engine: 'cli',
      cli: 'claude',
      model: 'opus',
      effort: 'high',
      permissions: perms(true, true)
    }),
    agent({
      name: 'Seslendirmen',
      title:
        'Seslendirme metnini yerel TTS modeliyle sese çevirir. Görev: seslendirilecek dosyanın adı (ör. seslendirme.txt), çıktı outputs/ses.wav',
      role: '',
      isManager: false,
      color: '#6ee7b7',
      engine: 'local',
      localToolId: tts.id,
      model: '',
      effort: 'medium',
      permissions: perms(true, true)
    }),
    agent({
      name: 'Montajcı',
      title: 'Video sahnelerini ve sesi ffmpeg ile birleştirip final videoyu üretir',
      role: 'ffmpeg kullanarak sahneler/ klasöründeki videoları sırayla birleştir, outputs/ altındaki ses dosyasını ekle ve final.mp4 üret. Ses ile görüntü süresi uyuşmuyorsa görüntüyü sese göre uzat/kısalt. Sonunda final dosyanın süresini ve yolunu yaz.',
      isManager: false,
      color: '#fdba74',
      engine: 'cli',
      cli: 'claude',
      model: 'sonnet',
      effort: 'medium',
      permissions: perms(true, true)
    })
  ]
  // Aynı adlı ajan varsa adın sonuna şablon adı eklenir
  const used = new Set(data.agents.map((a) => a.name.toLocaleLowerCase('tr')))
  for (const m of members) {
    if (used.has(m.name.toLocaleLowerCase('tr'))) m.name = `${m.name} (video)`
    used.add(m.name.toLocaleLowerCase('tr'))
  }
  data.agents.push(...members)
  // Seslendirmeden önce senaryo onayı
  data.settings.checkpoints = [...(data.settings.checkpoints ?? []), members[3].id]
  return members.map((m) => m.name)
}
