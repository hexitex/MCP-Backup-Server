import fs from 'fs';
import { spawn } from 'child_process';

// Create a request to the MCP server
const request = {
  jsonrpc: '2.0',
  method: 'tools/call',
  params: {
    name: 'backup_list_all',
    arguments: {
      include_emergency: true
    }
  },
  id: 1
};

// Spawn the MCP server process
const mcp = spawn('node', ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

// Send the request to the MCP server
mcp.stdin.write(JSON.stringify(request) + '\n');

// Collect the response from the MCP server
let responseData = '';
mcp.stdout.on('data', (data) => {
  responseData += data.toString();
});

// Handle errors
mcp.stderr.on('data', (data) => {
  console.error(`stderr: ${data}`);
});

// Process the response when the MCP server exits
mcp.on('close', (code) => {
  console.log(`MCP server exited with code ${code}`);
  
  if (responseData) {
    try {
      const response = JSON.parse(responseData);
      console.log('Response from MCP server:');
      console.log(JSON.stringify(response, null, 2));
    } catch (error) {
      console.error('Error parsing response:', error);
      console.log('Raw response:', responseData);
    }
  }
});
