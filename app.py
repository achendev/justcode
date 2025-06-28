import os
from flask import Flask, request
from flask_cors import CORS
from dotenv import load_dotenv

from server.get_context_endpoint import get_context
from server.deploy_code_endpoint import deploy_code
from server.rollback_endpoint import rollback
from server.update_endpoint import update_app

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
CORS(app)

# Register routes from endpoint modules
app.add_url_rule('/getcontext', 'get_context', get_context, methods=['GET'])
app.add_url_rule('/deploycode', 'deploy_code', deploy_code, methods=['POST'])
app.add_url_rule('/rollback', 'rollback', rollback, methods=['GET', 'POST'])
app.add_url_rule('/update', 'update_app', update_app, methods=['POST'])

if __name__ == '__main__':
    # Get host and port from environment variables or use defaults
    host = os.getenv('FLASK_RUN_HOST', '127.0.0.1')
    port = int(os.getenv('FLASK_RUN_PORT', 5010))

    app.run(host=host, port=port, use_reloader=True, reloader_type="watchdog")