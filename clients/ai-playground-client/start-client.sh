#!/bin/bash

# Start AI Playground Client with logging
echo "Starting AI Playground Client..."

# Create logs directory if it doesn't exist
mkdir -p logs

# Get current date for log file naming
DATE=$(date +"%Y-%m-%d")
LOG_FILE="logs/ai-playground-client-$DATE.log"
ERROR_LOG="logs/ai-playground-client-error-$DATE.log"

echo "Starting AI Playground Client with logging to $LOG_FILE"
echo "Errors will be logged to $ERROR_LOG"

# Kill any existing instances
pkill -f "node index.js" || true

# Start the client with logging
node index.js 2>&1 | tee -a "$LOG_FILE"

# Check exit status
if [ $? -ne 0 ]; then
    echo "AI Playground Client failed to start. Check logs for details."
    exit 1
fi 