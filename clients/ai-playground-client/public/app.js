// AI Model Playground Client-side Application

// Notification system
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Trigger animation
    setTimeout(() => notification.classList.add('show'), 10);
    
    // Auto-dismiss after 3 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Stream handling for text generation
async function handleTextStreamResponse(textResponse) {
    const streamEndpoint = '/api/stream-text';
    const textPrompt = document.getElementById('textPrompt').value.trim();
    const model = document.getElementById('textModel').value;
    const temperature = parseFloat(document.getElementById('temperature').value);
    const maxTokens = parseInt(document.getElementById('maxTokens').value);
    
    try {
        const eventSource = new EventSource(
            `${streamEndpoint}?prompt=${encodeURIComponent(textPrompt)}&model=${encodeURIComponent(model)}&temperature=${temperature}&maxTokens=${maxTokens}`
        );
        
        let fullResponse = '';
        
        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.content) {
                    fullResponse += data.content;
                    textResponse.textContent = fullResponse;
                }
            } catch (error) {
                console.error('Error parsing SSE message:', error);
            }
        };
        
        eventSource.onerror = (error) => {
            console.error('SSE error:', error);
            eventSource.close();
            if (!fullResponse) {
                textResponse.textContent = 'Error: Failed to get streaming response';
            }
            document.getElementById('textLoader').style.display = 'none';
        };
        
        eventSource.addEventListener('end', () => {
            eventSource.close();
            document.getElementById('textLoader').style.display = 'none';
        });
        
        return eventSource;
    } catch (error) {
        textResponse.textContent = `Error: ${error.message}`;
        document.getElementById('textLoader').style.display = 'none';
        return null;
    }
}

// Initialize tabs and functionality when document is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize tabs
    const tabElements = document.querySelectorAll('[data-bs-toggle="tab"]');
    tabElements.forEach(tabEl => {
        tabEl.addEventListener('click', function (event) {
            event.preventDefault();
            const targetId = this.getAttribute('data-bs-target');
            
            // Remove active class from all tabs and tab content
            document.querySelectorAll('.nav-link').forEach(navLink => {
                navLink.classList.remove('active');
            });
            document.querySelectorAll('.tab-pane').forEach(pane => {
                pane.classList.remove('show', 'active');
            });
            
            // Add active class to selected tab and content
            this.classList.add('active');
            document.querySelector(targetId).classList.add('show', 'active');
        });
    });
    
    // Text Generation Form
    document.getElementById('generateTextBtn').addEventListener('click', async () => {
        const textPrompt = document.getElementById('textPrompt').value.trim();
        if (!textPrompt) {
            showNotification('Please enter a prompt', 'error');
            return;
        }
        
        const textLoader = document.getElementById('textLoader');
        const textResponse = document.getElementById('textResponse');
        
        textLoader.style.display = 'block';
        textResponse.textContent = '';
        
        // Use streaming API for text generation
        const eventSource = await handleTextStreamResponse(textResponse);
        
        // If streaming setup failed, fall back to regular API
        if (!eventSource) {
            const model = document.getElementById('textModel').value;
            const temperature = parseFloat(document.getElementById('temperature').value);
            const maxTokens = parseInt(document.getElementById('maxTokens').value);
            
            try {
                const response = await fetch('/api/text', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        messages: [
                            {
                                role: 'user',
                                content: textPrompt
                            }
                        ],
                        model,
                        temperature,
                        maxTokens
                    }),
                });
                
                const result = await response.json();
                
                if (result.success === false) {
                    textResponse.textContent = `Error: ${result.error.message}`;
                    showNotification(`Error: ${result.error.message}`, 'error');
                } else if (result.data && result.data.choices && result.data.choices.length > 0) {
                    textResponse.textContent = result.data.choices[0].message.content;
                } else {
                    textResponse.textContent = JSON.stringify(result, null, 2);
                }
            } catch (error) {
                textResponse.textContent = `Error: ${error.message}`;
                showNotification(`Error: ${error.message}`, 'error');
            } finally {
                textLoader.style.display = 'none';
            }
        }
    });
    
    // Image Generation Form
    document.getElementById('generateImageBtn').addEventListener('click', async () => {
        const imagePrompt = document.getElementById('imagePrompt').value.trim();
        if (!imagePrompt) {
            showNotification('Please enter an image description', 'error');
            return;
        }
        
        const size = document.getElementById('imageSize').value;
        const n = parseInt(document.getElementById('imageCount').value);
        
        const imageLoader = document.getElementById('imageLoader');
        const imageContainer = document.getElementById('imageContainer');
        const imageResponse = document.getElementById('imageResponse');
        
        imageLoader.style.display = 'block';
        imageContainer.innerHTML = '';
        imageResponse.textContent = '';
        
        try {
            const response = await fetch('/api/image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt: imagePrompt,
                    n,
                    size
                }),
            });
            
            const result = await response.json();
            
            if (result.success === false) {
                imageResponse.textContent = `Error: ${result.error.message}`;
                showNotification(`Error: ${result.error.message}`, 'error');
            } else if (result.data && result.data.data && result.data.data.length > 0) {
                // Display each image
                result.data.data.forEach(item => {
                    if (item.url) {
                        const img = document.createElement('img');
                        img.src = item.url;
                        img.alt = 'Generated image';
                        img.className = 'image-preview mb-3';
                        imageContainer.appendChild(img);
                    }
                });
                
                imageResponse.textContent = JSON.stringify(result, null, 2);
                showNotification('Images generated successfully!', 'success');
            } else {
                imageResponse.textContent = JSON.stringify(result, null, 2);
            }
        } catch (error) {
            imageResponse.textContent = `Error: ${error.message}`;
            showNotification(`Error: ${error.message}`, 'error');
        } finally {
            imageLoader.style.display = 'none';
        }
    });
    
    // Audio Transcription Form
    document.getElementById('audioFile').addEventListener('change', function() {
        document.getElementById('transcribeBtn').disabled = !this.files.length;
    });
    
    document.getElementById('transcribeBtn').addEventListener('click', async () => {
        const fileInput = document.getElementById('audioFile');
        if (!fileInput.files.length) {
            showNotification('Please select an audio file', 'error');
            return;
        }
        
        const model = document.getElementById('audioModel').value;
        
        const speechLoader = document.getElementById('speechLoader');
        const transcriptResponse = document.getElementById('transcriptResponse');
        
        speechLoader.style.display = 'block';
        transcriptResponse.textContent = '';
        
        try {
            const formData = new FormData();
            formData.append('audio', fileInput.files[0]);
            formData.append('model', model);
            
            const response = await fetch('/api/transcribe', {
                method: 'POST',
                body: formData,
            });
            
            const result = await response.json();
            
            if (result.success === false) {
                transcriptResponse.textContent = `Error: ${result.error.message}`;
                showNotification(`Error: ${result.error.message}`, 'error');
            } else if (result.data && result.data.text) {
                transcriptResponse.textContent = result.data.text;
                showNotification('Audio transcribed successfully!', 'success');
            } else {
                transcriptResponse.textContent = JSON.stringify(result, null, 2);
            }
        } catch (error) {
            transcriptResponse.textContent = `Error: ${error.message}`;
            showNotification(`Error: ${error.message}`, 'error');
        } finally {
            speechLoader.style.display = 'none';
        }
    });
    
    // Add keyboard shortcuts
    document.addEventListener('keydown', (event) => {
        // Ctrl/Cmd + Enter to submit the active form
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            const activeTabId = document.querySelector('.tab-pane.show.active').id;
            
            if (activeTabId === 'text') {
                document.getElementById('generateTextBtn').click();
            } else if (activeTabId === 'image') {
                document.getElementById('generateImageBtn').click();
            } else if (activeTabId === 'speech' && !document.getElementById('transcribeBtn').disabled) {
                document.getElementById('transcribeBtn').click();
            }
            
            event.preventDefault();
        }
    });
    
    // Show welcome notification
    setTimeout(() => {
        showNotification('Welcome to AI Model Playground! Choose a tab to get started.', 'info');
    }, 500);
}); 