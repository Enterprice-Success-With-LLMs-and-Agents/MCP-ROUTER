#!/bin/bash

echo "Testing direct connection to MCP server..."
curl -s http://localhost:8080/health

echo -e "\n\nTesting text generation service..."
curl -X POST http://localhost:8080/api/text_generation_service/mcp \
  -H "Content-Type: application/json" \
  -d '{"operation_id": "generateText", "payload": {"messages": [{"role": "user", "content": "Hello, how are you?"}], "model": "gpt-3.5-turbo"}}' \
  -v
