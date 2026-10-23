#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MACOS="$ROOT/macos"
WORK="$MACOS/.build-app"
APP="${APP_OUTPUT:-$ROOT/dist/VidLingo.app}"
NODE_BIN="${NODE_BIN:-$(command -v node)}"
NPM_BIN="${NPM_BIN:-$(command -v npm)}"
VERSION="${VERSION:-1.0.0}"

# Keep reusable runtime and compiler caches, but discard this build's staging
# directory on success, failure, or interruption.
mkdir -p "$WORK"
STAGE_DIR="$(mktemp -d "$WORK/stage.XXXXXX")"
cleanup() {
  rm -rf -- "$STAGE_DIR"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "==> 1/6 构建后端"
rm -rf "$ROOT/backend/dist"
(cd "$ROOT" && "$NPM_BIN" --workspace backend run build)

echo "==> 2/6 准备内嵌运行时"
mkdir -p "$WORK/runtime/app"
rm -rf "$WORK/runtime/app/dist" "$WORK/runtime/app/db"
rsync -a --exclude '*.test.js' "$ROOT/backend/dist" "$WORK/runtime/app/"
rsync -a "$ROOT/backend/db" "$WORK/runtime/app/"
cat > "$WORK/runtime/app/package.json" <<'JSON'
{
  "name": "vidlingo-local-runtime",
  "private": true,
  "type": "module",
  "dependencies": {
    "@electric-sql/pglite": "^0.5.10",
    "cors": "^2.8.5",
    "express": "^4.19.2",
    "zod": "^3.23.8"
  }
}
JSON
# Invalidate the runtime dependency cache when its manifest changes. This also
# removes retired packages that npm may leave behind in an existing install.
DEPENDENCY_HASH="$(shasum -a 256 "$WORK/runtime/app/package.json" | cut -d ' ' -f1)"
DEPENDENCY_STAMP="$WORK/runtime-dependencies.sha256"
if [ ! -f "$DEPENDENCY_STAMP" ] || [ "$(cat "$DEPENDENCY_STAMP")" != "$DEPENDENCY_HASH" ]; then
  rm -rf "$WORK/runtime/app/node_modules"
fi
(cd "$WORK/runtime/app" && "$NPM_BIN" install --omit=dev --no-audit --no-fund --loglevel=error --workspaces=false)
printf '%s\n' "$DEPENDENCY_HASH" > "$DEPENDENCY_STAMP"
cp "$NODE_BIN" "$WORK/runtime/node"
chmod +x "$WORK/runtime/node"

echo "==> 3/6 编译应用与本机翻译组件"
(cd "$MACOS" && swift build -c release --disable-sandbox)
mkdir -p "$WORK/runtime/bin"
cp "$MACOS/.build/release/vidlingo-translate" "$WORK/runtime/bin/vidlingo-translate"
chmod +x "$WORK/runtime/bin/vidlingo-translate"

echo "==> 4/6 构建插件与图标"
(cd "$ROOT" && "$NPM_BIN" --workspace extension run build >/dev/null)

ICON_NAME="AppIcon"
ICON_CAR=""
if [ -d "$MACOS/branding/Lexio.icon" ]; then
  rm -rf "$WORK/iconout"
  mkdir -p "$WORK/iconout"
  if xcrun actool "$MACOS/branding/Lexio.icon" \
      --compile "$WORK/iconout" \
      --platform macosx \
      --minimum-deployment-target 26.0 \
      --app-icon Lexio \
      --output-partial-info-plist "$WORK/iconout/info.plist" >/dev/null 2>&1; then
    ICON_NAME="Lexio"
    ICON_CAR="$WORK/iconout/Assets.car"
  fi
fi

if [ "$ICON_NAME" = "AppIcon" ]; then
  mkdir -p "$WORK/AppIcon.iconset"
  swift "$MACOS/scripts/make-icon.swift" "$WORK/icon-source.png" >/dev/null
  for size in 16 32 128 256 512; do
    sips -z "$size" "$size" "$WORK/icon-source.png" --out "$WORK/AppIcon.iconset/icon_${size}x${size}.png" >/dev/null
    double=$((size * 2))
    sips -z "$double" "$double" "$WORK/icon-source.png" --out "$WORK/AppIcon.iconset/icon_${size}x${size}@2x.png" >/dev/null
  done
  iconutil -c icns "$WORK/AppIcon.iconset" -o "$WORK/AppIcon.icns"
fi

echo "==> 5/6 组装 VidLingo.app"
STAGE_APP="$STAGE_DIR/VidLingo.app"
mkdir -p "$STAGE_APP/Contents/MacOS" "$STAGE_APP/Contents/Resources"
cp "$MACOS/.build/release/VidLingo" "$STAGE_APP/Contents/MacOS/VidLingo"
cp -R "$WORK/runtime" "$STAGE_APP/Contents/Resources/runtime"
cp -R "$ROOT/extension/dist" "$STAGE_APP/Contents/Resources/extension"

if [ "$ICON_NAME" = "Lexio" ]; then
  cp "$WORK/iconout/Lexio.icns" "$STAGE_APP/Contents/Resources/Lexio.icns"
  if [ -n "$ICON_CAR" ] && [ -f "$ICON_CAR" ]; then
    cp "$ICON_CAR" "$STAGE_APP/Contents/Resources/Assets.car"
  fi
  sips -z 256 256 -s format png "$WORK/iconout/Lexio.icns" \
    --out "$STAGE_APP/Contents/Resources/AppMark.png" >/dev/null 2>&1 || true
else
  cp "$WORK/AppIcon.icns" "$STAGE_APP/Contents/Resources/AppIcon.icns"
fi
if [ -f "$MACOS/branding/MenuBarIcon.svg" ]; then
  cp "$MACOS/branding/MenuBarIcon.svg" "$STAGE_APP/Contents/Resources/MenuBarIcon.svg"
fi

cat > "$STAGE_APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>VidLingo</string>
  <key>CFBundleDisplayName</key>
  <string>VidLingo</string>
  <key>CFBundleExecutable</key>
  <string>VidLingo</string>
  <key>CFBundleIdentifier</key>
  <string>com.vidlingo.desktop</string>
  <key>CFBundleIconFile</key>
  <string>${ICON_NAME}</string>
  <key>CFBundleIconName</key>
  <string>${ICON_NAME}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${VERSION}</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>LSApplicationCategoryType</key>
  <string>public.app-category.productivity</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSHumanReadableCopyright</key>
  <string>VidLingo · local subtitle engine</string>
</dict>
</plist>
PLIST

echo "==> 6/6 签名并安装到 dist"
xattr -cr "$STAGE_APP"

# A stable signing identity matters: ad-hoc signatures change on every build, so macOS
# treats each build as a new app and re-prompts for Keychain access. Signing with the
# same certificate keeps the designated requirement (and Keychain ACL) stable.
SIGN_IDENTITY="${SIGN_IDENTITY:-$(security find-identity -v -p codesigning 2>/dev/null \
  | sed -n 's/.*"\(Apple Development:.*\)"/\1/p' | head -1)}"

if [ -n "$SIGN_IDENTITY" ]; then
  echo "    签名身份：$SIGN_IDENTITY"
  if ! codesign --force --deep --sign "$SIGN_IDENTITY" --timestamp=none "$STAGE_APP"; then
    echo "（指定身份签名失败，回退到 ad-hoc）"
    codesign --force --deep --sign - "$STAGE_APP" || true
  fi
else
  echo "    未找到 Apple Development 证书，使用 ad-hoc 签名"
  codesign --force --deep --sign - "$STAGE_APP" || true
fi

mkdir -p "$(dirname "$APP")"
if [ -e "$APP" ]; then
  mkdir -p "$HOME/.Trash"
  mv "$APP" "$HOME/.Trash/VidLingo-$(date +%s).app" 2>/dev/null || true
fi
ditto "$STAGE_APP" "$APP"

SIZE="$(du -sh "$APP" | cut -f1)"
echo ""
echo "完成：${APP}（${SIZE}）"
echo "运行：open \"${APP}\""
