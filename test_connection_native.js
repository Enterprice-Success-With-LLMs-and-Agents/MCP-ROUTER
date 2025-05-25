const http = require('http');

const options = {
  hostname: '127.0.0.1',
  port: 8080,
  path: '/api/text_generation_service/mcp',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
};

const data = JSON.stringify({
  operation_id: 'generateText',
  payload: {
    messages: [{ role: 'user', content: 'Hello, how are you?' }],
    model: 'gpt-3.5-turbo'
  }
});

console.log('Testing direct connection to server...');

const req = http.request(options, (res) => {
  console.log(`Status Code: ${res.statusCode}`);
  
  let responseData = '';
  
  res.on('data', (chunk) => {
    responseData += chunk;
  });
  
  res.on('end', () => {
    console.log('Connection successful!');
    console.log('Response data:', responseData);
  });
});

req.on('error', (error) => {
  console.error('Connection failed!');
  console.error('Error details:', error.message);
});

// Write data to request body
req.write(data);
req.end();
