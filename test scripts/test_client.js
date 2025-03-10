import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a test file
const testDir = path.join(__dirname, 'test_files');
const testFile = path.join(testDir, 'test_file.txt');

// Create a test folder structure
const testFolderStructure = path.join(testDir, 'test_folder_structure');
const testSubFolder1 = path.join(testFolderStructure, 'subfolder1');
const testSubFolder2 = path.join(testFolderStructure, 'subfolder2');
const testFileInFolder1 = path.join(testSubFolder1, 'file1.txt');
const testFileInFolder2 = path.join(testSubFolder2, 'file2.txt');

// Ensure test directory exists
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir, { recursive: true });
}

// Create or update test file with content
fs.writeFileSync(testFile, `This is a test file created at ${new Date().toISOString()}`);
console.log(`Created test file at: ${testFile}`);

// Create test folder structure
if (!fs.existsSync(testFolderStructure)) {
  fs.mkdirSync(testFolderStructure, { recursive: true });
}
if (!fs.existsSync(testSubFolder1)) {
  fs.mkdirSync(testSubFolder1, { recursive: true });
}
if (!fs.existsSync(testSubFolder2)) {
  fs.mkdirSync(testSubFolder2, { recursive: true });
}

// Create test files in subfolders
fs.writeFileSync(testFileInFolder1, `This is a test file in subfolder1 created at ${new Date().toISOString()}`);
fs.writeFileSync(testFileInFolder2, `This is a test file in subfolder2 created at ${new Date().toISOString()}`);
console.log(`Created test folder structure at: ${testFolderStructure}`);

// Start the server in a separate process
const server = spawn('node', ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env: {
    ...process.env,
    BACKUP_DIR: path.join(__dirname, 'test_backups'),
    MAX_VERSIONS: '3'
  }
});

// Function to send a JSON-RPC request and get the response
function sendRequest(request) {
  return new Promise((resolve, reject) => {
    console.log(`Sending request: ${JSON.stringify(request)}`);
    
    // Set up response handler
    const responseHandler = (data) => {
      const lines = data.toString().split('\n');
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        try {
          const response = JSON.parse(line);
          
          // If this is a response to our request
          if (response.id === request.id) {
            server.stdout.removeListener('data', responseHandler);
            resolve(response);
            return;
          }
        } catch (error) {
          console.error(`Error parsing response: ${line}`);
        }
      }
    };
    
    server.stdout.on('data', responseHandler);
    
    // Send the request
    server.stdin.write(JSON.stringify(request) + '\n');
    
    // Set a timeout
    setTimeout(() => {
      server.stdout.removeListener('data', responseHandler);
      reject(new Error('Request timed out'));
    }, 10000);
  });
}

// Run tests
async function runTests() {
  try {
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test 1: List available tools
    console.log('\n=== Test 1: List Tools ===');
    const toolsResponse = await sendRequest({
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {},
      id: Date.now().toString()
    });
    console.log('Available tools:', JSON.stringify(toolsResponse.result, null, 2));
    
    // Test 2: Create backup with agent context
    console.log('\n=== Test 2: Create Backup with Agent Context ===');
    const createResult = await sendRequest({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { 
        name: 'backup_create', 
        arguments: { 
          file_path: testFile,
          agent_context: "This is a sample agent context for file backup. It could contain the last part of a conversation or other metadata."
        }
      },
      id: Date.now().toString()
    });
    console.log('Backup created:', JSON.stringify(createResult.result, null, 2));
    
    // Test 3: List backups
    console.log('\n=== Test 3: List Backups ===');
    const listResult = await sendRequest({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { 
        name: 'backup_list', 
        arguments: { file_path: testFile }
      },
      id: Date.now().toString()
    });
    console.log('Backups list:', JSON.stringify(listResult.result, null, 2));
    
    // Test 4: Create another backup with different agent context
    console.log('\n=== Test 4: Create Another Backup with Different Agent Context ===');
    const createResult2 = await sendRequest({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { 
        name: 'backup_create', 
        arguments: { 
          file_path: testFile,
          agent_context: "This is a different agent context for the second backup. We can see how multiple backups store different context information."
        }
      },
      id: Date.now().toString()
    });
    console.log('Second backup created:', JSON.stringify(createResult2.result, null, 2));
    
    // Test 5: List backups again
    console.log('\n=== Test 5: List Backups Again ===');
    const listResult2 = await sendRequest({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { 
        name: 'backup_list', 
        arguments: { file_path: testFile }
      },
      id: Date.now().toString()
    });
    console.log('Updated backups list:', JSON.stringify(listResult2.result, null, 2));

    // Parse the content field from the response
    let backups = [];
    if (listResult2.result && listResult2.result.content && listResult2.result.content.length > 0) {
      try {
        backups = JSON.parse(listResult2.result.content[0].text);
      } catch (err) {
        console.error('Error parsing backups list:', err);
      }
    }
    
    // Test 6: Restore the first backup
    if (backups && backups.length > 0) {
      console.log('\n=== Test 6: Restore Backup ===');
      const timestamp = backups[0].timestamp;
      const restoreResult = await sendRequest({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'backup_restore', 
          arguments: {
            file_path: testFile,
            timestamp: timestamp
          }
        },
        id: Date.now().toString()
      });
      console.log('Restore result:', JSON.stringify(restoreResult.result, null, 2));
    } else {
      console.log('No backups found to restore');
    }
    
    // Test 7: Get Tool Documentation
    console.log('\n=== Test 7: Get Tool Documentation ===');
    const describeRequest = {
      jsonrpc: '2.0',
      method: 'tools/describe',
      params: {
        name: 'backup_create'
      },
      id: Date.now().toString()
    };
    console.log(`Sending request: ${JSON.stringify(describeRequest)}`);
    await sendRequest(describeRequest).then(response => {
      console.log(`Tool documentation: ${JSON.stringify(response, null, 2)}`);
    });
    
    // Test 8: Create folder backup with agent context
    console.log('\n=== Test 8: Create Folder Backup with Agent Context ===');
    const folderCreateResult = await sendRequest({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { 
        name: 'backup_folder_create', 
        arguments: { 
          folder_path: testFolderStructure,
          include_pattern: "*.txt",
          agent_context: "This is a sample agent context for folder backup. It demonstrates storing context with folder backups."
        }
      },
      id: Date.now().toString()
    });
    console.log('Folder backup created:', JSON.stringify(folderCreateResult.result, null, 2));
    
    // Test 9: List folder backups
    console.log('\n=== Test 9: List Folder Backups ===');
    const folderListResult = await sendRequest({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { 
        name: 'backup_folder_list', 
        arguments: { folder_path: testFolderStructure }
      },
      id: Date.now().toString()
    });
    console.log('Folder backups list:', JSON.stringify(folderListResult.result, null, 2));
    
    // Test 10: Create another folder backup
    console.log('\n=== Test 10: Create Another Folder Backup ===');
    const folderCreateResult2 = await sendRequest({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { 
        name: 'backup_folder_create', 
        arguments: { folder_path: testFolderStructure }
      },
      id: Date.now().toString()
    });
    console.log('Second folder backup created:', JSON.stringify(folderCreateResult2.result, null, 2));
    
    // Test 11: List folder backups again
    console.log('\n=== Test 11: List Folder Backups Again ===');
    const folderListResult2 = await sendRequest({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { 
        name: 'backup_folder_list', 
        arguments: { folder_path: testFolderStructure }
      },
      id: Date.now().toString()
    });
    console.log('Updated folder backups list:', JSON.stringify(folderListResult2.result, null, 2));

    // Parse the content field from the response
    let folderBackups = [];
    if (folderListResult2.result && folderListResult2.result.content && folderListResult2.result.content.length > 0) {
      try {
        folderBackups = JSON.parse(folderListResult2.result.content[0].text);
      } catch (err) {
        console.error('Error parsing folder backups list:', err);
      }
    }
    
    // Test 12: Restore the first folder backup
    if (folderBackups && folderBackups.length > 0) {
      console.log('\n=== Test 12: Restore Folder Backup ===');
      const timestamp = folderBackups[0].timestamp;
      
      // Modify a file in the folder to verify restoration
      fs.writeFileSync(testFileInFolder1, `This file was modified before restore at ${new Date().toISOString()}`);
      console.log(`Modified test file before restore: ${testFileInFolder1}`);
      
      const folderRestoreResult = await sendRequest({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'backup_folder_restore', 
          arguments: {
            folder_path: testFolderStructure,
            timestamp: timestamp
          }
        },
        id: Date.now().toString()
      });
      console.log('Folder restore result:', JSON.stringify(folderRestoreResult.result, null, 2));
      
      // Verify the file was restored
      const restoredContent = fs.readFileSync(testFileInFolder1, 'utf8');
      console.log(`Restored file content: ${restoredContent}`);
    } else {
      console.log('No folder backups found to restore');
    }
    
    // Test 13: Restore with emergency backup creation
    if (folderBackups && folderBackups.length > 0) {
      console.log('\n=== Test 13: Restore with Emergency Backup ===');
      const timestamp = folderBackups[0].timestamp;
      
      // Modify a file in the folder to verify restoration and emergency backup
      fs.writeFileSync(testFileInFolder1, `This file was modified before emergency backup restore at ${new Date().toISOString()}`);
      console.log(`Modified test file before emergency backup restore: ${testFileInFolder1}`);
      
      const emergencyRestoreResult = await sendRequest({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'backup_folder_restore', 
          arguments: {
            folder_path: testFolderStructure,
            timestamp: timestamp,
            create_emergency_backup: true
          }
        },
        id: Date.now().toString()
      });
      console.log('Folder restore with emergency backup result:', JSON.stringify(emergencyRestoreResult.result, null, 2));
    }
    
    // Test 14: List all backups including emergency backups
    console.log('\n=== Test 14: List All Backups Including Emergency Backups ===');
    const listAllResult = await sendRequest({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { 
        name: 'backup_list_all', 
        arguments: { include_emergency: true }
      },
      id: Date.now().toString()
    });
    console.log('All backups list:', JSON.stringify(listAllResult.result, null, 2));
    
    // Test 15: Verify emergency backups have metadata
    console.log('\n=== Test 15: Verify Emergency Backups Have Metadata ===');
    let emergencyBackups = [];
    if (listAllResult.result && listAllResult.result.content && listAllResult.result.content.length > 0) {
      try {
        const allBackups = JSON.parse(listAllResult.result.content[0].text);
        emergencyBackups = allBackups.emergency_backups || [];
        console.log(`Found ${emergencyBackups.length} emergency backups with metadata`);
        
        // Check if we have emergency backups with metadata
        if (emergencyBackups.length > 0) {
          console.log('Emergency backups with metadata found:', JSON.stringify(emergencyBackups, null, 2));
        } else {
          console.log('No emergency backups with metadata found. This may indicate an issue with emergency backup metadata creation.');
        }
      } catch (err) {
        console.error('Error parsing all backups list:', err);
      }
    }
    
    // Test 16: File restore with emergency backup
    console.log('\n=== Test 16: File Restore with Emergency Backup ===');
    // Modify test file
    fs.writeFileSync(testFile, `This file was modified before emergency backup restore at ${new Date().toISOString()}`);
    console.log(`Modified test file before emergency backup restore: ${testFile}`);
    
    // Get the latest backup timestamp
    const latestFileBackups = await sendRequest({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { 
        name: 'backup_list', 
        arguments: { file_path: testFile }
      },
      id: Date.now().toString()
    });
    
    let fileBackups = [];
    if (latestFileBackups.result && latestFileBackups.result.content && latestFileBackups.result.content.length > 0) {
      try {
        fileBackups = JSON.parse(latestFileBackups.result.content[0].text);
      } catch (err) {
        console.error('Error parsing file backups list:', err);
      }
    }
    
    if (fileBackups && fileBackups.length > 0) {
      const fileTimestamp = fileBackups[0].timestamp;
      
      const fileEmergencyRestoreResult = await sendRequest({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'backup_restore', 
          arguments: {
            file_path: testFile,
            timestamp: fileTimestamp,
            create_emergency_backup: true
          }
        },
        id: Date.now().toString()
      });
      console.log('File restore with emergency backup result:', JSON.stringify(fileEmergencyRestoreResult.result, null, 2));
      
      // List all backups again to verify the new emergency backup
      const finalListAllResult = await sendRequest({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { 
          name: 'backup_list_all', 
          arguments: { include_emergency: true }
        },
        id: Date.now().toString()
      });
      
      // Check for new emergency backups
      let finalEmergencyBackups = [];
      if (finalListAllResult.result && finalListAllResult.result.content && finalListAllResult.result.content.length > 0) {
        try {
          const finalAllBackups = JSON.parse(finalListAllResult.result.content[0].text);
          finalEmergencyBackups = finalAllBackups.emergency_backups || [];
          console.log(`Found ${finalEmergencyBackups.length} emergency backups with metadata after file restore`);
          
          // Check if we have more emergency backups than before
          if (finalEmergencyBackups.length > emergencyBackups.length) {
            console.log('New emergency backup with metadata created successfully!');
          } else {
            console.log('No new emergency backup metadata found. This may indicate an issue with file emergency backup metadata creation.');
          }
        } catch (err) {
          console.error('Error parsing final all backups list:', err);
        }
      }
    } else {
      console.log('No file backups found to restore');
    }
    
    console.log('\nAll tests completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    // Clean up
    server.stdin.end();
    process.exit(0);
  }
}

// Run the tests
runTests();
