import os
from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv

from server.get_context_endpoint import get_context
from server.deploy_code_endpoint import deploy_code
from server.rollback_endpoint import rollback

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
CORS(app)

# Register routes from endpoint modules
app.add_url_rule('/getcontext', 'get_context', get_context, methods=['GET'])
app.add_url_rule('/deploycode', 'deploy_code', deploy_code, methods=['POST'])
app.add_url_rule('/rollback', 'rollback', rollback, methods=['POST'])

if __name__ == '__main__':
    # Get host and port from environment variables or use defaults
    host = os.getenv('FLASK_RUN_HOST', '127.0.0.1')
    port = int(os.getenv('FLASK_RUN_PORT', 5010))
    
    # Enable debug mode only for local development for security reasons
    debug_mode = (host == '127.0.0.1')
    
    # This check prevents the startup message from printing twice when the reloader is active.
    if os.environ.get('WERKZEUG_RUN_MAIN') != 'true':
        print(f"Starting JustCode server on http://{host}:{port}")
        print("CORS is enabled for all origins.")
        if not debug_mode:
            print("Production mode is enabled (debug mode is off).")
        else:
            print("Debug mode is on.")
        print("WARNING: This server can read and write files on your system. Use with caution.")
    
    app.run(host=host, port=port, debug=debug_mode)