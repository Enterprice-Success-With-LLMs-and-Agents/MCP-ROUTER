# MCP Creation Framework

A robust implementation of a Message Control Protocol (MCP) framework for building scalable API gateways and service integrations with AI models and other services. This framework provides a standardized way to connect clients to various backend services through a unified protocol.

![MCP Framework Architecture](https://via.placeholder.com/800x400?text=MCP+Framework+Architecture)

## What is MCP?

The Message Control Protocol (MCP) is a standardized communication protocol designed to facilitate seamless interaction between clients and various AI services. It provides:

- **Unified Interface**: A consistent way to interact with different AI models and services
- **Service Discovery**: Automatic discovery and registration of available services
- **Protocol Conversion**: Transparent conversion between different communication protocols
- **Load Balancing**: Intelligent distribution of requests across service instances
- **Error Handling**: Standardized error reporting and recovery mechanisms

## Project Structure

This repository contains two main components:

1. **MCP Access Point** - A powerful API gateway that routes requests to various backend services
2. **AI Model Playground Client** - A demo client application that showcases how to use the MCP Access Point

```
├── src/                    # MCP Access Point source code
├── clients/                # Client implementations
│   └── ai-playground-client/ # Demo web client for AI services
├── config/                 # Configuration files
├── test/                   # Test scripts
└── logs/                   # Log files
```

## MCP Access Point

The MCP Access Point is a TypeScript-based API gateway that implements the Message Control Protocol, allowing for efficient routing and handling of requests to various backend services. It serves as the central hub for all client-server communication in the MCP ecosystem.

### Features

- **Dynamic Service Routing**: Route requests to appropriate backend services based on service IDs and operation IDs
- **Protocol Conversion**: Support for various protocols including HTTP, WebSockets, and gRPC
- **Load Balancing**: Distribute traffic across multiple service instances for high availability
- **Streaming Support**: Handle streaming requests and responses (NDJSON) for real-time applications
- **Custom Plugin System**: Extend functionality with custom plugins for authentication, logging, etc.
- **Error Handling**: Comprehensive error handling and reporting with detailed diagnostics
- **Request/Response Validation**: Validate requests and responses against OpenAPI schemas
- **Service Discovery**: Automatically discover and register new services
- **Monitoring and Metrics**: Built-in monitoring and metrics collection for performance analysis

### Core Components

- `McpServer`: Main server class that manages the Access Point and handles incoming requests
- `RequestRouter`: Routes incoming requests to appropriate handlers based on service and operation IDs
- `OpenApiParser`: Parses OpenAPI specifications to generate routes and validate requests/responses
- `LoadBalancer`: Distributes traffic across service instances using various strategies (round-robin, least connections, etc.)
- `ProtocolConverter`: Converts between different protocols to ensure seamless communication
- `StreamableHttpHandler`: Handles streaming HTTP requests and responses for real-time data transfer
- `UpstreamRequestHandler`: Manages communication with upstream services and handles retries, timeouts, etc.
- `McpService`: Represents a service that can be registered with the Access Point, including its operations and schemas

### Protocol Details

The MCP protocol uses a standardized request/response format:

**Request Format:**
```json
{
  "operation_id": "generateText",
  "payload": {
    "messages": [
      {"role": "user", "content": "Hello, how are you?"}
    ],
    "model": "gpt-4.1-mini"
  }
}
```

**Response Format:**
```json
{
  "success": true,
  "data": {
    "id": "chatcmpl-123",
    "object": "chat.completion",
    "choices": [
      {
        "index": 0,
        "message": {
          "role": "assistant",
          "content": "Hello! I'm doing well. How can I assist you today?"
        }
      }
    ]
  }
}
```

### Getting Started with MCP Access Point

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/mcp-creation-framework.git
   cd mcp-creation-framework
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure your services**
   Edit the configuration files in the `config` directory to define your services, routes, and plugins.

4. **Set environment variables**
   Create a `.env` file in the root directory with the following variables:
   ```
   PORT=8080
   NODE_ENV=development
   LOG_LEVEL=info
   OPENAI_API_KEY=your_openai_api_key_here
   ```

5. **Start the server**
   ```bash
   npm start
   ```

6. **Verify the server is running**
   The server will be available at `http://127.0.0.1:8080`. You can test it with a simple curl command:
   ```bash
   curl -X POST http://127.0.0.1:8080/api/text_generation_service/mcp \
     -H "Content-Type: application/json" \
     -d '{"operation_id":"generateText","payload":{"messages":[{"role":"user","content":"hello"}]}}'
   ```

## AI Model Playground Client

The AI Model Playground Client is a comprehensive demo application that showcases how to use the MCP Access Point to interact with various AI services. It provides a user-friendly interface for testing and exploring different AI capabilities through a unified protocol.

![AI Model Playground Client Interface](https://via.placeholder.com/800x450?text=AI+Model+Playground+Interface)

### Features

- **Text Generation**: Generate text using advanced AI models like GPT-3.5, GPT-4, and other compatible models
- **Image Generation**: Create images from text descriptions using DALL-E and similar models
- **Speech to Text**: Transcribe audio files to text using Whisper and compatible models
- **Streaming Responses**: Real-time streaming of AI model responses for immediate feedback
- **Debug Panel**: Interactive debug panel for monitoring requests, responses, and errors
- **Model Selection**: Choose from multiple AI models for each service
- **Parameter Customization**: Adjust generation parameters like temperature, tokens, etc.
- **Response History**: View and export your conversation history

### Technologies Used

- **Backend**: Express.js server that communicates with the MCP Access Point
- **Frontend**: Vanilla JavaScript, HTML, and CSS for a lightweight, fast interface
- **UI Framework**: Bootstrap for responsive and modern UI components
- **Communication**: Axios for HTTP requests and Server-Sent Events (SSE) for streaming
- **Logging**: Structured logging with Pino for better debugging and monitoring

### Client Architecture

The client follows a clean architecture pattern:

```
├── index.js                # Express server entry point
├── utils/                  # Utility functions and classes
│   ├── mcpClient.js        # Client for communicating with MCP Access Point
│   └── logger.js           # Logging utility
├── public/                 # Static frontend files
│   ├── index.html          # Main application page
│   ├── css/                # Stylesheets
│   └── js/                 # Frontend JavaScript
└── logs/                   # Application logs
```

### Getting Started with the Client

1. **Navigate to the client directory**
   ```bash
   cd clients/ai-playground-client
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file with the following configuration:
   ```
   PORT=3000
   API_GATEWAY_URL=http://127.0.0.1:8080  # Use 127.0.0.1 instead of localhost to avoid IPv6 issues
   OPENAI_API_KEY=your_openai_api_key_here
   LOG_LEVEL=info
   ```

4. **Start the client server**
   ```bash
   npm start
   # Or use the provided script
   ./start-client.sh
   ```

5. **Access the application**
   Open your browser and navigate to `http://localhost:3000`

### Client-Server Communication

The client communicates with the MCP Access Point using the following flow:

1. **Client Request**: The browser makes a request to the client server (Express.js)
2. **Client Server Processing**: The Express server formats the request according to MCP protocol
3. **MCP Communication**: The McpClient sends the formatted request to the MCP Access Point
4. **Response Handling**: The client server processes the response and returns it to the browser

For streaming responses, the client uses Server-Sent Events (SSE) to provide real-time updates to the user interface.

## Using the AI Model Playground Client

The AI Model Playground Client provides a user-friendly interface to demonstrate the capabilities of the MCP Access Point when connected to AI services. It's both an example implementation and a powerful tool for exploring AI model functionality.

![AI Model Playground UI](https://via.placeholder.com/800x500?text=AI+Model+Playground+UI+Screenshot)

### User Interface Guide

The AI Model Playground Client features a modern, intuitive interface:

![UI Components](https://via.placeholder.com/800x400?text=UI+Components+Diagram)

1. **Navigation Bar**: Switch between different AI services (Text, Image, Audio)
2. **Model Selector**: Choose from available AI models for the current service
3. **Input Area**: Enter prompts, upload files, or configure parameters
4. **Response Area**: View AI-generated responses, images, or transcriptions
5. **Debug Panel**: Toggle the debug panel by clicking the bug icon (🐞) in the top right corner
6. **Settings**: Adjust application settings and preferences

### Available Features

The client provides three main AI capabilities through a tabbed interface:

1. **Text Generation**:
   - Select an AI model (GPT-3.5 Turbo, GPT-4, GPT-4.1-mini, etc.)
   - Enter your prompt in the chat interface
   - See real-time streaming responses as the model generates text
   - View the full conversation history with user and assistant messages
   - Export conversations for later reference
   
   ![Text Generation](https://via.placeholder.com/800x300?text=Text+Generation+Screenshot)
   
2. **Image Generation**:
   - Describe the image you want to create in natural language
   - Select image size and quality settings
   - View generated images directly in the UI
   - Download images in various formats
   - Adjust generation parameters for different results
   
   ![Image Generation](https://via.placeholder.com/800x300?text=Image+Generation+Screenshot)
   
3. **Speech-to-Text**:
   - Upload audio files in various formats (MP3, WAV, M4A, etc.)
   - Transcribe spoken content to text with high accuracy
   - View transcription results with timestamps
   - Export transcriptions to text files
   
   ![Speech to Text](https://via.placeholder.com/800x300?text=Speech+to+Text+Screenshot)

### Debug Panel

The client includes a powerful debug panel for troubleshooting and development:

![Debug Panel](https://via.placeholder.com/800x300?text=Debug+Panel+Screenshot)

- **Console Logs**: View application logs in real-time
- **Network Requests**: Monitor all API requests and responses
- **Error Tracking**: See detailed error information with stack traces
- **Performance Metrics**: Track response times and resource usage

To access the debug panel, click the bug icon (🐞) in the top right corner of the application.

### Troubleshooting

#### Common Issues and Solutions

1. **Connection Errors**:
   - **Problem**: `ECONNREFUSED` or connection timeout errors
   - **Solution**: Ensure the MCP Access Point is running and accessible at the configured URL. Use `127.0.0.1` instead of `localhost` to avoid IPv6 resolution issues.
   - **Verification**: Run `curl -X GET http://127.0.0.1:8080/health` to check if the server is responding.

2. **Empty Responses**:
   - **Problem**: Receiving empty responses from the server
   - **Solution**: Check the debug panel for detailed error information. Ensure the request format matches what the server expects.
   - **Verification**: Use the debug panel to inspect the request and response payloads.

3. **API Key Issues**:
   - **Problem**: Authentication errors or API key issues
   - **Solution**: Verify your API key is correctly set in the `.env` file and is being properly passed in the requests.
   - **Verification**: Check the authorization headers in the network requests via the debug panel.

4. **Streaming Issues**:
   - **Problem**: Streaming responses not working properly
   - **Solution**: Ensure your browser supports Server-Sent Events (SSE) and that the server is correctly formatting the streaming responses.
   - **Verification**: Check the network tab in the debug panel to see if the SSE connection is established.

#### Debugging Tools

1. **Server Logs**:
   ```bash
   tail -f logs/ai-playground-client-*.log
   ```

2. **Client-Side Console**:
   Open your browser's developer tools (F12) and check the console for client-side errors.

3. **Network Monitoring**:
   Use the Network tab in your browser's developer tools to monitor requests and responses.

4. **Debug Mode**:
   Set `LOG_LEVEL=debug` in your `.env` file for more detailed logging.

### Advanced Usage

The client demonstrates several key concepts that you can leverage in your own applications:

- **Connecting to the MCP Access Point**: Use the `McpClient` class to communicate with the MCP server
- **Handling Various Response Types**: Process different types of responses (text, images, binary data)
- **Implementing Streaming**: Use Server-Sent Events (SSE) for real-time streaming responses
- **Error Handling**: Implement robust error handling and recovery mechanisms
- **Authentication**: Securely manage API keys and authentication tokens

### Extending the Client

You can extend the client to support additional AI services or features:

1. **Add New Service Types**:
   - Create a new tab in the UI for the service
   - Implement the corresponding API endpoint in `index.js`
   - Add the service to the `McpClient` class

2. **Customize the UI**:
   - Modify the HTML/CSS in the `public` directory
   - Add new UI components for specific features

3. **Enhance Functionality**:
   - Implement additional parameters for AI models
   - Add support for more response formats
   - Create custom visualizations for specific AI outputs

## Configuration

### MCP Access Point Configuration

The MCP Access Point is highly configurable through YAML files in the `config` directory:

#### Service Configuration (`config/services.yaml`)

```yaml
services:
  - id: text_generation_service
    name: Text Generation Service
    description: Provides text generation capabilities using various AI models
    baseUrl: https://api.openai.com
    operations:
      - id: generateText
        path: /v1/chat/completions
        method: POST
        inputSchema:
          type: object
          properties:
            messages:
              type: array
              items:
                type: object
            model:
              type: string
        outputSchema:
          type: object
          properties:
            choices:
              type: array
              items:
                type: object
```

#### Route Configuration (`config/routes.yaml`)

```yaml
routes:
  - path: /api/:serviceId/mcp
    handler: mcpHandler
    methods: [POST]
```

#### Plugin Configuration (`config/plugins.yaml`)

```yaml
plugins:
  - id: auth
    name: Authentication Plugin
    enabled: true
    config:
      authType: bearer
      headerName: Authorization
  - id: logging
    name: Logging Plugin
    enabled: true
    config:
      logLevel: info
      logFormat: json
```

### Environment Variables

#### MCP Access Point Environment Variables

Create a `.env` file in the root directory with the following variables:

```
PORT=8080
NODE_ENV=development
LOG_LEVEL=info
OPENAI_API_KEY=your_openai_api_key_here
```

#### AI Model Playground Client Environment Variables

Create a `.env` file in the `clients/ai-playground-client` directory with the following variables:

```
PORT=3000
API_GATEWAY_URL=http://127.0.0.1:8080
OPENAI_API_KEY=your_openai_api_key_here
LOG_LEVEL=info
```

## Development Guide

### Architecture Overview

The MCP Creation Framework follows a modular architecture pattern:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│  Client Apps    │────▶│  MCP Access     │────▶│  Backend        │
│  (Playground)   │◀────│  Point          │◀────│  Services       │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Key Components

1. **Client Layer**: Responsible for user interaction and formatting requests
2. **Access Point Layer**: Handles routing, protocol conversion, and service management
3. **Service Layer**: Provides actual functionality (AI models, databases, etc.)

### Adding New Services

To add a new service to the MCP framework:

1. **Define the service in `config/services.yaml`**:
   ```yaml
   services:
     - id: new_service_id
       name: New Service Name
       description: Description of the new service
       baseUrl: https://api.example.com
       operations:
         - id: operationName
           path: /path/to/endpoint
           method: POST
           # Define input and output schemas
   ```

2. **Implement client-side support**:
   - Add a new endpoint in the client's `index.js`
   - Create UI components for the new service
   - Implement request/response handling

3. **Test the integration**:
   - Use the debug panel to monitor requests and responses
   - Verify that the service is correctly registered with the MCP Access Point

### Contributing

Contributions to the MCP Creation Framework are welcome! Here's how you can contribute:

1. **Fork the repository**
2. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes**
4. **Run tests**:
   ```bash
   npm test
   ```
5. **Submit a pull request**

## Troubleshooting

### Common Issues

#### MCP Access Point Issues

1. **Server Won't Start**
   - **Problem**: The MCP Access Point server fails to start
   - **Solution**: Check for port conflicts, missing dependencies, or configuration errors
   - **Verification**: Check the server logs in the `logs` directory

2. **Service Registration Failures**
   - **Problem**: Services fail to register with the MCP Access Point
   - **Solution**: Verify service configuration in `config/services.yaml`
   - **Verification**: Check the server logs for registration errors

3. **Request Routing Errors**
   - **Problem**: Requests are not being routed to the correct service
   - **Solution**: Verify route configuration and service IDs
   - **Verification**: Use the debug panel to monitor request routing

#### Client Issues

1. **Connection Errors**
   - **Problem**: Client cannot connect to the MCP Access Point
   - **Solution**: Ensure the MCP Access Point is running and the `API_GATEWAY_URL` is correct
   - **Solution**: Use `127.0.0.1` instead of `localhost` to avoid IPv6 resolution issues
   - **Verification**: Use curl to test the connection: `curl -X GET http://127.0.0.1:8080/health`

2. **Empty Responses**
   - **Problem**: Client receives empty responses from the server
   - **Solution**: Check request format and ensure it matches what the server expects
   - **Solution**: Verify the `operation_id` matches what's defined in the server configuration
   - **Verification**: Use the debug panel to inspect request and response payloads

3. **Streaming Issues**
   - **Problem**: Streaming responses not working correctly
   - **Solution**: Verify SSE implementation and ensure proper event handling
   - **Verification**: Check network tab in browser developer tools

### Diagnostic Commands

```bash
# Check MCP Access Point status
curl -X GET http://127.0.0.1:8080/health

# Test a simple text generation request
curl -X POST http://127.0.0.1:8080/api/text_generation_service/mcp \
  -H "Content-Type: application/json" \
  -d '{"operation_id":"generateText","payload":{"messages":[{"role":"user","content":"hello"}]}}'

# View server logs
tail -f logs/mcp-server-*.log

# View client logs
tail -f logs/ai-playground-client-*.log
```

## Conclusion

The MCP Creation Framework provides a powerful, flexible foundation for building applications that leverage AI services. By standardizing the communication protocol and providing robust client and server implementations, it simplifies the process of integrating AI capabilities into your applications.

Whether you're building a chatbot, content generation tool, or creative assistant, the MCP framework gives you the tools you need to quickly and reliably connect to AI services while maintaining a clean separation of concerns between your client application and the underlying AI models.

### Next Steps

- Explore the example client to understand how to use the MCP protocol
- Build your own client applications using the MCP client library
- Extend the framework with new services and capabilities
- Contribute to the project by adding new features or fixing bugs

### Resources

- [API Documentation](docs/api.md)
- [Configuration Guide](docs/configuration.md)
- [Client Development Guide](docs/client-development.md)
- [Service Integration Guide](docs/service-integration.md)

---

© 2025 MCP Creation Framework Team
