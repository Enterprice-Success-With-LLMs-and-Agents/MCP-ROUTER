const axios = require('axios');
const FormData = require('form-data');
const logger = require('./logger');
const { randomUUID } = require('crypto'); // Import randomUUID

class McpClient {
    constructor(config) {
        this.apiGatewayUrl = config.apiGatewayUrl || 'http://localhost:8080';
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
    
    async sendRequest({ serviceId, endpoint, method = 'POST', body = {}, headers = {} }) {
        try {
            logger.info({
                event: 'request_start',
                serviceId,
                endpoint,
                method
            }, `Sending request to ${serviceId}/${endpoint}`);
            
            const response = await this.httpClient.request({
                method,
                url: `/api/${serviceId}/mcp`, // Standard MCP endpoint
                data: { // This is the ClientMcpRequest structure
                    operation_id: endpoint.replace(/^\//, ''), // e.g., "generateText" or "v1/chat/completions"
                    payload: body 
                },
                headers: {
                    ...headers
                },
                timeout: 120000
            });
            
            logger.info({
                event: 'request_complete',
                serviceId,
                endpoint,
                method,
                statusCode: response.status
            }, `Request to ${serviceId}/${endpoint} completed with status ${response.status}`);
            
            // Assuming server response includes { success: true, data: ... } or { success: false, error: ... }
            // And actual upstream data is in response.data.data
            return response.data.data || response.data; 
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
        const clientCorrelationId = randomUUID(); // Generate unique ID for this streaming session
        logger.info({
            event: 'stream_request_start',
            serviceId,
            endpoint,
            method,
            correlationId: clientCorrelationId
        }, `Starting streaming request to ${serviceId}/${endpoint} with correlationId ${clientCorrelationId}`);

        try {
            // 1. Establish SSE connection, passing the correlationId
            const eventSourceUrl = `${this.apiGatewayUrl}/api/${serviceId}/sse?correlationId=${clientCorrelationId}`;
            const eventSource = new EventSource(eventSourceUrl);
            
            let streamEnded = false; // Flag to prevent multiple onComplete calls

            // Helper to safely close EventSource and call onComplete
            const cleanupAndComplete = () => {
                if (!streamEnded) {
                    streamEnded = true;
                    if (eventSource.readyState !== EventSource.CLOSED) {
                        eventSource.close();
                    }
                    logger.info(`[${clientCorrelationId}] SSE stream cleanup and onComplete called.`);
                    if (onComplete) onComplete();
                }
            };

            eventSource.onopen = () => {
                logger.info(`[${clientCorrelationId}] SSE connection opened to ${eventSourceUrl}`);
                // 2. After SSE connection is open, send the initial POST request to trigger the operation
                this.sendSseInitiationRequest(serviceId, endpoint.replace(/^\//, ''), body, clientCorrelationId)
                    .then(initResponse => {
                        logger.info(`[${clientCorrelationId}] SSE initiation request successful:`, initResponse);
                        // The POST request was accepted, now wait for data over SSE.
                    })
                    .catch(initError => {
                        logger.error(`[${clientCorrelationId}] SSE initiation request failed:`, initError);
                        if (onError) onError(initError);
                        cleanupAndComplete(); // Close SSE if initiation fails
                    });
            };
            
            eventSource.addEventListener('mcp_connected', (event) => {
                // Server confirms SSE channel is registered with this correlationId
                const data = JSON.parse(event.data);
                logger.info(`[${clientCorrelationId}] MCP Connected event received:`, data);
            });

            eventSource.addEventListener('mcp_response', (event) => {
                try {
                    const data = JSON.parse(event.data);
                    // Assuming data now comes as { content: actual_chunk }
                    if (data && data.content) {
                        onData(data.content); 
                    } else if (data) { // Fallback if structure is different
                        onData(data);
                    }
                } catch (error) {
                    logger.error(`[${clientCorrelationId}] Error parsing mcp_response SSE data:`, error, "Raw data:", event.data);
                    if (onError) onError(new Error(`Error parsing SSE data: ${error.message}`));
                }
            });
            
            eventSource.addEventListener('mcp_stream_end', (event) => {
                logger.info(`[${clientCorrelationId}] MCP Stream End event received:`, event.data ? JSON.parse(event.data) : 'No data');
                cleanupAndComplete();
            });

            eventSource.addEventListener('mcp_error', (event) => {
                let errorData;
                try {
                    errorData = JSON.parse(event.data);
                } catch (e) {
                    errorData = { error: { message: "Failed to parse mcp_error event data: " + event.data } };
                }
                logger.error(`[${clientCorrelationId}] MCP Error event received:`, errorData);
                if (onError) onError(new Error(errorData.error?.message || 'Unknown SSE error from server'));
                cleanupAndComplete();
            });
            
            eventSource.onerror = (error) => {
                // This handles network errors or if the SSE connection itself fails
                logger.error(`[${clientCorrelationId}] Generic EventSource error:`, error);
                // Check if it's a real error or just a close event
                if (eventSource.readyState === EventSource.CLOSED) {
                    logger.info(`[${clientCorrelationId}] EventSource closed.`);
                } else if (onError) {
                    onError(new Error('SSE connection error or closed unexpectedly.'));
                }
                cleanupAndComplete();
            };

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
            const response = await this.httpClient.post(`/api/${serviceId}/mcp`, {
                operation_id: operationId,
                payload: payload, // The actual data for the operation
                stream_options: { // Instruct server to use SSE for this request
                    correlation_id: clientCorrelationId,
                    stream_to_sse: true
                }
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