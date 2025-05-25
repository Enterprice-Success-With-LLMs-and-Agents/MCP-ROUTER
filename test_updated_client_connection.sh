#!/bin/bash

echo "Testing updated client API with IPv4 address..."
curl -X POST http://localhost:3000/api/text \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Hello, what is your name?"}], "model": "gpt-3.5-turbo"}' \
  -v
