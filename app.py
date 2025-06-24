from flask import Flask
from flask_cors import CORS

from server.get_code_endpoint import get_code
from server.deploy_code_endpoint import deploy_code
from server.rollback_endpoint import rollback

app = Flask(__name__)
CORS(app)

# Register routes from endpoint modules
app.add_url_rule('/getcode', 'get_code', get_code, methods=['GET'])
app.add_url_rule('/deploycode', 'deploy_code', deploy_code, methods=['POST'])
app.add_url_rule('/rollback', 'rollback', rollback, methods=['POST'])

if __name__ == '__main__':
    print("Starting JustCode server on http://127.0.0.1:5010")
    print("CORS is enabled for all origins.")
    print("WARNING: This server can read and write files on your system. Use with caution.")
    app.run(host='127.0.0.1', port=5010, debug=True)