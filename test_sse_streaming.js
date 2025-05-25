// test_sse_streaming.js
const axios = require('axios');
const EventSource = require('eventsource'); // Use 'eventsource' package
const { randomUUID } = require('crypto');

const SERVER_URL = 'http://localhost:8080'; // Assuming server runs on port 8080
const SERVICE_ID = 'text_generation_service';
const OPERATION_ID = 'generateText'; // Or the specific operation_id for chat completions

const correlationId = randomUUID();
const sseUrl = `${SERVER_URL}/api/${SERVICE_ID}/sse?correlationId=${correlationId}`;
const mcpPostUrl = `${SERVER_URL}/api/${SERVICE_ID}/mcp`;

console.log(`[TestScript] Starting SSE streaming test for ${SERVICE_ID}/${OPERATION_ID}`);
console.log(`[TestScript] Correlation ID: ${correlationId}`);
console.log(`[TestScript] SSE URL: ${sseUrl}`);
console.log(`[TestScript] MCP POST URL: ${mcpPostUrl}`);

const eventSource = new EventSource(sseUrl);
let postRequestMade = false;
let streamEndedGracefully = false;

eventSource.onopen = () => {
    console.log(`[TestScript] SSE connection opened (onopen). ReadyState: ${eventSource.readyState}`);
    // It's safer to send POST after mcp_connected or ensure server handles POST before SSE fully registers
    // For now, let's wait for mcp_connected as per our design.
};

eventSource.addEventListener('mcp_connected', (event) => {
    console.log('[TestScript] Received mcp_connected:', JSON.parse(event.data));
    if (!postRequestMade) {
        postRequestMade = true;
        initiateStreamingPost();
    }
});

eventSource.addEventListener('mcp_response', (event) => {
    try {
        const data = JSON.parse(event.data);
        console.log('[TestScript] Received mcp_response:', data.content || data);
    } catch (e) {
        console.error('[TestScript] Error parsing mcp_response data:', e);
        console.log('[TestScript] Raw mcp_response data:', event.data);
    }
});

eventSource.addEventListener('mcp_stream_end', (event) => {
    console.log('[TestScript] Received mcp_stream_end:', event.data ? JSON.parse(event.data) : 'No data');
    streamEndedGracefully = true;
    eventSource.close(); // Close connection after stream end
    console.log('[TestScript] SSE connection closed after mcp_stream_end.');
    process.exit(0); // Success
});

eventSource.addEventListener('mcp_error', (event) => {
    let errorData;
    try {
        errorData = JSON.parse(event.data);
    } catch(e) {
        errorData = { error: { message: "Could not parse mcp_error: " + event.data}};
    }
    console.error('[TestScript] Received mcp_error:', errorData);
    eventSource.close();
    console.log('[TestScript] SSE connection closed due to mcp_error.');
    process.exit(1); // Failure
});

eventSource.onerror = (err) => {
    // This handles network errors or if the SSE connection itself fails
    console.error('[TestScript] EventSource onerror:', err);
    if (eventSource.readyState === EventSource.CLOSED) {
        console.log('[TestScript] EventSource connection was closed.');
    }
    // If stream hasn't ended gracefully, it's an error.
    if (!streamEndedGracefully) {
        console.error('[TestScript] Exiting due to EventSource error before stream completion.');
        process.exit(1); // Failure
    }
};

async function initiateStreamingPost() {
    console.log(`[TestScript] Sending POST request to ${mcpPostUrl} to initiate streaming...`);
    try {
        const response = await axios.post(mcpPostUrl, {
            operation_id: OPERATION_ID, 
            payload: {
                // Adjust payload for your specific text generation model/service
                model: "gpt-3.5-turbo", // Example model
                messages: [{ role: "user", content: "Tell me a short story about a robot learning to dream." }],
                // stream: true is implicit due to stream_options, but some upstreams might need it in payload
            },
            stream_options: {
                correlation_id: correlationId,
                stream_to_sse: true
            }
        });
        console.log('[TestScript] POST request successful:', response.data);
        if (!response.data.success) {
            console.error('[TestScript] SSE Initiation POST was not successful:', response.data.error || 'No error details');
            eventSource.close();
            process.exit(1);
        }
    } catch (error) {
        console.error('[TestScript] Error sending POST request:', error.response ? error.response.data : error.message);
        eventSource.close(); // Close SSE if POST fails
        process.exit(1); // Indicate failure
    }
}

// Timeout to prevent test hanging indefinitely if SSE events are not received
setTimeout(() => {
    if (!streamEndedGracefully) {
        console.error('[TestScript] Test timed out. No mcp_stream_end received.');
        eventSource.close();
        process.exit(1);
    }
}, 60000); // 60 seconds timeout

console.log('[TestScript] Script initialized. Waiting for SSE events...');

// To run this test:
// 1. Ensure the MCP server is running.
// 2. Install dependencies: npm install axios eventsource crypto
// 3. Run: node test_sse_streaming.js
