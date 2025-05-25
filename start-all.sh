#!/bin/bash

# Create logs directory if it doesn't exist
mkdir -p logs

# Kill any existing instances
pkill -f "ts-node/register" || true
pkill -f "node.*index.js" || true

# Load environment variables from .env file
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
  echo "Loaded environment variables from .env file"
  echo "Using OpenAI API Key: ${OPENAI_API_KEY:0:10}..."
else
  echo "No .env file found"
fi

# Set environment variables
export CONFIG_FILE=config.ai-playground.yaml
export NODE_ENV=development
export USE_MOCK=false

echo "Starting MCP Access Point..."
node -e "process.on('uncaughtException', e => { require('fs').appendFileSync('logs/uncaught-exceptions.log', new Date().toISOString() + ' ' + e.stack + '\n'); console.error('Uncaught exception:', e); }); try { require('ts-node/register'); require('./src/main'); } catch(e) { console.error('Error starting MCP Access Point:', e.stack); }" > logs/mcp-access-point-$(date +"%Y-%m-%d").log 2>&1 &

# Wait for MCP Access Point to start
sleep 3

echo "Starting AI Playground Client..."
cd clients/ai-playground-client && USE_MOCK=false node index.js > ../../logs/ai-playground-client-$(date +"%Y-%m-%d").log 2>&1 &

# Create a status HTML page
cat > logs/status.html << EOF
<!DOCTYPE html>
<html>
<head>
    <title>MCP Services Status</title>
    <meta http-equiv="refresh" content="5">
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .service { margin-bottom: 20px; padding: 10px; border: 1px solid #ccc; }
        .running { background-color: #d4edda; }
        .stopped { background-color: #f8d7da; }
        pre { background-color: #f8f9fa; padding: 10px; overflow: auto; max-height: 300px; }
    </style>
</head>
<body>
    <h1>MCP Services Status</h1>
    <p>Last updated: $(date)</p>
    
    <div class="service">
        <h2>MCP Access Point</h2>
        <p>Status: <span id="mcp-status">Checking...</span></p>
        <h3>Last 10 log entries:</h3>
        <pre>$(tail -n 10 logs/mcp-access-point-$(date +"%Y-%m-%d").log 2>/dev/null || echo "No logs available")</pre>
    </div>
    
    <div class="service">
        <h2>AI Playground Client</h2>
        <p>Status: <span id="client-status">Checking...</span></p>
        <h3>Last 10 log entries:</h3>
        <pre>$(tail -n 10 logs/ai-playground-client-$(date +"%Y-%m-%d").log 2>/dev/null || echo "No logs available")</pre>
    </div>
    
    <script>
        fetch('http://localhost:8080/health')
            .then(response => response.json())
            .then(data => {
                document.getElementById('mcp-status').textContent = 'Running';
                document.getElementById('mcp-status').parentElement.parentElement.className = 'service running';
            })
            .catch(error => {
                document.getElementById('mcp-status').textContent = 'Stopped';
                document.getElementById('mcp-status').parentElement.parentElement.className = 'service stopped';
            });
            
        fetch('http://localhost:3000')
            .then(response => response.text())
            .then(data => {
                document.getElementById('client-status').textContent = 'Running';
                document.getElementById('client-status').parentElement.parentElement.className = 'service running';
            })
            .catch(error => {
                document.getElementById('client-status').textContent = 'Stopped';
                document.getElementById('client-status').parentElement.parentElement.className = 'service stopped';
            });
    </script>
</body>
</html>
EOF

echo "Services started. Check logs in the logs directory."
echo "Status page available at: $(pwd)/logs/status.html" 