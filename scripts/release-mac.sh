#!/usr/bin/env bash
# Builds the macOS release (Apple Silicon + Intel) on a Mac and attaches it to the GitHub release.
#   bash scripts/release-mac.sh            # build + verify + upload to the release of package.json's version
#   bash scripts/release-mac.sh --no-upload
# Needs: Node 22.13+, Xcode command line tools; for upload, `gh auth login` with access to the releases repo.
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="imomzoda-dev/VoiceFlowAI"
VERSION="$(node -p "require('./package.json').version")"
TAG="v$VERSION"
UPLOAD=1
[[ "${1:-}" == "--no-upload" ]] && UPLOAD=0

echo "▶ VoiceFlow AI $VERSION — macOS build"
export CSC_IDENTITY_AUTO_DISCOVERY=false
npm ci
npm run typecheck
npm test
npm run build
npx electron-builder --mac --arm64 --x64 --publish never

echo "▶ Verifying bundles"
for pair in "mac-arm64:arm64" "mac:x86_64"; do
  DIR="${pair%%:*}"; WANT="${pair##*:}"
  APP="release/$DIR/VoiceFlow AI.app"
  codesign --verify --deep --strict "$APP"
  test "$(lipo -archs "$APP/Contents/MacOS/VoiceFlow AI")" = "$WANT"
  test -f "$APP/Contents/Resources/app-update.yml"
  echo "  ✓ $APP ($WANT, ad-hoc signed)"
done
for d in release/*.dmg; do hdiutil verify "$d" >/dev/null && echo "  ✓ $d"; done
npx playwright test tests/e2e/packaged.spec.ts

if [[ $UPLOAD == 1 ]]; then
  echo "▶ Uploading to $REPO $TAG"
  gh release upload "$TAG" release/*.dmg release/*-mac.zip release/*-mac.zip.blockmap release/latest-mac.yml -R "$REPO" --clobber
fi
echo "✓ Done. Install: open release/VoiceFlow-AI-$VERSION-$(uname -m | sed 's/x86_64/x64/').dmg"
