import json
from flask import request, Response

def register_dictation_handlers(app, dictation_daemon):
    @app.route('/dictation/status', methods= ['GET'])
    def dictation_status():
        return Response(json.dumps({
            'enabled': dictation_daemon.enabled,
            'hotkey': dictation_daemon.hotkey_name,
            'is_recording': dictation_daemon.is_recording
        }), mimetype='application/json')

    @app.route('/dictation/trigger', methods= ['POST'])
    def dictation_trigger():
        """Allows triggering start/stop dictation via HTTP/CLI if desired."""
        data = request.get_json(force=True, silent=True) or {}
        action = data.get('action')
        
        if action == 'start':
            dictation_daemon.saved_frontmost_app = dictation_daemon.get_frontmost_app()
            dictation_daemon.ws_broadcast({'type': 'dictation_start'})
            return Response("Dictation started", mimetype='text/plain')
        elif action == 'stop':
            dictation_daemon.ws_broadcast({'type': 'dictation_stop'})
            return Response("Dictation stopped", mimetype='text/plain')
        
        return Response("Invalid action (use 'start' or 'stop')", status=400, mimetype='text/plain')