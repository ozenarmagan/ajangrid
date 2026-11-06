import type { Agent, ApiProvider } from '../../shared/types'

// API ajanları: tek istek, metin yanıt. Dosya yazma/komut çalıştırma yetkisi yoktur;
// yanıt, çalışma klasöründeki outputs/ altına kaydedilir ki diğer ajanlar kullanabilsin.

export interface ApiResult {
  text: string
  usage?: { input: number; output: number }
}

const MAX_TOKENS = 8192

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal: AbortSignal
): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal
  })
  const text = await res.text()
  let json: unknown = null
  try {
    json = JSON.parse(text)
  } catch {
    /* json değil */
  }
  if (!res.ok) {
    const msg =
      (json as { error?: { message?: string } } | null)?.error?.message ?? text.slice(0, 400)
    const err = new Error(`HTTP ${res.status}: ${msg}`)
    ;(err as Error & { status?: number }).status = res.status
    throw err
  }
  return json
}

async function anthropic(
  agent: Agent,
  task: string,
  key: string,
  signal: AbortSignal
): Promise<ApiResult> {
  const json = (await postJson(
    'https://api.anthropic.com/v1/messages',
    { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    {
      model: agent.model,
      max_tokens: MAX_TOKENS,
      system: agent.role || undefined,
      messages: [{ role: 'user', content: task }]
    },
    signal
  )) as {
    content?: Array<{ type: string; text?: string }>
    usage?: { input_tokens: number; output_tokens: number }
  }
  return {
    text: (json.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join(''),
    usage: json.usage
      ? { input: json.usage.input_tokens, output: json.usage.output_tokens }
      : undefined
  }
}

async function openaiCompatible(
  base: string,
  agent: Agent,
  task: string,
  key: string,
  signal: AbortSignal
): Promise<ApiResult> {
  const messages = [
    ...(agent.role ? [{ role: 'system', content: agent.role }] : []),
    { role: 'user', content: task }
  ]
  const effort = agent.effort === 'xhigh' || agent.effort === 'max' ? 'high' : agent.effort
  const body: Record<string, unknown> = { model: agent.model, messages, reasoning_effort: effort }
  let json: unknown
  try {
    json = await postJson(
      `${base}/chat/completions`,
      { authorization: `Bearer ${key}` },
      body,
      signal
    )
  } catch (err) {
    // Akıl yürütme modeli olmayan modeller reasoning_effort'u reddeder: onsuz tekrar dene
    if ((err as { status?: number }).status === 400 && /reasoning/i.test(String(err))) {
      delete body.reasoning_effort
      json = await postJson(
        `${base}/chat/completions`,
        { authorization: `Bearer ${key}` },
        body,
        signal
      )
    } else throw err
  }
  const j = json as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: { prompt_tokens: number; completion_tokens: number }
  }
  return {
    text: j.choices?.[0]?.message?.content ?? '',
    usage: j.usage ? { input: j.usage.prompt_tokens, output: j.usage.completion_tokens } : undefined
  }
}

async function google(
  agent: Agent,
  task: string,
  key: string,
  signal: AbortSignal
): Promise<ApiResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(agent.model)}:generateContent`
  const json = (await postJson(
    url,
    { 'x-goog-api-key': key },
    {
      ...(agent.role ? { systemInstruction: { parts: [{ text: agent.role }] } } : {}),
      contents: [{ role: 'user', parts: [{ text: task }] }]
    },
    signal
  )) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number }
  }
  return {
    text: (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join(''),
    usage: json.usageMetadata
      ? {
          input: json.usageMetadata.promptTokenCount,
          output: json.usageMetadata.candidatesTokenCount
        }
      : undefined
  }
}

export function apiCommandLine(agent: Agent): string {
  const p = agent.apiProvider ?? 'anthropic'
  const ep: Record<ApiProvider, string> = {
    anthropic: 'POST api.anthropic.com/v1/messages',
    openai: 'POST api.openai.com/v1/chat/completions',
    google: `POST generativelanguage.googleapis.com/…/${agent.model || '{model}'}:generateContent`,
    openrouter: 'POST openrouter.ai/api/v1/chat/completions'
  }
  const effortNote =
    p === 'openai' || p === 'openrouter'
      ? `reasoning_effort: ${agent.effort}`
      : 'efor: bu sağlayıcıda yok sayılır'
  return `${ep[p]}\nmodel: ${agent.model || '(seçilmedi)'}\n${effortNote}\nsistem: rol metni\nçıktı: outputs/<ajan>-<zaman>.md`
}

export async function runApi(
  agent: Agent,
  task: string,
  key: string,
  signal: AbortSignal
): Promise<ApiResult> {
  if (!agent.model.trim()) throw new Error('API ajanı için model adı girilmeli.')
  switch (agent.apiProvider) {
    case 'openai':
      return openaiCompatible('https://api.openai.com/v1', agent, task, key, signal)
    case 'openrouter':
      return openaiCompatible('https://openrouter.ai/api/v1', agent, task, key, signal)
    case 'google':
      return google(agent, task, key, signal)
    case 'anthropic':
    default:
      return anthropic(agent, task, key, signal)
  }
}
