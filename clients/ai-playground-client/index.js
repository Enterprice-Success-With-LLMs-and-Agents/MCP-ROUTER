require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const { McpClient } = require('./utils/mcpClient');
const logger = require('./utils/logger');

// Initialize express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Initialize MCP client
const mcpClient = new McpClient({
    apiGatewayUrl: process.env.API_GATEWAY_URL || 'http://127.0.0.1:8080',
    apiKey: process.env.OPENAI_API_KEY
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Text generation API
app.post('/api/text', async (req, res) => {
    try {
        const { messages, model, stream } = req.body;
        
        if (!messages || !messages.length) {
            return res.status(400).json({
                success: false,
                error: 'Messages are required'
            });
        }
        
        // Generate a unique request ID for tracking
        const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        
        logger.info({
            requestId,
            event: 'text_generation_request',
            model,
            stream: !!stream,
            messageCount: messages.length,
            messages: messages.map(m => ({ role: m.role, contentLength: m.content.length }))
        }, `[${requestId}] Processing text generation request with model ${model || 'gpt-3.5-turbo'}`);
        
        // Log the API Gateway URL being used
        logger.info({
            requestId,
            apiGatewayUrl: mcpClient.apiGatewayUrl
        }, `[${requestId}] Using API Gateway URL: ${mcpClient.apiGatewayUrl}`);
        
        if (stream) {
            // Set up SSE headers
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            
            // Send an initial message to confirm the connection is working
            res.write(`data: ${JSON.stringify({ content: "Connection established. Waiting for response..." })}\n\n`);
            
            logger.info({ requestId }, `[${requestId}] SSE headers set, sending request to MCP...`);
            
            try {
                // Use a standard non-streaming request instead of streaming
                logger.info({ requestId }, `[${requestId}] Sending request to MCP with operation_id: generateText`);
                
                // Log the full request body for debugging
                logger.info({ 
                    requestId, 
                    requestBody: {
                        serviceId: 'text_generation_service',
                        endpoint: 'generateText',
                        method: 'POST',
                        body: {
                            messages,
                            model: model || 'gpt-3.5-turbo'
                        }
                    }
                }, `[${requestId}] Full request details`);
                
                const response = await mcpClient.sendRequest({
                    serviceId: 'text_generation_service',
                    endpoint: 'generateText',
                    method: 'POST',
                    body: {
                        messages,
                        model: model || 'gpt-3.5-turbo'
                    }
                });
                
                // Log the response for debugging
                logger.info({ 
                    requestId,
                    hasResponse: !!response,
                    responseType: typeof response,
                    responseKeys: response ? Object.keys(response) : [],
                    hasError: !!response?.error
                }, `[${requestId}] Received response from MCP`);
                
                // Check if the response has an error
                if (response && response.error) {
                    logger.error({ requestId, error: response.error }, `[${requestId}] Error in response: ${response.error}`);
                    res.write(`data: ${JSON.stringify({ error: response.error })}\n\n`);
                    res.write(`data: ${JSON.stringify({ done: true, error: true })}\n\n`);
                    res.end();
                    return;
                }
                
                // Simulate streaming by sending the response in chunks
                // Check if we have a response
                if (response) {
                    // Get the response content
                    let content = '';
                    
                    // Log the response structure for debugging
                    logger.info({ 
                        requestId, 
                        responseType: typeof response,
                        responseKeys: Object.keys(response),
                        hasChoices: response.choices != null,
                        hasId: response.id != null,
                        hasObject: response.object != null
                    }, `[${requestId}] Response structure`);
                    
                    // Extract content based on different possible response structures
                    if (response.choices && response.choices[0] && response.choices[0].message) {
                        content = response.choices[0].message.content;
                        logger.info({ requestId }, `[${requestId}] Extracted content from choices[0].message.content`);
                    } else if (response.content) {
                        content = response.content;
                        logger.info({ requestId }, `[${requestId}] Extracted content from response.content`);
                    } else if (typeof response === 'string') {
                        content = response;
                        logger.info({ requestId }, `[${requestId}] Using response as string directly`);
                    } else if (response.text) {
                        content = response.text;
                        logger.info({ requestId }, `[${requestId}] Extracted content from response.text`);
                    } else if (response.message) {
                        content = response.message;
                        logger.info({ requestId }, `[${requestId}] Extracted content from response.message`);
                    } else if (response.data) {
                        // Handle nested data object
                        const data = response.data;
                        logger.info({ 
                            requestId,
                            dataType: typeof data,
                            dataKeys: Object.keys(data)
                        }, `[${requestId}] Found nested data object`);
                        
                        if (data.choices && data.choices[0] && data.choices[0].message) {
                            content = data.choices[0].message.content;
                            logger.info({ requestId }, `[${requestId}] Extracted content from data.choices[0].message.content`);
                        } else if (data.content) {
                            content = data.content;
                            logger.info({ requestId }, `[${requestId}] Extracted content from data.content`);
                        } else if (typeof data === 'string') {
                            content = data;
                            logger.info({ requestId }, `[${requestId}] Using data as string directly`);
                        } else {
                            content = JSON.stringify(data);
                            logger.info({ requestId }, `[${requestId}] Converted data to JSON string`);
                        }
                    } else {
                        // Last resort: stringify the entire response
                        content = JSON.stringify(response);
                        logger.info({ requestId }, `[${requestId}] Converted entire response to JSON string`);
                    }
                    
                    // If we still have no content, provide a default message
                    if (!content) {
                        content = "I'm sorry, I couldn't extract a meaningful response from the server.";
                        logger.warn({ requestId }, `[${requestId}] No content extracted, using default message`);
                    }
                    
                    logger.info({ requestId }, `[${requestId}] Extracted content from response: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`);
                    
                    // Send the content to the client in chunks to simulate streaming
                    const chunkSize = 10; // Number of characters per chunk
                    for (let i = 0; i < content.length; i += chunkSize) {
                        const chunk = content.substring(i, i + chunkSize);
                        res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
                        // Small delay to simulate streaming
                        await new Promise(resolve => setTimeout(resolve, 50));
                    }
                    
                    // Send completion message
                    res.write(`data: ${JSON.stringify({ done: true, success: true })}\n\n`);
                    res.end();
                } else {
                    // Handle empty response
                    logger.error({ requestId }, `[${requestId}] Empty response from MCP`);
                    res.write(`data: ${JSON.stringify({ error: 'Empty response from server' })}\n\n`);
                    res.write(`data: ${JSON.stringify({ done: true, error: true })}\n\n`);
                    res.end();
                }
            } catch (error) {
                // Handle request error
                logger.error({ requestId, err: error }, `[${requestId}] Error in text generation: ${error.message}`);
                res.write(`data: ${JSON.stringify({ error: error.message, details: error.stack })}\n\n`);
                res.write(`data: ${JSON.stringify({ done: true, error: true })}\n\n`);
                res.end();
            }
        } else {
            // Get a complete response
            const response = await mcpClient.sendRequest({
                serviceId: 'text_generation_service',
                endpoint: 'generateText',
                method: 'POST',
                body: {
                    messages,
                    model: model || 'gpt-3.5-turbo'
                }
            });
            
            logger.info({
                event: 'text_generation_success',
                model
            }, 'Text generation completed successfully');
            
            return res.json({
                success: true,
                data: response.data
            });
        }
    } catch (error) {
        logger.error({ err: error }, 'Error in text generation');
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Image generation API
app.post('/api/image', async (req, res) => {
    try {
        const { prompt, model, size } = req.body;
        
        if (!prompt) {
            return res.status(400).json({
                success: false,
                error: 'Prompt is required'
            });
        }
        
        logger.info({
            event: 'image_generation_request',
            model,
            size
        }, `Processing image generation request with model ${model || 'dall-e-3'}`);
        
        const response = await mcpClient.sendRequest({
            serviceId: 'image_generation_service',
            endpoint: 'generateImage',
            method: 'POST',
            body: {
                prompt,
                model: model || 'dall-e-3',
                size: size || '1024x1024'
            }
        });
        
        logger.info({
            event: 'image_generation_success',
            model
        }, 'Image generation completed successfully');
        
        return res.json({
            success: true,
            data: response.data
        });
    } catch (error) {
        logger.error({ err: error }, 'Error in image generation');
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Audio transcription API
app.post('/api/audio/transcriptions', upload.single('file'), async (req, res) => {
    try {
        const { model } = req.body;
        const file = req.file;
        
        if (!file) {
            return res.status(400).json({
                success: false,
                error: 'File is required'
            });
        }
        
        logger.info({
            event: 'audio_transcription_request',
            model,
            fileSize: file.size,
            fileType: file.mimetype
        }, `Processing audio transcription request with model ${model || 'whisper-1'}`);
        
        // Create form data for file upload
        const formData = new FormData();
        formData.append('file', file.buffer, {
            filename: file.originalname,
            contentType: file.mimetype
        });
        formData.append('model', model || 'whisper-1');
        
        const response = await mcpClient.sendRequest({
            serviceId: 'audio_transcription_service',
            endpoint: 'transcribe',
            method: 'POST',
            body: formData,
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        });
        
        logger.info({
            event: 'audio_transcription_success',
            model
        }, 'Audio transcription completed successfully');
        
        return res.json({
            success: true,
            data: response.data
        });
    } catch (error) {
        logger.error({ err: error }, 'Error in audio transcription');
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Start the server
app.listen(port, () => {
    logger.info(`AI Model Playground Hub running at http://localhost:${port}`);
    logger.info(`Connected to MCP Access Point at ${mcpClient.apiGatewayUrl}`);
});
