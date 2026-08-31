import os
import sys
import time
import threading
import subprocess
import platform
import pyperclip
from pynput import keyboard

class DictationDaemon:
    _started = False

    def __init__(self, ws_broadcast_func):
        self.ws_broadcast = ws_broadcast_func
        self.is_recording = False
        self.active_mode = None
        self.saved_app_name = None
        self.saved_bundle_id = None
        self.listener = None
        self.lock = threading.Lock()
        
        # Configuration:
        # 1. Background / Stay-in-app mode (default: cmd_r)
        self.hotkey_background = self.normalize_key_name(
            os.getenv('DICTATION_HOTKEY_BACKGROUND', os.getenv('DICTATION_HOTKEY', 'cmd_r'))
        )
        # 2. Foreground / Switch-to-ChatGPT mode (default: alt_r)
        self.hotkey_foreground = self.normalize_key_name(
            os.getenv('DICTATION_HOTKEY_FOREGROUND', 'alt_r')
        )
        self.enabled = os.getenv('ENABLE_DICTATION', 'true').lower() == 'true'

    def normalize_key_name(self, name):
        if not name:
            return ""
        n = str(name).lower().strip()
        if n in ("alt_r", "option_r", "opt_r", "right_alt", "right_option", "altgr"):
            return "alt_r"
        if n in ("cmd_r", "command_r", "right_cmd", "right_command"):
            return "cmd_r"
        if n in ("ctrl_r", "control_r", "right_ctrl", "right_control"):
            return "ctrl_r"
        return n

    def get_frontmost_app_info(self):
        """Retrieves both process name and unique bundle ID of the frontmost application on macOS."""
        if platform.system() == 'Darwin':
            script = '''
            tell application "System Events"
                set frontApp to first application process whose frontmost is true
                set appName to name of frontApp
                set appBundle to ""
                try
                    set appBundle to bundle identifier of frontApp
                end try
                return appName & "|||" & appBundle
            end tell
            '''
            try:
                res = subprocess.run(['osascript', '-e', script], capture_output=True, text=True, timeout=1)
                if res.returncode == 0 and '|||' in res.stdout:
                    parts = res.stdout.strip().split('|||', 1)
                    appName = parts[0].strip()
                    appBundle = parts[1].strip() if len(parts) > 1 else ""
                    if appName:
                        return appName, (appBundle if appBundle else None)
            except Exception as e:
                print(f"[Dictation] Failed to get frontmost app: {e}")
        return None, None

    def restore_and_paste(self, text):
        """Restores the original application window and pastes the transcribed text."""
        if not text:
            return

        # 1. Copy transcript to system clipboard
        pyperclip.copy(text)
        time.sleep(0.01)

        system = platform.system()
        if system == 'Darwin':
            if self.saved_bundle_id:
                script = f'''
                tell application id "{self.saved_bundle_id}" to activate
                delay 0.03
                tell application "System Events"
                    key code 9 using command down
                end tell
                '''
            elif self.saved_app_name:
                script = f'''
                tell application "{self.saved_app_name}" to activate
                delay 0.03
                tell application "System Events"
                    key code 9 using command down
                end tell
                '''
            else:
                script = '''
                tell application "System Events"
                    key code 9 using command down
                end tell
                '''
            
            try:
                subprocess.run(['osascript', '-e', script], capture_output=True, text=True, timeout=1.5)
            except Exception as e:
                print(f"[Dictation] Failed to paste via AppleScript: {e}")
        else:
            try:
                from pynput.keyboard import Controller, Key
                kb = Controller()
                with kb.pressed(Key.ctrl):
                    kb.press('v')
                    kb.release('v')
            except Exception as e:
                print(f"[Dictation] Fallback paste failed: {e}")

    def matches_hotkey(self, key, target_name):
        """Checks if the event key matches a given target key name."""
        try:
            target = self.normalize_key_name(target_name)
            if isinstance(key, keyboard.Key):
                key_name = self.normalize_key_name(key.name)
                return key_name == target
            elif isinstance(key, keyboard.KeyCode):
                if key.char:
                    return self.normalize_key_name(key.char) == target
                if target == 'f20' and key.vk in (90, 80):
                    return True
        except Exception:
            pass
        return False

    def on_press(self, key):
        if not self.enabled:
            return

        with self.lock:
            if self.is_recording:
                return

            mode = None
            if self.matches_hotkey(key, self.hotkey_background):
                mode = 'background'
            elif self.matches_hotkey(key, self.hotkey_foreground):
                mode = 'foreground'

            if mode:
                self.is_recording = True
                self.active_mode = mode
                self.saved_app_name, self.saved_bundle_id = self.get_frontmost_app_info()
                active_display = self.saved_app_name or self.saved_bundle_id or "Current"
                
                mode_label = "Background Mode (Stay in app)" if mode == 'background' else "Foreground Mode (Switch to ChatGPT)"
                print(f"[Dictation] Hotkey DOWN [{mode_label}] (Active app: {active_display}). Starting dictation...")
                
                self.ws_broadcast({
                    'type': 'dictation_start',
                    'mode': mode,
                    'switchOnStart': (mode == 'foreground'),
                    'timestamp': time.time()
                })

    def on_release(self, key):
        if not self.enabled:
            return

        with self.lock:
            if not self.is_recording:
                return

            should_stop = False
            if self.active_mode == 'background' and self.matches_hotkey(key, self.hotkey_background):
                should_stop = True
            elif self.active_mode == 'foreground' and self.matches_hotkey(key, self.hotkey_foreground):
                should_stop = True

            if should_stop:
                self.is_recording = False
                self.active_mode = None
                print("[Dictation] Hotkey UP. Stopping dictation...")
                self.ws_broadcast({
                    'type': 'dictation_stop',
                    'timestamp': time.time()
                })

    def handle_transcript_result(self, text):
        """Called when the Chrome extension sends back the final transcript."""
        target_display = self.saved_app_name or self.saved_bundle_id or "active app"
        print(f"[Dictation] Transcript received ({len(text)} chars): \"{text}\" -> Pasting into {target_display}")
        self.restore_and_paste(text)

    def start(self):
        """Starts the background keyboard listener thread."""
        if not self.enabled:
            print("[Dictation] Dictation daemon disabled via config.")
            return

        if DictationDaemon._started:
            return
        DictationDaemon._started = True

        def run_listener():
            print(f"[Dictation] Daemon active.")
            print(f"  • Stay-in-app (Background): Hold [{self.hotkey_background.upper()}]")
            print(f"  • View-screen (Foreground): Hold [{self.hotkey_foreground.upper()}]")
            try:
                with keyboard.Listener(on_press=self.on_press, on_release=self.on_release) as listener:
                    self.listener = listener
                    listener.join()
            except Exception as e:
                print(f"[Dictation] Key listener encountered an error: {e}")

        t = threading.Thread(target=run_listener, daemon=True)
        t.start()