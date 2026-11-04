# Native integration layer

## What ships today

Global push-to-talk and text insertion go through the `NativeInputBridge` interface (`electron/native/input-bridge.ts`). The current implementation is `UiohookBridge` (`electron/native/uiohook-bridge.ts`), built on **libuiohook** through the `uiohook-napi` package:

| Need | How |
|---|---|
| Global **keydown + keyup** (Electron `globalShortcut` only gives keydown) | Windows: `WH_KEYBOARD_LL` hook · macOS: `CGEventTap` |
| Ignore OS auto-repeat, track modifiers | `electron/main/hotkey-matcher.ts` (pure, unit-tested) |
| Keep F12 etc. from also reaching the focused app | The same accelerator is registered with `globalShortcut` as a no-op. `RegisterHotKey` / Carbon consume the keydown; the low-level hook still sees it |
| Detect "shortcut already in use" | `globalShortcut.register()` returns `false` → shown in Settings |
| Paste into the active app | Clipboard snapshot → text → synthetic Ctrl/Cmd+V via `keyTap` → clipboard restored |

`uiohook-napi` is an N-API module with prebuilt binaries for win32-x64/arm64 and darwin-x64/arm64. N-API is ABI-stable, so no rebuild is needed per Electron version. It is listed in `asarUnpack` in `electron-builder.yml`.

**Privacy:** the hook callback only compares events with the configured bindings and tracks modifier up/down state. No key events are stored, logged or sent anywhere.

## Why not Rust (yet)

The brief preferred Rust (napi-rs or a helper process). This machine has no Rust toolchain, and shipping an unbuilt, untested Rust module would be a "fake function". The interface is designed so a Rust helper can replace `UiohookBridge` without changes to the hotkey manager, dictation service or typing service.

### Planned Rust helper (`voiceflow-native`)

```
native/
  Cargo.toml
  src/
    hotkeys/        # rdev / windows-rs LowLevelKeyboardProc / CGEventTap
    keyboard/       # SendInput (Windows) / CGEventPost (macOS), Unicode typing fallback
    accessibility/  # AXIsProcessTrustedWithOptions, focused-element caret position
    permissions/    # Input Monitoring (IOHIDCheckAccess) — no public API in Electron
    platform/
```

The helper would add:
- `IOHIDCheckAccess` for a real Input Monitoring status on macOS (Electron can't query it).
- Direct Unicode typing (`SendInput` with `KEYEVENTF_UNICODE`) as a fallback for apps that block paste.
- Swallowing the hotkey in the hook itself, instead of the `globalShortcut` trick.

Build target: `napi-rs` with prebuilt `.node` files per platform/arch, loaded the same way as `uiohook-napi`.
