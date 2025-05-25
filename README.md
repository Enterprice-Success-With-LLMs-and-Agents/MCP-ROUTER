# MCP Creation Framework

A robust implementation of a Message Control Protocol (MCP) framework for building scalable API gateways and service integrations.

## Project Structure

This repository contains two main components:

1. **MCP Access Point** - A powerful API gateway that routes requests to various backend services
2. **AI Model Playground Client** - A demo client application that showcases how to use the MCP Access Point

## MCP Access Point

The MCP Access Point is a TypeScript-based API gateway that implements the Message Control Protocol, allowing for efficient routing and handling of requests to various backend services.

### Features

- **Dynamic Service Routing**: Route requests to appropriate backend services based on service IDs
- **Protocol Conversion**: Support for various protocols including HTTP, WebSockets, and gRPC
- **Load Balancing**: Distribute traffic across multiple service instances
- **Streaming Support**: Handle streaming requests and responses (NDJSON)
- **Custom Plugin System**: Extend functionality with custom plugins
- **Error Handling**: Comprehensive error handling and reporting

### Core Components

- `McpServer`: Main server class that manages the Access Point
- `RequestRouter`: Routes incoming requests to appropriate handlers
- `OpenApiParser`: Parses OpenAPI specifications to generate routes
- `LoadBalancer`: Distributes traffic across service instances
- `ProtocolConverter`: Converts between different protocols
- `UpstreamRequestHandler`: Handles communication with upstream services
- `McpService`: Represents a service that can be registered with the Access Point

### Getting Started with MCP Access Point

1. Clone the repository
2. Install dependencies
3. Configure your services in the configuration file
4. Start the server

```bash
cd /path/to/mcp-creation-framework
npm install
npm start
```

## AI Model Playground Client

The AI Model Playground client is a demo application that demonstrates how to use the MCP Access Point to interact with various AI services.

### Features

- **Text Generation**: Generate text using AI models like GPT-3.5/4
- **Image Generation**: Create images from text descriptions
- **Speech to Text**: Transcribe audio files to text
- **Streaming Responses**: Real-time streaming of AI model responses

### Technologies Used

- Express.js for the backend server
- Vanilla JavaScript, HTML, and CSS for the frontend
- Bootstrap for UI components
- Server-Sent Events (SSE) for streaming

### Getting Started with the Client

1. Navigate to the client directory
2. Set up environment variables
3. Start the client server

```bash
cd clients/ai-playground-client
# Create a .env file with necessary configuration
# See .env.example for required variables
npm install
npm start
```

Access the client application at `http://localhost:3000`

## Using the AI Model Playground Client

The AI Model Playground Client provides a user-friendly interface to demonstrate the capabilities of the MCP Access Point when connected to AI services. It's both an example implementation and a useful tool for exploring AI model functionality.

### Installation and Setup

1. **Prerequisites**:
   - Ensure your MCP Access Point is running
   - An OpenAI API key (or compatible API key for the services you want to use)

2. **Installation**:
   ```bash
   # Clone the repository if you haven't already
   git clone https://github.com/your-username/mcp-creation-framework.git
   cd mcp-creation-framework
   
   # Install dependencies for the client
   cd clients/ai-playground-client
   npm install
   ```

3. **Configuration**:
   - Copy the example environment file to create your own configuration
   ```bash
   cp .env.example .env
   ```
   - Edit `.env` to include your actual OpenAI API key and adjust settings as needed:
   ```
   PORT=3000
   API_GATEWAY_URL=http://127.0.0.1:8080  # Point to your MCP Access Point (use 127.0.0.1 instead of localhost to avoid IPv6 issues)
   OPENAI_API_KEY=your_actual_api_key_here
   ```

4. **Starting the client**:
   ```bash
   npm start
   ```
   
5. **Access the application**: Open your browser and navigate to `http://localhost:3000`

### Available Features

The client provides three main AI capabilities through a tabbed interface:

1. **Text Generation**:
   - Select an AI model (GPT-3.5 Turbo or GPT-4)
   - Enter your prompt
   - Adjust temperature and token limits
   - View real-time streaming responses
   
2. **Image Generation**:
   - Describe the image you want to create
   - Select image size and quantity
   - View generated images directly in the UI
   
3. **Speech-to-Text**:
   - Upload audio files
   - Transcribe spoken content to text

### What to Expect

When you use the AI Model Playground Client, you can expect:

- **Unified Interface**: Access to multiple AI capabilities through a clean, consistent interface
- **Real-time Responses**: Text generation with streaming responses for immediate feedback
- **Visual Results**: Direct display of generated images without leaving the application
- **Error Handling**: Clear notifications for any issues or API limitations
- **Modern UI**: Responsive design that works on desktop and mobile devices
- **Enhanced User Experience**: Features like keyboard shortcuts, loading indicators, and customizable parameters

### Technical Implementation

The client demonstrates several key concepts:

- Connecting a frontend application to the MCP Access Point
- Handling various response types (text, images, binary data)
- Implementing streaming responses with Server-Sent Events (SSE)
- Managing API keys and authentication securely
- Converting between data formats for different AI services

#### Client-Server Communication

The client communicates with the MCP Access Point using HTTP requests. Here's how it works:

1. **Request Mapping**:
   - The client sends requests to endpoints like `/api/text` or `/api/image`
   - These requests are mapped to MCP operations (e.g., `generateText` for text generation)
   - The client uses the `McpClient` class to handle this mapping
   - **Important**: The `operation_id` in client requests must match what's defined in `config.yaml`

2. **Streaming Support**:
   - For real-time responses, the client establishes a Server-Sent Events (SSE) connection
   - The client first opens an SSE connection with a unique correlation ID
   - Then it sends a POST request to initiate streaming, referencing the correlation ID
   - The server streams responses back through the open SSE connection
   - The client listens for specific event types: `mcp_connected`, `mcp_response`, `mcp_stream_end`, and `mcp_error`

3. **Network Configuration**:
   - The client connects to the server using IPv4 (127.0.0.1) to avoid IPv6 resolution issues
   - Using `localhost` may cause `ECONNREFUSED` errors due to IPv6 resolution problems
   - This is especially important in Node.js applications where IPv6 is preferred by default

This example client can serve as a foundation for building more complex applications that leverage the MCP Access Point for AI service integration.

## Configuration

### MCP Access Point Configuration

Configure the MCP Access Point by editing the configuration files in the `config` directory:

- `config/services.yaml`: Define service registrations
- `config/routes.yaml`: Configure routing rules
- `config/plugins.yaml`: Set up plugins

### AI Model Playground Client Configuration

Create a `.env` file in the `clients/ai-playground-client` directory with the following variables:

```
PORT=3000
API_GATEWAY_URL=http://127.0.0.1:8080
OPENAI_API_KEY=your_openai_api_key
```

## Development

### Prerequisites

- Node.js 14+ and npm
- TypeScript knowledge for MCP Access Point development
- Basic JavaScript/HTML/CSS knowledge for client development

### Running in Development Mode

```bash
# For MCP Access Point
npm run dev

# For AI Model Playground Client
cd clients/ai-playground-client
npm run dev
```

## Testing

Run the automated tests:

```bash
npm test
```

For end-to-end testing, you can use the provided test script:

```bash
./test/test-e2e.sh
```

## Troubleshooting

### Client-Server Connection Issues

#### Common Connection Issues

##### ECONNREFUSED Errors

If you encounter `ECONNREFUSED` errors when the client tries to connect to the server, consider these solutions:

1. **Use IPv4 Instead of localhost**:
   - In your client configuration, use `127.0.0.1` instead of `localhost` to avoid IPv6 resolution issues
   - Update your `.env` file to use `API_GATEWAY_URL=http://127.0.0.1:8080`
   - This is a common issue in Node.js applications where IPv6 (::1) is attempted first, causing connection failures

2. **Verify Operation IDs**:
   - Ensure the `operation_id` in client requests matches what's defined in the server configuration
   - Check `config.yaml` for the correct operation_id mappings (e.g., use `generateText` instead of `v1/chat/completions`)
   - Example in config.yaml:
     ```yaml
     routes:
       - id: "generate_text_route"
         operation_id: "generateText"  # This is what your client should use
         uri: "/v1/chat/completions"   # This is the upstream URI
     ```

3. **Check Server Status**:
   - Verify the server is running: `curl http://127.0.0.1:8080/health`
   - Check for any error messages in the server logs: `tail -f logs/mcp-access-point-*.log`

4. **Test Direct Connection**:
   - Test direct connection to the server using curl:
   ```bash
   curl -X POST http://127.0.0.1:8080/api/text_generation_service/mcp \
     -H "Content-Type: application/json" \
     -d '{"operation_id": "generateText", "payload": {"messages": [{"role": "user", "content": "Hello"}], "model": "gpt-3.5-turbo"}}'
   ```

##### SSE Streaming Issues

If you encounter errors with SSE streaming such as "Error parsing SSE data":

1. **Check Event Format**:
   - Ensure the server is sending properly formatted SSE events
   - Each event should follow the format: `event: EVENT_TYPE\ndata: JSON_DATA\n\n`

2. **Verify Event Listeners**:
   - Make sure your client has listeners for all event types: `mcp_connected`, `mcp_response`, `mcp_error`, and `mcp_stream_end`
   - Add error handling for malformed event data

3. **Debug SSE Connection**:
   - Test SSE connection directly using curl:
   ```bash
   curl -N http://127.0.0.1:8080/api/text_generation_service/sse?correlationId=test-123
   ```
   - Check server logs for SSE-related errors

4. **Network Inspection**:
   - Use browser developer tools to inspect the SSE connection
   - Look for any connection issues or malformed responses

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request 