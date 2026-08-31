# Support: Push-to-Talk Dictation Troubleshooting

## 1. Symptom: "This process is not trusted! Input event monitoring will not be possible"
*   **Description:** When starting `./app.sh`, a warning appears regarding accessibility clients.
*   **Cause:** macOS requires both **Input Monitoring** and **Accessibility** permissions for terminal processes listening to global key events.
*   **Fix:**
    1.  Open **System Settings -> Privacy & Security -> Input Monitoring**.
    2.  Enable your terminal application (**Terminal**, **Ghostty**, or **iTerm**).
    3.  Open **System Settings -> Privacy & Security -> Accessibility** and ensure the terminal is enabled there as well.
    4.  Restart the terminal application (`Cmd+Q`) so permissions take effect.

## 2. Symptom: Dictation not starting / "No ChatGPT tab found"
*   **Description:** Holding the hotkey shows an error notification that no ChatGPT tab was found.
*   **Cause:** No tab with `chatgpt.com` is open, or the dedicated tab was closed.
*   **Fix:**
    1.  Open [chatgpt.com](https://chatgpt.com/) in Google Chrome and log in.
    2.  Click the JustCode extension icon in the toolbar.
    3.  Click the **🎙️ Microphone icon** in the top menu bar to designate the current tab as the active dictation worker.

## 3. Symptom: Hotkey triggers twice / duplicate logs
*   **Description:** Console shows `[Dictation] Hotkey DOWN` twice per press.
*   **Cause:** Two listener threads were started because Flask's Werkzeug reloader executes `app.py` in both the supervisor and worker processes.
*   **Fix:** In `app.py`, `dictation_daemon.start()` is guarded by `if os.environ.get('WERKZEUG_RUN_MAIN') == 'true':` so only the worker process runs the keyboard listener.

## 4. Symptom: Long dictation cuts off or switches away early
*   **Description:** Dictating a long paragraph causes the tab to switch away to a random tab without pasting, while the text appears in ChatGPT a second later.
*   **Cause:** Whisper takes several seconds to transcribe long audio. A short safety timeout caused the script to conclude there was no text before Whisper finished.
*   **Fix:** `chatgpt_dictation.js` uses an extended 45-second timeout and extracts text via `MutationObserver` the instant Whisper populates `#prompt-textarea`.

## 5. Symptom: Types literal letter "v" in Telegram / Qt apps
*   **Description:** Dictation pastes fine in Terminal, but types the letter "v" in Telegram.
*   **Cause:** `keystroke "v"` is locale-dependent and treated as a character input event by Qt.
*   **Fix:** Uses `key code 9 using command down` (hardware virtual key for `V`) with a 0.08s window activation delay.

## 6. Symptom: Text remains in ChatGPT input box after dictation
*   **Description:** Dictated text is pasted into the app, but remains inside ChatGPT's input box.
*   **Cause:** ChatGPT's React state did not register the input clearing event.
*   **Fix:** `chatgpt_dictation.js` dispatches synthetic `input` and `change` events after setting `innerHTML = '<p><br></p>'`.

## 7. Symptom: Background dictation stalls / requires manual click on page
*   **Description:** When releasing the hotkey, the ChatGPT tab is brought forward but stays stuck until the user clicks the page.
*   **Cause:** ChatGPT's web audio and pointer state requires explicit synthetic pointer events to trigger the stop action.
*   **Fix:** `simulateClick()` in `chatgpt_dictation.js` dispatches a complete event chain (`pointerdown` → `mousedown` → `pointerup` → `mouseup` → `click`) and gives window focus 40ms to settle.