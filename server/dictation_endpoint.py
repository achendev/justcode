import json
from flask import request, Response

def register_dictation_handlers(app, dictation_daemon, get_ws_connection_count=None):
    @app.route('/dictation/status', methods=['GET'])
    def dictation_status():
        connected_clients = get_ws_connection_count() if get_ws_connection_count else 0
        return Response(json.dumps({
            'enabled': dictation_daemon.enabled,
            'hotkey': getattr(dictation_daemon, 'hotkey_name', getattr(dictation_daemon, 'hotkey_background', '')),
            'hotkey_background': getattr(dictation_daemon, 'hotkey_background', ''),
            'hotkey_foreground': getattr(dictation_daemon, 'hotkey_foreground', ''),
            'is_recording': dictation_daemon.is_recording,
            'hold_threshold_ms': round(dictation_daemon.hold_threshold_seconds * 1000),
            'pending_activation': dictation_daemon.pending_start_timer is not None,
            'start_delivered': dictation_daemon.start_delivered,
            'bridge_connected': connected_clients > 0,
            'connected_clients': connected_clients,
            'debug_log_enabled': getattr(dictation_daemon, 'debug_log_enabled', False),
            'debug_log_path': getattr(dictation_daemon, 'debug_log_path', None),
        }), mimetype='application/json')

    @app.route('/dictation/trigger', methods=['POST'])
    def dictation_trigger():
        """Allows triggering start/stop dictation via HTTP/CLI if desired."""
        data = request.get_json(force=True, silent=True) or {}
        action = data.get('action')
        
        if action == 'start':
            if hasattr(dictation_daemon, 'get_frontmost_app_info'):
                dictation_daemon.saved_app_name, dictation_daemon.saved_bundle_id = dictation_daemon.get_frontmost_app_info()
            dictation_daemon.ws_broadcast({'type': 'dictation_start'})
            return Response("Dictation started", mimetype='text/plain')
        elif action == 'stop':
            dictation_daemon.ws_broadcast({'type': 'dictation_stop'})
            return Response("Dictation stopped", mimetype='text/plain')
        
        return Response("Invalid action (use 'start' or 'stop')", status=400, mimetype='text/plain')
