const axios = require('axios');
const logger = require('./logger');
const { randomUUID } = require('crypto'); // Import randomUUID

class McpClient {
    constructor(config) {
        this.apiGatewayUrl = config.apiGatewayUrl || 'http://127.0.0.1:8080';
        this.apiKey = config.apiKey;
        
        this.httpClient = axios.create({
            baseURL: this.apiGatewayUrl,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}` // This might be overridden by MCP server config
            },
            timeout: 120000 
        });
        
        logger.info(`McpClient initialized with API Gateway URL: ${this.apiGatewayUrl}`);
    }
    
    /**
     * Returns authorization headers if an API key is available
     */
    getAuthHeaders() {
        return this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {};
    }
    
    async sendRequest({ serviceId, endpoint, method = 'POST', body = {}, headers = {} }) {
        try {
            // Generate a request ID for tracking
            const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
            
            logger.info({
                requestId,
                event: 'request_start',
                serviceId,
                endpoint,
                method,
                body: JSON.stringify(body).substring(0, 200) // Log part of the body for debugging
            }, `[${requestId}] Sending request to ${serviceId}/${endpoint}`);
            
            // Construct the request payload according to MCP protocol
            const requestPayload = {
                operation_id: endpoint.replace(/^\//, ''), // e.g., "generateText" or "v1/chat/completions"
                payload: body
            };
            
            logger.info({
                requestId,
                requestPayload
            }, `[${requestId}] Full request payload: ${JSON.stringify(requestPayload)}`);
            
            const response = await this.httpClient.request({
                method,
                url: `/api/${serviceId}/mcp`, // Standard MCP endpoint
                data: requestPayload,
                headers: {
                    ...headers
                },
                timeout: 120000
            });
            
            // Log the full response for debugging
            logger.info({
                requestId,
                event: 'request_complete',
                serviceId,
                endpoint,
                method,
                statusCode: response.status,
                responseHeaders: response.headers,
                responseData: typeof response.data === 'object' ? JSON.stringify(response.data).substring(0, 500) : response.data
            }, `[${requestId}] Request to ${serviceId}/${endpoint} completed with status ${response.status}`);
            
            // Check if we have a valid response
            if (!response.data) {
                logger.warn({ requestId }, `[${requestId}] Empty response received from server`);
                return { error: 'Empty response from server' };
            }
            
            // Try to extract the data from the response based on different possible formats
            let result;
            if (response.data.data) {
                // Format: { success: true, data: {...} }
                logger.info({ requestId }, `[${requestId}] Found data in response.data.data`);
                result = response.data.data;
            } else if (response.data.success === true) {
                // Format: { success: true, content: "..." }
                logger.info({ requestId }, `[${requestId}] Found success flag in response`);
                result = response.data;
            } else if (response.data.choices) {
                // Format: { choices: [{...}] }
                logger.info({ requestId }, `[${requestId}] Found choices array in response`);
                result = response.data;
            } else {
                // Just return the whole response
                logger.info({ requestId }, `[${requestId}] Using entire response.data`);
                result = response.data;
            }
            
            // Add a default response if result is empty
            if (!result || (typeof result === 'object' && Object.keys(result).length === 0)) {
                logger.warn({ requestId }, `[${requestId}] Extracted result is empty, creating default response`);
                result = {
                    content: "I'm sorry, I received an empty response from the server. Please try again."
                };
            }
            
            return result;
        } catch (error) {
            // Standard error handling (as before)
            if (error.response) {
                logger.error({ /* ... */ }, `Server error: ${error.response.status} for ${serviceId}/${endpoint}`);
                throw new Error(`Server error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
            } else if (error.request) {
                logger.error({ /* ... */ }, `No response received from server for ${serviceId}/${endpoint}: ${error.code || 'Unknown error'}`);
                throw new Error(`No response received from server: ${error.code || 'Timeout or connection error'}`);
            } else {
                logger.error({ /* ... */ }, `Error setting up request for ${serviceId}/${endpoint}: ${error.message}`);
                throw new Error(`Error: ${error.message}`);
            }
        }
    }
    
    /**
     * Stream a request to the MCP Access Point using SSE.
     */
    async streamRequest({ serviceId, endpoint, method = 'POST', body = {}, headers = {}, onData, onError, onComplete }) {
        // Generate a unique correlation ID for this request
        const clientCorrelationId = `client-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
        
        logger.info({
            serviceId,
            endpoint,
            method,
            correlationId: clientCorrelationId
        }, `Starting streaming request to ${serviceId}/${endpoint} with correlationId ${clientCorrelationId}`);

        try {
            // 1. First, initiate the operation by sending a POST request
            logger.info(`[${clientCorrelationId}] Initiating streaming operation with POST request`);
            
            // Send the initial request to start the operation
            const initResponse = await this.sendSseInitiationRequest(serviceId, endpoint.replace(/^\//,''), body, clientCorrelationId);
            logger.info(`[${clientCorrelationId}] SSE initiation request successful:`, initResponse);
            
            // 2. Now poll for updates using the correlation ID
            let streamEnded = false;
            let pollInterval;
            
            // Helper to safely stop polling and call onComplete
            const cleanupAndComplete = () => {
                if (!streamEnded) {
                    streamEnded = true;
                    if (pollInterval) {
                        clearInterval(pollInterval);
                        pollInterval = null;
                    }
                    logger.info(`[${clientCorrelationId}] Polling stopped and onComplete called.`);
                    if (onComplete) onComplete();
                }
            };
            
            // Set up polling mechanism to check for updates
            const pollForUpdates = async () => {
                try {
                    const pollUrl = `${this.apiGatewayUrl}/api/${serviceId}/poll?correlationId=${clientCorrelationId}`;
                    const headers = {
                        'Accept': 'application/json',
                        'Cache-Control': 'no-cache'
                    };
                    
                    // Add authorization if available
                    if (this.apiKey) {
                        headers['Authorization'] = `Bearer ${this.apiKey}`;
                    }
                    
                    const response = await axios.get(pollUrl, { headers });
                    
                    if (response.status === 200 && response.data) {
                        // Process the data
                        if (response.data.event === 'mcp_response' && response.data.data) {
                            if (onData) onData(response.data.data);
                        } else if (response.data.event === 'mcp_stream_end') {
                            logger.info(`[${clientCorrelationId}] Received stream end event`);
                            cleanupAndComplete();
                        } else if (response.data.event === 'mcp_error') {
                            logger.error(`[${clientCorrelationId}] Received error event:`, response.data);
                            if (onError) onError(new Error(response.data.data?.message || 'Unknown error from server'));
                            cleanupAndComplete();
                        }
                    }
                } catch (error) {
                    logger.error(`[${clientCorrelationId}] Error polling for updates:`, error);
                    if (onError) onError(error);
                    cleanupAndComplete();
                }
            };
            
            // Start polling immediately and then at regular intervals
            await pollForUpdates();
            pollInterval = setInterval(pollForUpdates, 1000); // Poll every second

            // Add a new endpoint to handle polling on the server side
            // This will be implemented in the server code

        } catch (error) { // Catch errors from EventSource constructor itself (e.g., invalid URL)
            logger.error(`[${clientCorrelationId}] Error setting up EventSource for stream: ${error.message}`, error);
            if (onError) onError(error);
            // onComplete might not be relevant here as stream never started.
        }
    }
    
    /**
     * Helper to send the initial POST request that starts the SSE stream processing on the server.
     */
    async sendSseInitiationRequest(serviceId, operationId, payload, clientCorrelationId) {
        try {
            logger.info(`[${clientCorrelationId}] Sending initiation request with operation_id: ${operationId}`);
            
            // Log the payload for debugging
            logger.info(`[${clientCorrelationId}] Request payload:`, JSON.stringify(payload));
            
            const response = await this.httpClient.post(`/api/${serviceId}/mcp`, {
                operation_id: operationId,
                payload: payload // The actual data for the operation
                // Remove stream_options as it's not in the test_connection_native.js example
            });
            // Expecting a 2xx response with a message like "Streaming initiated..."
            if (response.status >= 200 && response.status < 300 && response.data.success) {
                return response.data;
            } else {
                throw new Error(`SSE initiation failed: Server responded with ${response.status} - ${JSON.stringify(response.data)}`);
            }
        } catch (error) {
            logger.error(`[${clientCorrelationId}] Error sending SSE initiation request:`, error);
            throw error; // Re-throw to be caught by streamRequest's catch block
        }
    }

    // transcribeAudio method (remains largely unchanged but check if it needs streaming options)
    // For now, assuming transcribeAudio is not intended to use this new SSE streaming.
    async transcribeAudio({ audioBuffer, fileName, model = 'whisper-1' }) {
        // ... (existing transcribeAudio code) ...
        // This uses sendRequest, which is non-streaming by default.
        // If transcribeAudio needed SSE streaming, it would call streamRequest.
        try {
            logger.info({
                event: 'transcribe_start',
                fileName,
                model
            }, `Starting transcription for ${fileName} with model ${model}`);
            
            // The original implementation sent a JSON payload with base64 audio.
            // This matches the server's speech_to_text_service inputSchema.
            const response = await this.sendRequest({
                serviceId: 'speech_to_text_service', // Ensure this service ID matches config
                endpoint: 'transcribeAudio', // This should match an operation_id in the service
                                              // Or, if using URI directly: '/v1/audio/transcriptions'
                method: 'POST',
                body: {
                    file: audioBuffer.toString('base64'), // As per schema: "Base64 encoded audio file content"
                    // fileName: fileName, // Schema doesn't explicitly list fileName here, but good for server logging
                    model: model,
                    // language: optional,
                    // prompt: optional
                }
            });
            
            logger.info({
                event: 'transcribe_complete',
                fileName,
                model
            }, `Transcription completed for ${fileName}`);
            
            return response; // sendRequest already extracts response.data.data or response.data
        } catch (error) {
            logger.error({
                event: 'transcribe_error',
                fileName,
                model,
                error: error.message
            }, `Transcription error for ${fileName}: ${error.message}`);
            throw error; // Let the caller handle the error
        }
    }
    
    getContentTypeFromFileName(fileName) {
        // ... (existing getContentTypeFromFileName code) ...
        if (!fileName) return 'audio/mp3';
        const extension = fileName.split('.').pop().toLowerCase();
        const contentTypeMap = { /* ... */ }; // This should be populated as in the original if needed
        return contentTypeMap[extension] || 'audio/mp3';
    }
}

module.exports = { McpClient };