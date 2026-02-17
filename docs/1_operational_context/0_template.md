# Operational Context: [Component Name / Build System]

**Date Updated:** YYYY-MM-DD

## 1. Environment Requirements
*   **OS:** macOS 12.0+ (Monterey) or newer.
*   **Tools:** `swiftc`, `xcode-select` tools.
*   **External Libs:** None (Pure Swift / Stdlib).

## 2. Build & Run
*   **Build Command:** `./build.sh`
*   **Run Command:** `open FineTerm.app`
*   **Debug Mode:** Set `AppConfig.debugMode = true` or use `print()` logging to `~/tmp/fineterm_debug.log`.

## 3. Permissions & Security
*   **Accessibility:** Required for `CGEventTap` (Global Shortcuts, Mouse Interception).
*   **Automation:** Required for AppleScript control of Terminal.app.
*   **File Access:** `~/Library/Application Support/` for history storage.

## 4. Deployment / Release
*   **Versioning:** Update `Info.plist` version string in `build.sh`.
*   **Signing:** Requires Ad-Hoc or Dev ID signing (Handled in `build.sh`).
*   **Artifacts:** Generates `.dmg` via `package_dmg.sh`.
