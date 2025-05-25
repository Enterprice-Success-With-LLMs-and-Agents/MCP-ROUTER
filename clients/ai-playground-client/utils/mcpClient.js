const axios = require('axios');
const FormData = require('form-data');
const logger = require('./logger');

class McpClient {
    constructor(config) {
        this.apiGatewayUrl = config.apiGatewayUrl || 'http://localhost:8080';
        this.apiKey = config.apiKey;
        
        // Initialize axios instance with default config
        this.httpClient = axios.create({
            baseURL: this.apiGatewayUrl,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            timeout: 120000 // Increase timeout to 120 seconds (2 minutes)
        });
        
        logger.info(`McpClient initialized with API Gateway URL: ${this.apiGatewayUrl}`);
    }
    
    /**
     * Send a request to the MCP Access Point
     * @param {Object} params - Request parameters
     * @param {string} params.serviceId - The service ID to route the request to
     * @param {string} params.endpoint - The endpoint to call on the service
     * @param {string} params.method - HTTP method (GET, POST, etc.)
     * @param {Object} params.body - Request body
     * @param {Object} params.headers - Additional headers
     * @returns {Promise<Object>} - The response data
     */
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
                url: `/api/${serviceId}/mcp`,
                data: {
                    operation_id: endpoint.replace(/^\//, ''),
                    payload: body
                },
                headers: {
                    ...headers
                },
                timeout: 120000 // Explicitly set timeout for this request
            });
            
            logger.info({
                event: 'request_complete',
                serviceId,
                endpoint,
                method,
                statusCode: response.status
            }, `Request to ${serviceId}/${endpoint} completed with status ${response.status}`);
            
            return response.data.data || response.data;
        } catch (error) {
            if (error.response) {
                // The request was made and the server responded with a status code
                // that falls out of the range of 2xx
                logger.error({
                    event: 'request_error',
                    serviceId,
                    endpoint,
                    method,
                    statusCode: error.response.status,
                    error: error.response.data
                }, `Server error: ${error.response.status} for ${serviceId}/${endpoint}`);
                
                throw new Error(`Server error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
            } else if (error.request) {
                // The request was made but no response was received
                logger.error({
                    event: 'request_no_response',
                    serviceId,
                    endpoint,
                    method,
                    error: error.code || 'Unknown error'
                }, `No response received from server for ${serviceId}/${endpoint}: ${error.code || 'Unknown error'}`);
                
                throw new Error(`No response received from server: ${error.code || 'Timeout or connection error'}`);
            } else {
                // Something happened in setting up the request that triggered an Error
                logger.error({
                    event: 'request_setup_error',
                    serviceId,
                    endpoint,
                    method,
                    error: error.message
                }, `Error setting up request for ${serviceId}/${endpoint}: ${error.message}`);
                
                throw new Error(`Error: ${error.message}`);
            }
        }
    }
    
    /**
     * Stream a request to the MCP Access Point
     * @param {Object} params - Request parameters
     * @param {string} params.serviceId - The service ID to route the request to
     * @param {string} params.endpoint - The endpoint to call on the service
     * @param {string} params.method - HTTP method (GET, POST, etc.)
     * @param {Object} params.body - Request body
     * @param {Object} params.headers - Additional headers
     * @param {Function} params.onData - Callback for each data chunk
     * @param {Function} params.onError - Callback for errors
     * @param {Function} params.onComplete - Callback when stream is complete
     */
    async streamRequest({ serviceId, endpoint, method = 'POST', body = {}, headers = {}, onData, onError, onComplete }) {
        try {
            logger.info({
                event: 'stream_request_start',
                serviceId,
                endpoint,
                method
            }, `Starting streaming request to ${serviceId}/${endpoint}`);
            
            // Connect to SSE endpoint for streaming
            const eventSource = new EventSource(`${this.apiGatewayUrl}/api/${serviceId}/sse`);
            
            // Send the initial request to trigger processing
            const requestId = await this.sendInitialRequest(serviceId, endpoint, body);
            
            // Set up event listeners
            eventSource.addEventListener('mcp_response', (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data && data.content) {
                        onData(data.content);
                    }
                } catch (error) {
                    logger.error({
                        event: 'stream_parse_error',
                        serviceId,
                        endpoint,
                        error: error.message
                    }, `Error parsing SSE data: ${error.message}`);
                    
                    if (onError) onError(error);
                }
            });
            
            eventSource.addEventListener('mcp_error', (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (onError) onError(new Error(data.error?.message || 'Unknown error'));
                } catch (error) {
                    if (onError) onError(error);
                }
                eventSource.close();
            });
            
            eventSource.addEventListener('end', () => {
                logger.info({
                    event: 'stream_complete',
                    serviceId,
                    endpoint
                }, `Stream completed for ${serviceId}/${endpoint}`);
                
                if (onComplete) onComplete();
                eventSource.close();
            });
            
            eventSource.onerror = (error) => {
                logger.error({
                    event: 'stream_error',
                    serviceId,
                    endpoint,
                    error: error.message || 'Unknown error'
                }, `Stream error for ${serviceId}/${endpoint}`);
                
                if (onError) onError(error);
                eventSource.close();
            };
        } catch (error) {
            logger.error({
                event: 'stream_setup_error',
                serviceId,
                endpoint,
                error: error.message
            }, `Error setting up stream for ${serviceId}/${endpoint}: ${error.message}`);
            
            if (onError) onError(error);
        }
    }
    
    /**
     * Send initial request to trigger streaming
     * @param {string} serviceId - Service ID
     * @param {string} endpoint - Endpoint
     * @param {Object} body - Request body
     * @returns {Promise<string>} - Request ID
     */
    async sendInitialRequest(serviceId, endpoint, body) {
        try {
            const response = await this.httpClient.post(`/api/${serviceId}/mcp`, {
                operation_id: endpoint.replace(/^\//, ''),
                payload: body
            });
            return response.data.requestId || '';
        } catch (error) {
            logger.error({ err: error }, 'Error sending initial request');
            throw error;
        }
    }
    
    /**
     * Transcribe audio to text
     * @param {Object} params - Transcription parameters
     * @param {Buffer} params.audioBuffer - Audio file buffer
     * @param {string} params.fileName - Original file name
     * @param {string} params.model - Transcription model to use
     * @returns {Promise<Object>} - The transcription response
     */
    async transcribeAudio({ audioBuffer, fileName, model = 'whisper-1' }) {
        try {
            logger.info({
                event: 'transcribe_start',
                fileName,
                model
            }, `Starting transcription for ${fileName} with model ${model}`);
            
            const formData = new FormData();
            formData.append('file', audioBuffer, {
                filename: fileName || 'audio.mp3',
                contentType: this.getContentTypeFromFileName(fileName)
            });
            formData.append('model', model);
            
            // For audio transcription, we might need a different approach
            // as it involves file upload which doesn't fit the standard MCP format
            const response = await axios.post(
                `${this.apiGatewayUrl}/api/audio_transcription_service/mcp`,
                {
                    operation_id: 'audio/transcriptions',
                    payload: {
                        file: audioBuffer.toString('base64'),
                        fileName: fileName,
                        model: model
                    }
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.apiKey}`
                    },
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity
                }
            );
            
            logger.info({
                event: 'transcribe_complete',
                fileName,
                model
            }, `Transcription completed for ${fileName}`);
            
            return response.data.data || response.data;
        } catch (error) {
            logger.error({
                event: 'transcribe_error',
                fileName,
                model,
                error: error.message
            }, `Transcription error for ${fileName}: ${error.message}`);
            
            if (error.response) {
                throw new Error(`Server error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
            } else if (error.request) {
                throw new Error('No response received from server');
            } else {
                throw new Error(`Error: ${error.message}`);
            }
        }
    }
    
    /**
     * Get content type based on file name
     * @param {string} fileName - The file name
     * @returns {string} - The content type
     */
    getContentTypeFromFileName(fileName) {
        if (!fileName) return 'audio/mp3';
        
        const extension = fileName.split('.').pop().toLowerCase();
        const contentTypeMap = {
            'mp3': 'audio/mp3',
            'mp4': 'audio/mp4',
            'mpeg': 'audio/mpeg',
            'mpga': 'audio/mpeg',
            'm4a': 'audio/mp4',
            'wav': 'audio/wav',
            'webm': 'audio/webm',
            'ogg': 'audio/ogg',
            'flac': 'audio/flac'
        };
        
        return contentTypeMap[extension] || 'audio/mp3';
    }
}

module.exports = { McpClient };