import os
import json
import uuid
import threading
from flask import Flask, request, Response
from flask_cors import CORS
from flask_sock import Sock
from dotenv import load_dotenv

from server.get_context_endpoint import get_context
from server.deploy_code_endpoint import deploy_code
from server.undo_endpoint import undo
from server.redo_endpoint import redo
from server.update_endpoint import update_app
from server.agent_endpoint import agent_execute
from server.dictation_endpoint import register_dictation_handlers
from server.tools.dictation_daemon import DictationDaemon

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
CORS(app)
sock = Sock(app)

# Register routes from endpoint modules
app.add_url_rule('/getcontext', 'get_context', get_context, methods=['GET'])
app.add_url_rule('/deploycode', 'deploy_code', deploy_code, methods=['POST'])
app.add_url_rule('/undo', 'undo', undo, methods=['GET', 'POST'])
app.add_url_rule('/redo', 'redo', redo, methods=['GET', 'POST'])
app.add_url_rule('/update', 'update_app', update_app, methods=['POST'])
app.add_url_rule('/agent/execute', 'agent_execute', agent_execute, methods=['POST'])

# --- MCP / WebSocket Bridge Logic ---

# Store active WebSocket connections and their registered responsibilities.
ws_connections = []
ws_connection_capabilities = {}
ws_connections_lock = threading.RLock()
# Store pending requests: { request_id: { 'event': threading.Event(), 'response': None } }
pending_requests = {}

def get_ws_connections(capability=None, include_unregistered=True):
    """Returns a stable snapshot, optionally filtered by client capability."""
    with ws_connections_lock:
        connections = list(ws_connections)
        if capability is None:
            return connections

        filtered = []
        for ws in connections:
            capabilities = ws_connection_capabilities.get(id(ws))
            if capability in (capabilities or set()):
                filtered.append(ws)
            elif capabilities is None and include_unregistered:
                # Preserve compatibility with extension builds predating
                # capability registration.
                filtered.append(ws)
        return filtered

def remove_ws_connection(ws):
    with ws_connections_lock:
        if ws in ws_connections:
            ws_connections.remove(ws)
        ws_connection_capabilities.pop(id(ws), None)

def ws_broadcast_json(payload_dict):
    """Broadcasts a JSON payload to active extension clients."""
    payload_str = json.dumps(payload_dict)
    sent_count = 0
    capability = 'dictation' if payload_dict.get('type', '').startswith('dictation_') else None
    for ws in get_ws_connections(capability):
        try:
            ws.send(payload_str)
            sent_count += 1
        except Exception:
            remove_ws_connection(ws)
    if payload_dict.get('type', '').startswith('dictation_') and sent_count == 0:
        print("[Dictation] Browser bridge unavailable; event was not delivered.")
    return sent_count

# Start Dictation Background Daemon strictly in the active Flask worker process
# This prevents the Werkzeug supervisor process from spawning a duplicate hotkey listener
dictation_daemon = DictationDaemon(ws_broadcast_func=ws_broadcast_json)
if os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
    dictation_daemon.start()

register_dictation_handlers(
    app,
    dictation_daemon,
    lambda: len(get_ws_connections('dictation', include_unregistered=False))
)

@sock.route('/ws')
def websocket_handler(ws):
    """
    WebSocket endpoint for the Chrome Extension to connect to.
    """
    with ws_connections_lock:
        ws_connections.append(ws)
        ws_connection_capabilities[id(ws)] = None
        connection_count = len(ws_connections)
    print(f"Bridge: Extension connected. Total clients: {connection_count}")
    try:
        while True:
            data = ws.receive()
            if data:
                try:
                    msg = json.loads(data)
                    msg_type = msg.get('type')

                    # Handle heartbeat ping
                    if msg_type == 'ping':
                        ws.send(json.dumps({'type': 'pong'}))

                    # Identify this connection so MCP and dictation cannot
                    # consume one another's messages when both use this server.
                    elif msg_type == 'register':
                        requested = msg.get('capabilities', [])
                        capabilities = {
                            value for value in requested
                            if isinstance(value, str) and value in {'mcp', 'dictation'}
                        } if isinstance(requested, list) else set()
                        with ws_connections_lock:
                            ws_connection_capabilities[id(ws)] = capabilities
                        ws.send(json.dumps({
                            'type': 'registered',
                            'capabilities': sorted(capabilities)
                        }))
                        print(f"Bridge: Registered {', '.join(sorted(capabilities)) or 'no capabilities'}.")
                        if 'dictation' in capabilities:
                            dictation_daemon.trace(
                                'browser_bridge_registered',
                                connected_clients=len(get_ws_connections('dictation', include_unregistered=False)),
                            )

                    # Handle response from Extension
                    elif msg_type == 'mcp_response':
                        req_id = msg.get('id')
                        if req_id in pending_requests:
                            pending_requests[req_id]['response'] = msg.get('text')
                            pending_requests[req_id]['event'].set()

                    # Handle Dictation Transcript Result
                    elif msg_type == 'dictation_result':
                        transcript_text = msg.get('text', '')
                        dictation_daemon.handle_transcript_result(
                            transcript_text,
                            msg.get('sessionId'),
                            msg.get('cancelled', False),
                            msg.get('superseded', False),
                        )

                    elif msg_type == 'dictation_debug':
                        details = msg.get('details')
                        if not isinstance(details, dict):
                            details = {}
                        safe_details = {
                            str(key)[:80]: value
                            for key, value in list(details.items())[:30]
                        }
                        dictation_daemon.trace(
                            f"browser.{str(msg.get('event') or 'unknown')[:120]}",
                            msg.get('sessionId'),
                            **safe_details,
                        )

                except Exception as e:
                    print(f"Bridge: Error processing WebSocket message: {e}")
                    dictation_daemon.trace('browser_message_error', error=repr(e))
    except Exception as e:
        dictation_daemon.trace('browser_socket_closed', error=repr(e))
    finally:
        with ws_connections_lock:
            disconnected_capabilities = ws_connection_capabilities.get(id(ws))
        remove_ws_connection(ws)
        if 'dictation' in (disconnected_capabilities or set()):
            dictation_daemon.trace('browser_bridge_disconnected')
        print("Bridge: Extension disconnected.")

@app.route('/mcp/prompt', methods=['POST'])
def mcp_prompt_endpoint():
    """
    HTTP Endpoint for external tools (MCP Client / Curl).
    Sends prompt to Chrome, waits for answer, returns answer.
    """
    mcp_connections = get_ws_connections('mcp')
    if not mcp_connections:
        return Response("Error: JustCode Chrome Extension is not connected via WebSocket.", status=503, mimetype='text/plain')

    try:
        req_data = request.get_json(force=True)
        user_prompt = req_data.get('prompt')
        if not user_prompt:
            return Response("Error: Missing 'prompt' field in JSON.", status=400, mimetype='text/plain')

        req_id = str(uuid.uuid4())
        event = threading.Event()
        
        # Store handle to wait
        pending_requests[req_id] = {
            'event': event,
            'response': None
        }

        # Broadcast payload to extension
        payload = json.dumps({
            'type': 'mcp_request',
            'id': req_id,
            'prompt': user_prompt
        })
        
        # Send to latest connection (most likely the active one)
        try:
            mcp_connections[-1].send(payload)
        except Exception as e:
            return Response(f"Error sending to extension: {str(e)}", status=500, mimetype='text/plain')

        # Wait for response (timeout 5 minutes for long generations)
        is_set = event.wait(timeout=300) 
        
        result = pending_requests.pop(req_id, None)
        
        if not is_set:
            return Response("Error: Timeout waiting for LLM response.", status=504, mimetype='text/plain')
        
        return Response(result['response'], mimetype='text/plain')

    except Exception as e:
        return Response(f"Server Error: {str(e)}", status=500, mimetype='text/plain')

if __name__ == '__main__':
    # Get host and port from environment variables or use defaults
    host = os.getenv('FLASK_RUN_HOST', '127.0.0.1')
    port = int(os.getenv('FLASK_RUN_PORT', 5010))

    # Note: threaded=True is required for threading.Event() to work with Flask dev server
    app.run(host=host, port=port, use_reloader=True, reloader_type="watchdog", threaded=True)
