import requests
import os
from mcp.server.fastmcp import FastMCP
from dotenv import load_dotenv

# Load env to get host/port if customized, otherwise default
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

HOST = os.getenv('FLASK_RUN_HOST', '127.0.0.1')
PORT = os.getenv('FLASK_RUN_PORT', '5010')
JUSTCODE_API_URL = f"http://{HOST}:{PORT}/mcp/prompt"

# Initialize the MCP Server
mcp = FastMCP("JustCode Bridge")

@mcp.tool()
def ask_justcode_agent(task: str) -> str:
    """
    Delegates a task to the JustCode Browser Agent (e.g., Gemini/AI Studio).
    
    Use this tool when:
    1. You need to verify code against the FULL project context (which the browser agent has).
    2. You need to generate large 'deployment scripts' or refactors.
    3. You want a second opinion from the model running in the browser.
    
    Args:
        task: The specific instruction or question for the browser agent.
    """
    try:
        # Forward the prompt to the running Flask server
        response = requests.post(
            JUSTCODE_API_URL, 
            json={"prompt": task}, 
            timeout=600 # 10 minute timeout for long reasoning
        )
        
        if response.status_code == 200:
            return response.text
        else:
            return f"Error from JustCode Server ({response.status_code}): {response.text}"
            
    except requests.exceptions.ConnectionError:
        return "Error: Could not connect to JustCode. Is the Flask server (app.py) running?"
    except Exception as e:
        return f"Unexpected Error: {str(e)}"

if __name__ == "__main__":
    mcp.run()