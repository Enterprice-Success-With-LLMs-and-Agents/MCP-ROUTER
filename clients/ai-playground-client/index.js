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
    apiGatewayUrl: process.env.API_GATEWAY_URL || 'http://localhost:8080',
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
        
        logger.info({
            event: 'text_generation_request',
            model,
            stream: !!stream,
            messageCount: messages.length
        }, `Processing text generation request with model ${model || 'gpt-3.5-turbo'}`);
        
        if (stream) {
            // Set headers for SSE
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            
            // Stream the response
            mcpClient.streamRequest({
                serviceId: 'text_generation_service',
                endpoint: 'v1/chat/completions',
                method: 'POST',
                body: {
                    messages,
                    model: model || 'gpt-3.5-turbo',
                    stream: true
                },
                onData: (chunk) => {
                    res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
                },
                onError: (error) => {
                    logger.error({ err: error }, 'Streaming error in text generation');
                    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
                    res.end();
                },
                onComplete: () => {
                    logger.info('Streaming text generation completed successfully');
                    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
                    res.end();
                }
            });
        } else {
            // Get a complete response
            const response = await mcpClient.sendRequest({
                serviceId: 'text_generation_service',
                endpoint: 'v1/chat/completions',
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
            
            res.json({
                success: true,
                data: response
            });
        }
    } catch (error) {
        logger.error({ 
            err: error,
            event: 'text_generation_error',
            errorMessage: error.message
        }, `Text generation error: ${error.message}`);
        
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Image generation API
app.post('/api/image', async (req, res) => {
    try {
        const { prompt, n, size, model } = req.body;
        
        if (!prompt) {
            return res.status(400).json({
                success: false,
                error: 'No prompt provided'
            });
        }
        
        const response = await mcpClient.sendRequest({
            serviceId: 'image_generation_service',
            endpoint: 'v1/images/generations',
            method: 'POST',
            body: {
                prompt,
                n: n || 1,
                size: size || '512x512',
                model: model || 'dall-e-3'
            }
        });
        
        res.json({
            success: true,
            data: response
        });
    } catch (error) {
        logger.error({ err: error }, 'Image generation error');
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Audio transcription API
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No audio file provided'
            });
        }
        
        const model = req.body.model || 'whisper-1';
        
        // Use the transcribe method from the McpClient
        const response = await mcpClient.transcribeAudio({
            audioBuffer: req.file.buffer,
            fileName: req.file.originalname,
            model
        });
        
        res.json({
            success: true,
            data: response
        });
    } catch (error) {
        logger.error({ err: error }, 'Transcription error');
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    logger.error({ err }, 'Server error');
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

// Start the server
app.listen(port, () => {
    logger.info(`AI Model Playground Hub running at http://localhost:${port}`);
    logger.info(`Connected to MCP Access Point at ${process.env.API_GATEWAY_URL || 'http://localhost:8080'}`);
});