#!/bin/bash
# AjanGrid — macOS için imzalı (ve mümkünse notarize edilmiş) DMG üretir.
# Çift tıkla. İlk seferde notarization için Apple ID bilgilerini bir kez sorar.
cd "$(dirname "$0")"
export PATH="$HOME/.homebrew/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
bekle() { read -n1 -p "Kapatmak için bir tuşa bas…"; echo; }

command -v npm >/dev/null || { echo "Node.js bulunamadı. Kur: brew install node"; bekle; exit 1; }
command -v xcrun >/dev/null || { echo "Xcode Command Line Tools yok. Kur: xcode-select --install"; bekle; exit 1; }

KIMLIKLER=$(security find-identity -v -p codesigning)
DEVID=$(echo "$KIMLIKLER" | grep -o '"Developer ID Application: [^"]*"' | head -1 | tr -d '"')
APPDEV=$(echo "$KIMLIKLER" | grep -o '"Apple Development: [^"]*"' | head -1 | tr -d '"')

if [ -n "$DEVID" ]; then
  KIMLIK="$DEVID"
  echo "→ İmza: $KIMLIK"
  PROFIL="ajangrid-notary"
  if ! xcrun notarytool history --keychain-profile "$PROFIL" >/dev/null 2>&1; then
    echo ""
    echo "Notarization bilgileri bir kez anahtar zincirine kaydedilecek."
    echo "Uygulamaya özel parola: https://account.apple.com → Giriş ve Güvenlik → Uygulamaya Özel Parolalar"
    TEAM=$(echo "$KIMLIK" | sed -E 's/.*\(([A-Z0-9]+)\)$/\1/')
    read -p "Apple ID (e-posta): " APPLEID
    read -p "Team ID [$TEAM]: " T; TEAM=${T:-$TEAM}
    echo "(Notarization'ı atlamak için boş bırakıp Enter'a bas. Uygulama bu Mac'te yine çalışır.)"
    read -s -p "Uygulamaya özel parola: " PAROLA; echo
    if [ -z "$PAROLA" ]; then
      echo "→ Notarization atlandı."
      PROFIL=""
    elif xcrun notarytool store-credentials "$PROFIL" --apple-id "$APPLEID" --team-id "$TEAM" --password "$PAROLA"; then
      echo "✓ Bilgiler kaydedildi; bir dahaki sefere sorulmayacak."
    else
      echo "✗ Apple bilgileri kabul etmedi (parola yanlış ya da süresi dolmuş olabilir)."
      echo "  Notarization olmadan devam ediliyor."
      PROFIL=""
    fi
  fi
  if [ -n "$PROFIL" ]; then
    export APPLE_KEYCHAIN_PROFILE="$PROFIL"
    EK=()
  else
    EK=(-c.mac.notarize=false)
  fi
elif [ -n "$APPDEV" ]; then
  KIMLIK="$APPDEV"
  echo "→ Developer ID sertifikası yok; 'Apple Development' ile imzalanıyor."
  echo "  Bu Mac'te sorunsuz açılır, başka Mac'lere dağıtım için Developer ID gerekir."
  EK=(-c.mac.notarize=false)
else
  echo "Anahtar zincirinde imza sertifikası bulunamadı."
  echo "Xcode → Settings → Accounts → hesabın → Manage Certificates → + → Developer ID Application"
  bekle; exit 1
fi

export CSC_NAME="${KIMLIK#*: }"
# Varsayılan: yalnızca bu Mac'in mimarisi (derleme yarı sürede biter).
# Intel Mac'ler için de üretmek istersen: TUM_MIMARILER=1 ./mac-imzali-derle.command
if [ "${TUM_MIMARILER:-0}" != "1" ]; then
  if [ "$(uname -m)" = "arm64" ]; then EK+=(-c.mac.target=dmg --arm64); else EK+=(-c.mac.target=dmg --x64); fi
  echo "→ Mimari: $(uname -m) (Intel için de üretmek: TUM_MIMARILER=1)"
fi
echo "→ Paketler kuruluyor…"
npm install --no-audit --no-fund || { bekle; exit 1; }
echo "→ Derleniyor ve imzalanıyor (notarization birkaç dakika sürebilir)…"
if npm run build:mac -- "${EK[@]}"; then
  echo ""
  echo "✓ Hazır: dist/ klasöründeki .dmg dosyasını aç, AjanGrid'i Applications'a sürükle."
  open dist
else
  echo "✗ Derleme başarısız. Yukarıdaki hata satırlarını Claude'a gönder."
fi
bekle
