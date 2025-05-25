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
   API_GATEWAY_URL=http://localhost:8080  # Point to your MCP Access Point
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
API_GATEWAY_URL=http://localhost:8080
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

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request 