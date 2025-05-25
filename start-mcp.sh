#!/bin/bash

# Start MCP Access Point with logging
echo "Starting MCP Access Point..."

# Set environment variables
export NODE_ENV=development
export CONFIG_FILE=config.ai-playground.yaml

# Create logs directory if it doesn't exist
mkdir -p logs

# Get current date for log file naming
DATE=$(date +"%Y-%m-%d")
LOG_FILE="logs/mcp-access-point-$DATE.log"
ERROR_LOG="logs/mcp-error-$DATE.log"

echo "Starting MCP Access Point with logging to $LOG_FILE"
echo "Errors will be logged to $ERROR_LOG"

# Start the MCP Access Point with logging in background using ts-node with tsconfig-paths
nohup node -r tsconfig-paths/register -r ts-node/register ./src/main.ts 2>&1 | tee -a "$LOG_FILE" &
echo "MCP Access Point started in background (PID $!)" | tee -a "$LOG_FILE"
exit 0