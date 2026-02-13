import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serverPath = path.resolve(__dirname, '../dist/index.js');
console.log(`Starting server at: ${serverPath}`);

const server = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'inherit'] // pipe stdin/stdout, inherit stderr for logs
});

let buffer = '';

server.stdout.on('data', (data) => {
  buffer += data.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop(); // Keep the last partial line

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const message = JSON.parse(line);
      handleMessage(message);
    } catch (e) {
      console.log('Non-JSON output:', line);
    }
  }
});

function send(msg) {
  console.log('Client -> Server:', JSON.stringify(msg, null, 2));
  server.stdin.write(JSON.stringify(msg) + '\n');
}

let step = 0;

function handleMessage(msg) {
  console.log('Server -> Client:', JSON.stringify(msg, null, 2));

  if (step === 0 && msg.id === 1) {
    console.log('--- Initialized ---');
    step++;
    // Notify initialized
    send({
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    });
    // List tools
    send({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list'
    });
  } else if (step === 1 && msg.id === 2) {
    console.log(`--- Found ${msg.result.tools.length} tools ---`);
    msg.result.tools.forEach(t => console.log(`- ${t.name}: ${t.description}`));
    
    step++;
    // Try calling a read-only tool (get-projects)
    console.log('--- Testing "get-projects" (Read-Only) ---');
    send({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'get-projects',
        arguments: {}
      }
    });
  } else if (step === 2 && msg.id === 3) {
    console.log('--- "get-projects" Result ---');
    if (msg.error) {
      console.error('Error:', msg.error);
    } else {
      // The result content is a JSON string inside a text block
      try {
          const content = JSON.parse(msg.result.content[0].text);
          console.log(`Found ${content.length} projects.`);
      } catch (e) {
          console.log('Raw result:', msg.result.content[0].text);
      }
    }
    process.exit(0);
  }
}

// Start handshake
send({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: {
      name: 'test-client',
      version: '1.0.0'
    }
  }
});
