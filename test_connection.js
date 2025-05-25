const axios = require('axios');

async function testConnection() {
  try {
    console.log('Testing direct connection to server...');
    const response = await axios.post(
      'http://localhost:8080/api/text_generation_service/mcp',
      {
        operation_id: 'generateText',
        payload: {
          messages: [{ role: 'user', content: 'Hello, how are you?' }],
          model: 'gpt-3.5-turbo'
        }
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('Connection successful!');
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Connection failed!');
    if (error.response) {
      console.error('Server responded with error:', error.response.status);
      console.error('Error data:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('No response received from server:', error.code || 'Unknown error');
      console.error('Request details:', error.request._currentUrl);
    } else {
      console.error('Error setting up request:', error.message);
    }
  }
}

testConnection();
