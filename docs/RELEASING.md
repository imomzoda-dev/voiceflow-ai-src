# Releasing VoiceFlow AI

| Repository | Visibility | Purpose |
|---|---|---|
| `imomzoda-dev/voiceflow-ai-src` | private | Source code + CI (`.github/workflows/release.yml`) |
| `imomzoda-dev/VoiceFlowAI` | public | README, changelog, screenshots and **Releases**, which are the update feed |

The app reads `latest.yml` (Windows) and `latest-mac.yml` (macOS) from the newest release of `VoiceFlowAI` that has its file. Each system therefore updates on its own schedule (`electron/services/updates/`).

## Steps

1. Bump `version` in `package.json` and add a section to the public `CHANGELOG.md`.
2. Commit, then tag and push:
   ```bash
   git tag -a v1.0.1 -m "VoiceFlow AI 1.0.1"
   ```
   ```bash
   git push origin main v1.0.1
   ```
3. CI ("Release builds") runs on the tag. It:
   - type-checks, runs the unit tests, packages the app and verifies the bundles (ad-hoc signature, CPU architecture of the app and of the native hook, `app-update.yml`, migrations, DMG integrity);
   - checks the SHA-512 of the macOS ZIPs against `latest-mac.yml`;
   - starts the packaged app through `tests/e2e/packaged.spec.ts`;
   - uploads the artifacts `voiceflow-mac` (DMG, ZIP, blockmaps, `latest-mac.yml`) and `voiceflow-windows` (EXE, blockmap, `latest.yml`).
4. Download the artifacts and publish:
   ```bash
   gh run download <run-id> -R imomzoda-dev/voiceflow-ai-src -D dist-ci
   ```
   ```bash
   gh release create v1.0.1 -R imomzoda-dev/VoiceFlowAI --title "VoiceFlow AI 1.0.1" --notes-file notes.md dist-ci/voiceflow-windows/* dist-ci/voiceflow-mac/*
   ```
   Release notes follow the 1.0.0 layout: English, then `## Что нового` (Russian), then `## Чӣ нав аст` (Tajik), with the macOS `xattr` notice and the SmartScreen note.

**Without CI:** run `npm run dist:win` on Windows. On a Mac, `bash scripts/release-mac.sh` builds, verifies and uploads to an existing release.

## Signing

There is no code-signing certificate and no Apple Developer ID.
- **Windows:** unsigned NSIS installer. SmartScreen asks once.
- **macOS:** bundles are ad-hoc signed (`mac.identity: "-"`), which Apple Silicon requires. Squirrel.Mac refuses updates without a Developer ID, so the app updates itself instead:
  1. downloads its ZIP;
  2. verifies SHA-512, `CFBundleShortVersionString` and `codesign --verify`;
  3. swaps the bundle after quitting, keeping the old one until the copy succeeds.

When certificates become available, set `CSC_LINK`/`CSC_KEY_PASSWORD` (Windows) or the Apple notarization variables (macOS). Then `identity`, `hardenedRuntime` and notarization can be switched on in `electron-builder.yml`.
