import os
import sys
import time
import threading
import subprocess
import platform
import json
import logging
from datetime import datetime
from logging.handlers import RotatingFileHandler

# Safely import pyperclip for headless / non-GUI environments
try:
    import pyperclip
except Exception:
    pyperclip = None

# Safely import pynput keyboard listener; on headless Linux without $DISPLAY it will fail gracefully
try:
    from pynput import keyboard
except Exception:
    keyboard = None

try:
    from Quartz import (
        CGEventSourceFlagsState,
        CGEventSourceKeyState,
        kCGEventFlagMaskAlternate,
        kCGEventFlagMaskCommand,
        kCGEventFlagMaskControl,
        kCGEventSourceStateCombinedSessionState,
    )
except Exception:
    CGEventSourceFlagsState = None
    CGEventSourceKeyState = None
    kCGEventFlagMaskAlternate = None
    kCGEventFlagMaskCommand = None
    kCGEventFlagMaskControl = None
    kCGEventSourceStateCombinedSessionState = None

try:
    from AppKit import NSWorkspace
except Exception:
    NSWorkspace = None

class DictationDaemon:
    _started = False

    def __init__(self, ws_broadcast_func):
        self.ws_broadcast = ws_broadcast_func
        self.is_recording = False
        self.active_mode = None
        self.saved_app_name = None
        self.saved_bundle_id = None
        self.listener = None
        self.lock = threading.RLock()
        self.session_sequence = 0
        self.active_session_id = None
        self.pending_start_timer = None
        self.start_delivered = False
        self.session_targets = {}
        self.latest_delivered_session_id = None
        self.completed_session_ids = set()

        try:
            hold_threshold_ms = int(os.getenv('DICTATION_HOLD_THRESHOLD_MS', '300'))
        except ValueError:
            hold_threshold_ms = 300
        self.hold_threshold_seconds = max(0, hold_threshold_ms) / 1000.0
        
        # Configuration:
        # 1. Background / Stay-in-app mode (default: cmd_r)
        self.hotkey_background = self.normalize_key_name(
            os.getenv('DICTATION_HOTKEY_BACKGROUND', os.getenv('DICTATION_HOTKEY', 'cmd_r'))
        )
        # 2. Foreground / Switch-to-ChatGPT mode (default: alt_r)
        self.hotkey_foreground = self.normalize_key_name(
            os.getenv('DICTATION_HOTKEY_FOREGROUND', 'alt_r')
        )
        self.hotkey_name = self.hotkey_background
        
        # Only enable if requested and the platform supports keyboard interception
        is_config_enabled = os.getenv('ENABLE_DICTATION', 'true').lower() == 'true'
        self.enabled = is_config_enabled and (keyboard is not None)

        self.debug_log_enabled = os.getenv('DICTATION_DEBUG_LOG', 'true').lower() == 'true'
        default_log_path = os.path.abspath(os.path.join(
            os.path.dirname(__file__), '..', '..', 'dictation_debug.log'
        ))
        self.debug_log_path = os.path.abspath(
            os.path.expanduser(os.getenv('DICTATION_DEBUG_LOG_PATH', default_log_path))
        )
        self.debug_logger = self._create_debug_logger()
        self.trace(
            'daemon_initialized',
            enabled=self.enabled,
            hotkey_background=self.hotkey_background,
            hotkey_foreground=self.hotkey_foreground,
            hold_threshold_ms=round(self.hold_threshold_seconds * 1000),
        )

    def _create_debug_logger(self):
        if not self.debug_log_enabled:
            return None
        try:
            os.makedirs(os.path.dirname(self.debug_log_path), exist_ok=True)
            logger = logging.getLogger(f'justcode.dictation.{os.getpid()}')
            logger.setLevel(logging.DEBUG)
            logger.propagate = False
            if not logger.handlers:
                handler = RotatingFileHandler(
                    self.debug_log_path,
                    maxBytes=2 * 1024 * 1024,
                    backupCount=3,
                    encoding='utf-8',
                )
                handler.setFormatter(logging.Formatter('%(message)s'))
                logger.addHandler(handler)
            return logger
        except Exception as error:
            print(f"[Dictation] Could not initialize debug log: {error}")
            return None

    def trace(self, event, session_id=None, **details):
        """Writes one structured, timestamped dictation event for race diagnosis."""
        if self.debug_logger is None:
            return
        record = {
            'time': datetime.now().astimezone().isoformat(timespec='milliseconds'),
            'monotonic_ms': round(time.monotonic() * 1000),
            'pid': os.getpid(),
            'thread': threading.current_thread().name,
            'event': event,
        }
        if session_id is not None:
            record['session_id'] = session_id
        record.update(details)
        try:
            self.debug_logger.debug(json.dumps(record, ensure_ascii=False, default=str))
        except Exception:
            pass

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
            if NSWorkspace is not None:
                try:
                    front_app = NSWorkspace.sharedWorkspace().frontmostApplication()
                    if front_app is not None:
                        app_name = front_app.localizedName()
                        bundle_id = front_app.bundleIdentifier()
                        if app_name:
                            self.trace('frontmost_app_captured', app_name=str(app_name), bundle_id=str(bundle_id) if bundle_id else None, source='AppKit')
                            return str(app_name), (str(bundle_id) if bundle_id else None)
                except Exception as e:
                    print(f"[Dictation] Fast frontmost-app lookup failed: {e}")

            # Compatibility fallback for environments where AppKit cannot
            # resolve the active GUI session.
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
                        self.trace('frontmost_app_captured', app_name=appName, bundle_id=appBundle or None, source='AppleScript')
                        return appName, (appBundle if appBundle else None)
            except Exception as e:
                print(f"[Dictation] Failed to get frontmost app: {e}")
                self.trace('frontmost_app_capture_failed', error=repr(e))
        self.trace('frontmost_app_missing')
        return None, None

    def restore_and_paste(self, text, saved_app_name=None, saved_bundle_id=None):
        """Restores the original application window and pastes the transcribed text."""
        target_bundle_id = saved_bundle_id or self.saved_bundle_id
        target_app_name = saved_app_name or self.saved_app_name
        copied = False

        # Copy only when there is a transcript. Empty/cancelled sessions still
        # restore focus because Chrome may have been brought forward to stop.
        if text and pyperclip is not None:
            try:
                pyperclip.copy(text)
                copied = True
                time.sleep(0.01)
            except Exception as e:
                print(f"[Dictation] Clipboard copy failed: {e}")
                self.trace('clipboard_copy_failed', error=repr(e))

        system = platform.system()
        if system == 'Darwin':
            if target_bundle_id:
                activation = f'tell application id "{target_bundle_id}" to activate'
            elif target_app_name:
                escaped_app_name = target_app_name.replace('"', '\\"')
                activation = f'tell application "{escaped_app_name}" to activate'
            else:
                activation = ''

            paste = '''
                tell application "System Events"
                    key code 9 using command down
                end tell
            ''' if text and copied else ''
            script = f'''
                {activation}
                delay 0.12
                {paste}
            '''

            self.trace(
                'restore_started',
                target_app_name=target_app_name,
                target_bundle_id=target_bundle_id,
                paste=bool(paste),
                text_length=len(text or ''),
            )
            try:
                result = subprocess.run(
                    ['osascript', '-e', script],
                    capture_output=True,
                    text=True,
                    timeout=2,
                )
                self.trace(
                    'restore_finished',
                    returncode=result.returncode,
                    stderr=result.stderr.strip()[:500],
                )
            except Exception as e:
                print(f"[Dictation] Failed to paste via AppleScript: {e}")
                self.trace('restore_failed', error=repr(e))
        else:
            try:
                if text and copied and keyboard is not None:
                    from pynput.keyboard import Controller, Key
                    kb = Controller()
                    with kb.pressed(Key.ctrl):
                        kb.press('v')
                        kb.release('v')
            except Exception as e:
                print(f"[Dictation] Fallback paste failed: {e}")

    def matches_hotkey(self, key, target_name):
        """Checks if the event key matches a given target key name."""
        if keyboard is None:
            return False
        try:
            target = self.normalize_key_name(target_name)
            if hasattr(keyboard, 'Key') and isinstance(key, keyboard.Key):
                key_name = self.normalize_key_name(key.name)
                return key_name == target
            elif hasattr(keyboard, 'KeyCode') and isinstance(key, keyboard.KeyCode):
                if key.char:
                    return self.normalize_key_name(key.char) == target
                if target == 'f20' and getattr(key, 'vk', None) in (90, 80):
                    return True
        except Exception:
            pass
        return False

    def is_hotkey_physically_pressed(self, mode):
        """Checks the macOS hardware key state independently of pynput callbacks."""
        if platform.system() != 'Darwin':
            return True

        target = self.normalize_key_name(
            self.hotkey_background if mode == 'background' else self.hotkey_foreground
        )

        # Command, Option and Control are represented by event flags on macOS.
        # CGEventSourceKeyState is appropriate for ordinary keys, but can report
        # false for modifiers and was rejecting every legitimate hold.
        modifier_masks = {
            'cmd_r': kCGEventFlagMaskCommand,
            'alt_r': kCGEventFlagMaskAlternate,
            'ctrl_r': kCGEventFlagMaskControl,
        }
        modifier_mask = modifier_masks.get(target)
        if modifier_mask is not None and CGEventSourceFlagsState is not None:
            try:
                flags = CGEventSourceFlagsState(kCGEventSourceStateCombinedSessionState)
                return bool(flags & modifier_mask)
            except Exception:
                return True

        # F20 is a normal key rather than a modifier, so key-state polling is
        # still the correct fallback for custom configurations that use it.
        if target != 'f20' or CGEventSourceKeyState is None:
            return True

        try:
            return bool(CGEventSourceKeyState(
                kCGEventSourceStateCombinedSessionState,
                0x5A
            ))
        except Exception:
            # Fall back to pynput rather than disabling custom hotkeys if
            # Quartz becomes temporarily unavailable.
            return True

    def _finish_active_session(self, expected_session_id=None, source='release'):
        with self.lock:
            if not self.is_recording:
                return False
            if expected_session_id is not None and self.active_session_id != expected_session_id:
                return False

            session_id = self.active_session_id
            start_delivered = self.start_delivered
            if self.pending_start_timer is not None:
                self.pending_start_timer.cancel()
                self.pending_start_timer = None
            self.is_recording = False
            self.active_mode = None
            self.active_session_id = None
            self.start_delivered = False

            if start_delivered:
                suffix = " (hardware watchdog)" if source == 'watchdog' else ""
                print(f"[Dictation] Hotkey UP{suffix}. Stopping dictation...")
                sent_count = self.ws_broadcast({
                    'type': 'dictation_stop',
                    'timestamp': time.time(),
                    'sessionId': session_id
                })
                self.trace(
                    'stop_dispatched',
                    session_id,
                    source=source,
                    browser_clients=sent_count,
                )
            else:
                self.session_targets.pop(session_id, None)
                self.trace('quick_tap_ignored', session_id, source=source)
            return True

    def _watch_physical_key(self, session_id, mode):
        while True:
            time.sleep(0.025)
            with self.lock:
                if (
                    not self.is_recording or
                    self.active_session_id != session_id or
                    not self.start_delivered
                ):
                    return
            if not self.is_hotkey_physically_pressed(mode):
                self.trace('watchdog_detected_release', session_id, mode=mode)
                self._finish_active_session(session_id, source='watchdog')
                return

    def _activate_pending_session(self, session_id, mode, pressed_at):
        with self.lock:
            if (
                not self.is_recording or
                self.active_session_id != session_id or
                self.active_mode != mode
            ):
                self.trace(
                    'hold_timer_stale',
                    session_id,
                    expected_active_session=self.active_session_id,
                    active_mode=self.active_mode,
                )
                return

            physically_pressed = self.is_hotkey_physically_pressed(mode)
            self.trace('hold_threshold_reached', session_id, mode=mode, physically_pressed=physically_pressed)
            if not physically_pressed:
                self.pending_start_timer = None
                self.is_recording = False
                self.active_mode = None
                self.active_session_id = None
                self.start_delivered = False
                self.session_targets.pop(session_id, None)
                return

            # Capture only after the hold is confirmed. The in-process AppKit
            # path is fast and avoids spawning work for rejected taps.
            app_name, bundle_id = self.get_frontmost_app_info()
            if not self.is_hotkey_physically_pressed(mode):
                self.pending_start_timer = None
                self.is_recording = False
                self.active_mode = None
                self.active_session_id = None
                self.start_delivered = False
                self.trace('released_during_target_capture', session_id, mode=mode)
                return

            self.saved_app_name = app_name
            self.saved_bundle_id = bundle_id
            while len(self.session_targets) >= 32:
                stale_session_id = min(self.session_targets)
                self.session_targets.pop(stale_session_id, None)
            self.session_targets[session_id] = (app_name, bundle_id)
            self.latest_delivered_session_id = session_id

            self.pending_start_timer = None
            self.start_delivered = True
            mode_label = "Background Mode (Stay in app)" if mode == 'background' else "Foreground Mode (Switch to ChatGPT)"
            print(f"[Dictation] Hold confirmed [{mode_label}]. Starting dictation...")

            # Keep this send under the same lock as release so start and stop
            # cannot be delivered out of order by the timer/listener threads.
            sent_count = self.ws_broadcast({
                'type': 'dictation_start',
                'mode': mode,
                'switchOnStart': (mode == 'foreground'),
                'timestamp': pressed_at,
                'sessionId': session_id
            })
            self.trace(
                'start_dispatched',
                session_id,
                mode=mode,
                browser_clients=sent_count,
                target_app_name=app_name,
                target_bundle_id=bundle_id,
            )

            watchdog = threading.Thread(
                target=self._watch_physical_key,
                args=(session_id, mode),
                daemon=True
            )
            watchdog.start()

    def on_press(self, key):
        if not self.enabled or keyboard is None:
            return

        with self.lock:
            if self.is_recording:
                if (self.matches_hotkey(key, self.hotkey_background) or
                        self.matches_hotkey(key, self.hotkey_foreground)):
                    self.trace(
                        'key_down_ignored_busy',
                        self.active_session_id,
                        active_mode=self.active_mode,
                        start_delivered=self.start_delivered,
                    )
                return

            mode = None
            if self.matches_hotkey(key, self.hotkey_background):
                mode = 'background'
            elif self.matches_hotkey(key, self.hotkey_foreground):
                mode = 'foreground'

            if mode:
                self.is_recording = True
                self.active_mode = mode
                self.session_sequence += 1
                session_id = self.session_sequence
                self.active_session_id = session_id
                self.start_delivered = False
                self.saved_app_name = None
                self.saved_bundle_id = None
                pressed_at = time.time()

                timer = threading.Timer(
                    self.hold_threshold_seconds,
                    self._activate_pending_session,
                    args=(session_id, mode, pressed_at)
                )
                timer.daemon = True
                self.pending_start_timer = timer
                self.trace('key_down', session_id, mode=mode)
                timer.start()

    def on_release(self, key):
        if not self.enabled or keyboard is None:
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
                self.trace('key_up', self.active_session_id, mode=self.active_mode)
                self._finish_active_session(self.active_session_id)

    def handle_transcript_result(self, text, session_id=None, cancelled=False, superseded=False):
        """Called when the Chrome extension sends back the final transcript."""
        with self.lock:
            if session_id is not None and session_id in self.completed_session_ids:
                self.trace('duplicate_browser_result_ignored', session_id)
                return
            if session_id is not None:
                self.completed_session_ids.add(session_id)
                if len(self.completed_session_ids) > 128:
                    self.completed_session_ids = set(sorted(self.completed_session_ids)[-64:])
            target = self.session_targets.pop(session_id, None) if session_id is not None else None
            stale = (
                session_id is not None and
                self.latest_delivered_session_id is not None and
                session_id != self.latest_delivered_session_id
            )
        self.trace(
            'browser_result_received',
            session_id,
            text_length=len(text or ''),
            cancelled=bool(cancelled),
            superseded=bool(superseded),
            stale=stale,
            target_found=target is not None,
        )
        if stale or superseded:
            return

        saved_app_name, saved_bundle_id = target or (self.saved_app_name, self.saved_bundle_id)
        target_display = saved_app_name or saved_bundle_id or "active app"
        if text:
            print(f"[Dictation] Transcript received ({len(text)} chars) -> Pasting into {target_display}")
        self.restore_and_paste(text, saved_app_name, saved_bundle_id)

    def start(self):
        """Starts the background keyboard listener thread."""
        if not self.enabled:
            return

        if keyboard is None:
            print("[Dictation] Notice: pynput keyboard listener unavailable in this environment (headless/no GUI display). Dictation daemon disabled.")
            self.enabled = False
            return

        if DictationDaemon._started:
            return
        DictationDaemon._started = True

        def run_listener():
            print(f"[Dictation] Daemon active.")
            print(f"  • Stay-in-app (Background): Hold [{self.hotkey_background.upper()}]")
            print(f"  • View-screen (Foreground): Hold [{self.hotkey_foreground.upper()}]")
            print(f"  • Debug log: {self.debug_log_path}")
            self.trace('listener_started')
            try:
                with keyboard.Listener(on_press=self.on_press, on_release=self.on_release) as listener:
                    self.listener = listener
                    listener.join()
            except Exception as e:
                print(f"[Dictation] Key listener encountered an error: {e}")

        t = threading.Thread(target=run_listener, daemon=True)
        t.start()
