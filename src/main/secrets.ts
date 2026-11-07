import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { API_LABELS, type ApiKeyStatus, type ApiProvider } from '../shared/types'

// API anahtarları işletim sisteminin şifreleme servisiyle (macOS Keychain,
// Windows DPAPI, Linux libsecret) şifrelenip userData altında saklanır.
// Anahtarlar arayüze hiçbir zaman geri gönderilmez; yalnızca son 4 hanesi gösterilir.

const file = (): string => join(app.getPath('userData'), 'secrets.json')

type SecretName = ApiProvider | 'telegram'
type Stored = Partial<Record<SecretName, { enc: string; hint: string }>>

function read(): Stored {
  try {
    if (existsSync(file())) return JSON.parse(readFileSync(file(), 'utf8')) as Stored
  } catch {
    /* bozuk dosya: boş kabul et */
  }
  return {}
}

function write(s: Stored): void {
  writeFileSync(file(), JSON.stringify(s, null, 2), { encoding: 'utf8', mode: 0o600 })
}

export function setApiKey(provider: SecretName, key: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Bu sistemde şifreli saklama kullanılamıyor; anahtar kaydedilmedi.')
  }
  const trimmed = key.trim()
  if (!trimmed) throw new Error('Anahtar boş olamaz.')
  const s = read()
  s[provider] = {
    enc: safeStorage.encryptString(trimmed).toString('base64'),
    hint: trimmed.slice(-4)
  }
  write(s)
}

export function removeApiKey(provider: SecretName): void {
  const s = read()
  delete s[provider]
  write(s)
}

export function getApiKey(provider: SecretName): string | null {
  const entry = read()[provider]
  if (!entry) return null
  try {
    return safeStorage.decryptString(Buffer.from(entry.enc, 'base64'))
  } catch {
    return null
  }
}

export function apiKeyStatuses(): ApiKeyStatus[] {
  const s = read()
  const enc = safeStorage.isEncryptionAvailable()
  return (Object.keys(API_LABELS) as ApiProvider[]).map((p) => ({
    provider: p,
    label: API_LABELS[p],
    hasKey: Boolean(s[p]),
    hint: s[p]?.hint ?? null,
    encryptionAvailable: enc
  }))
}
