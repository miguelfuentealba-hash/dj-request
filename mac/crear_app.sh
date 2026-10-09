#!/bin/bash
# Crea "/Applications/DJ Request.app" (para el Dock): una ventana que abre tu Panel DJ
# en https://dj-request.onrender.com. Usa el Electron que ya está instalado para DJ Player.
# Los cambios en main.js se ven sin volver a crear la app; corre esto de nuevo solo si cambia el ícono.
set -e
cd "$(dirname "$0")"
AQUI="$(pwd)"
APP="/Applications/DJ Request.app"
ELECTRON="$AQUI/../../DJPlayer/node_modules/electron/dist/Electron.app"
[ -d "$ELECTRON" ] || { echo "No encuentro Electron en DJPlayer/node_modules (corre 'npm install' en DJPlayer)"; exit 1; }
B=build; rm -rf $B; mkdir -p $B
cp -R "$ELECTRON" "$B/DJ Request.app"
R="$B/DJ Request.app/Contents/Resources"
mkdir -p "$R/app"
cat > "$R/app/package.json" <<J
{ "name": "dj-request-app", "version": "1.0.0", "main": "index.js" }
J
printf 'require(%s);\n' "$(node -e 'console.log(JSON.stringify(process.argv[1]))' "$AQUI/main.js")" > "$R/app/index.js"
# Ícono
swift icono.swift "$AQUI/../public/logo.jpg" $B/icon.png
mkdir -p $B/i.iconset
for s in 16 32 128 256 512; do
  sips -z $s $s $B/icon.png --out $B/i.iconset/icon_${s}x${s}.png >/dev/null
  sips -z $((s*2)) $((s*2)) $B/icon.png --out $B/i.iconset/icon_${s}x${s}@2x.png >/dev/null
done
iconutil -c icns $B/i.iconset -o "$R/electron.icns"
P="$B/DJ Request.app/Contents/Info.plist"
plutil -replace CFBundleName -string "DJ Request" "$P"
plutil -replace CFBundleDisplayName -string "DJ Request" "$P"
plutil -replace CFBundleIdentifier -string "cl.djmiky.request" "$P"
codesign --force --deep -s - "$B/DJ Request.app"
rm -rf "$APP"; cp -R "$B/DJ Request.app" "$APP"; rm -rf $B
touch "$APP"
echo "Lista: $APP"
