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

# Store active WebSocket connections (usually just one, the chrome extension)
ws_connections = []
# Store pending requests: { request_id: { 'event': threading.Event(), 'response': None } }
pending_requests = {}

@sock.route('/ws')
def websocket_handler(ws):
    """
    WebSocket endpoint for the Chrome Extension to connect to.
    """
    ws_connections.append(ws)
    print(f"MCP: Extension connected. Total clients: {len(ws_connections)}")
    try:
        while True:
            data = ws.receive()
            if data:
                try:
                    msg = json.loads(data)
                    # Handle response from Extension
                    if msg.get('type') == 'mcp_response':
                        req_id = msg.get('id')
                        if req_id in pending_requests:
                            pending_requests[req_id]['response'] = msg.get('text')
                            pending_requests[req_id]['event'].set()
                except Exception as e:
                    print(f"MCP: Error parsing WS message: {e}")
    except Exception:
        pass
    finally:
        if ws in ws_connections:
            ws_connections.remove(ws)
        print("MCP: Extension disconnected.")

@app.route('/mcp/prompt', methods=['POST'])
def mcp_prompt_endpoint():
    """
    HTTP Endpoint for external tools (MCP Client / Curl).
    Sends prompt to Chrome, waits for answer, returns answer.
    """
    if not ws_connections:
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
            ws_connections[-1].send(payload)
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