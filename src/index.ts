#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { promises as fsPromises } from 'fs';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema,
  ToolSchema 
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import os from 'os';
import { minimatch } from 'minimatch';
import { 
  BackupCreateSchema, 
  BackupListSchema, 
  BackupRestoreSchema,
  BackupFolderCreateSchema,
  BackupFolderListSchema,
  BackupFolderRestoreSchema,
  ListAllBackupsSchema,
  CancelSchema,
  toolDescriptions 
} from './toolDescriptions.js';
import { 
  BackupMetadata, 
  BackupFolderMetadata, 
  BackupResult, 
  Operation 
} from './types.js';
import { 
  checkOperationCancelled, 
  formatJsonResponse, 
  formatErrorResponse, 
  validateRequiredParams,
  validateFileExists,
  validateFolderExists,
  exists
} from './utils.js';

// Type for tool input
const ToolInputSchema = ToolSchema.shape.inputSchema;
type ToolInput = z.infer<typeof ToolInputSchema>;

// Create a local ensureDirectoryExists function to avoid conflict with the imported one
async function ensureBackupDirectoryExists(dirPath: string): Promise<void> {
  try {
    await fsPromises.mkdir(dirPath, { recursive: true });
  } catch (error) {
    console.error(`Error creating directory ${dirPath}:`, error);
    throw error;
  }
}

// Constants
const SERVER_VERSION = '1.0.0';
const SERVER_NAME = 'backup-mcp-server';
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(os.homedir(), '.code_backups');
const MAX_VERSIONS = parseInt(process.env.MAX_VERSIONS || '10', 10);
const EMERGENCY_BACKUP_DIR = process.env.EMERGENCY_BACKUP_DIR || path.join(os.homedir(), '.code_emergency_backups');

// Normalize backup directory paths for Windows
const BACKUP_DIR_NORMALIZED = path.normalize(BACKUP_DIR);
const EMERGENCY_BACKUP_DIR_NORMALIZED = path.normalize(EMERGENCY_BACKUP_DIR);

// Track current operation
let currentOperationId: string | null = null;

// Map to track operations
const operations = new Map<string, Operation>();

// Report progress for an operation
function reportProgress(operationId: string, progress: number): void {
  // Only report progress if operationId is valid
  if (operationId) {
    console.error(`Operation ${operationId} progress: ${progress}%`);
  }
}

// Update operation progress safely
function updateOperationProgress(operationId: string, progress: number): void {
  const operation = operations.get(operationId);
  if (operation) {
    operation.progress = progress;
  }
}

// Helper function to report progress
function logProgress(progress: number): void {
  if (currentOperationId) {
    updateOperationProgress(currentOperationId, progress);
    reportProgress(currentOperationId, progress);
  }
}

// Generate a backup folder name
function getBackupFolderName(folderPath: string, timestamp: string): string {
  const folderName = path.basename(folderPath);
  return `${folderName}.${timestamp}`;
}

// Create a new operation
function createOperation(type: string, params: any): Operation {
  const id = crypto.randomUUID();
  const operation: Operation = {
    id,
    type,
    progress: 0,
    cancelled: false,
    status: 'running'
  };
  operations.set(id, operation);
  return operation;
}

// Cancel operation
function cancelOperation(operationId: string): boolean {
  const operation = operations.get(operationId);
  if (operation) {
    operation.cancelled = true;
    return true;
  }
  return false;
}

// Create MCP server
const server = new Server(
  {
    name: SERVER_NAME,
    version: SERVER_VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Initialize server methods if not already initialized
if (!(server as any).methods) {
  (server as any).methods = {};
}

// Define tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: Object.values(toolDescriptions).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as ToolInput,
    }))
  };
});

// Custom schema for tool documentation requests
const DescribeToolRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.literal('tools/describe'),
  params: z.object({
    name: z.string().describe('Name of the tool to describe')
  }),
  id: z.union([z.string(), z.number()])
});

// Implement tool documentation
server.setRequestHandler(DescribeToolRequestSchema, async (request) => {
  const { name } = request.params;
  const toolInfo = toolDescriptions[name];
  
  if (!toolInfo) {
    throw new Error(`Tool '${name}' not found`);
  }

  return {
    content: [{
      type: "text",
      text: toolInfo.usage
    }]
  };
});

// Implement tool handlers
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  let currentOperationId: string | null = null;
  
  try {
    const { name, arguments: toolInput } = request.params;
    console.error(`Received request for ${name} with params:`, toolInput);
    
    // Create a unique operation ID for tracking progress
    currentOperationId = createOperation(name, toolInput).id;
    
    switch (name) {
      case "backup_create": {
        const params = toolInput as z.infer<typeof BackupCreateSchema>;
        console.error('Received request for backup_create with params:', params);
        
        // Validate required parameters
        validateRequiredParams(params, ['file_path']);
        
        const filePath = path.normalize(params.file_path);
        
        // Check if file exists
        await validateFileExists(filePath);
        
        // Generate timestamp for the backup
        const timestamp = generateTimestamp();
        
        // Create backup directory
        const backupDir = getBackupDir(filePath);
        await ensureBackupDirectoryExists(backupDir);
        
        // Create backup filename
        const backupFilename = getBackupFilename(filePath, timestamp);
        const backupPath = path.join(backupDir, backupFilename);
        
        // Report progress
        logProgress(10);
        
        // Check if operation was cancelled
        const cancelCheck = checkOperationCancelled(
          currentOperationId, 
          operations,
          () => {}
        );
        if (cancelCheck.isCancelled) return cancelCheck.response;
        
        // Copy the file
        await fsPromises.copyFile(filePath, backupPath);
        
        // Report progress
        logProgress(70);
        
        // Check if operation was cancelled
        const cancelCheck2 = checkOperationCancelled(
          currentOperationId, 
          operations,
          () => {
            // Clean up the partial backup
            if (fs.existsSync(backupPath)) {
              fs.unlinkSync(backupPath);
            }
          }
        );
        if (cancelCheck2.isCancelled) return cancelCheck2.response;
        
        // Create and save metadata
        const metadata = createBackupMetadata(filePath, timestamp, backupPath, params.agent_context);
        const metadataPath = getBackupMetadataFilename(backupPath);
        saveBackupMetadata(metadataPath, metadata);
        
        // Report progress
        logProgress(90);
        
        // Clean up old backups
        const versionsKept = cleanupOldBackups(filePath);
        
        // Report completion
        logProgress(100);
        
        // Return result with versionsKept
        return formatJsonResponse({
          ...metadata,
          versions_kept: versionsKept
        });
      }
      
      case "backup_list": {
        const params = toolInput as z.infer<typeof BackupListSchema>;
        console.error('Received request for backup_list with params:', params);
        
        // Validate required parameters
        validateRequiredParams(params, ['file_path']);
        
        const filePath = path.normalize(params.file_path);
        
        // Report initial progress
        logProgress(0);
        
        // Check if file exists
        await validateFileExists(filePath);
        
        // Report progress
        logProgress(30);
        
        const backups = findBackupsByFilePath(filePath);
        
        // Report progress
        logProgress(70);
        
        // Sort backups by timestamp (newest first)
        backups.sort((a, b) => {
          return b.timestamp.localeCompare(a.timestamp);
        });
        
        // Report completion
        logProgress(100);
        
        return formatJsonResponse(backups);
      }
      
      case "backup_restore": {
        const params = toolInput as z.infer<typeof BackupRestoreSchema>;
        console.error('Received request for backup_restore with params:', params);
        
        // Validate required parameters
        validateRequiredParams(params, ['file_path', 'timestamp']);
        
        const filePath = path.normalize(params.file_path);
        const timestamp = params.timestamp;
        
        // Find the backup
        const backup = await findBackupByTimestamp(filePath, timestamp);
        
        if (!backup) {
          throw new Error(`Backup with timestamp ${timestamp} not found for ${filePath}`);
        }
        
        // Report progress
        logProgress(20);
        
        // Check if operation was cancelled
        const cancelCheck = checkOperationCancelled(
          currentOperationId, 
          operations,
          () => {}
        );
        if (cancelCheck.isCancelled) return cancelCheck.response;
        
        // Ensure the target directory exists
        const targetDir = path.dirname(filePath);
        await ensureBackupDirectoryExists(targetDir);
        
        // Report progress
        logProgress(50);
        
        // Check if operation was cancelled
        const cancelCheck2 = checkOperationCancelled(
          currentOperationId, 
          operations,
          () => {}
        );
        if (cancelCheck2.isCancelled) return cancelCheck2.response;
        
        // Create emergency backup if requested
        if (params.create_emergency_backup) {
          const emergencyBackupPath = await createEmergencyBackup(filePath);
          if (emergencyBackupPath) {
            console.error(`Created emergency backup at ${emergencyBackupPath}`);
          }
        }
        
        // Copy the backup file to the original location
        await restoreBackup(filePath, timestamp, params.create_emergency_backup);
        
        // Report completion
        logProgress(100);
        
        // Return result
        return formatJsonResponse({
          restored_path: filePath,
          timestamp: timestamp
        });
      }
      
      case "backup_folder_create": {
        const params = toolInput as z.infer<typeof BackupFolderCreateSchema>;
        console.error('Received request for backup_folder_create with params:', params);
        
        // Validate required parameters
        validateRequiredParams(params, ['folder_path']);
        
        const folderPath = path.normalize(params.folder_path);
        
        // Check if folder exists
        await validateFolderExists(folderPath);
        
        // Generate timestamp for the backup
        const timestamp = generateTimestamp();
        
        // Create backup directory
        const backupDir = getBackupDir(folderPath);
        await ensureBackupDirectoryExists(backupDir);
        
        // Create backup folder name
        const backupFolderName = getBackupFolderName(folderPath, timestamp);
        const backupFolderPath = path.join(backupDir, backupFolderName);
        
        // Report progress
        logProgress(10);
        
        // Check if operation was cancelled
        const cancelCheck = checkOperationCancelled(
          currentOperationId, 
          operations,
          () => {}
        );
        if (cancelCheck.isCancelled) return cancelCheck.response;
        
        // Copy the folder
        await copyFolderContents(folderPath, backupFolderPath, params.include_pattern, params.exclude_pattern);
        
        // Report progress
        logProgress(70);
        
        // Check if operation was cancelled
        const cancelCheck2 = checkOperationCancelled(
          currentOperationId, 
          operations,
          () => {
            // Clean up the partial backup
            if (fs.existsSync(backupFolderPath)) {
              fs.rmdirSync(backupFolderPath, { recursive: true });
            }
          }
        );
        if (cancelCheck2.isCancelled) return cancelCheck2.response;
        
        // Create and save metadata
        const metadata = createBackupMetadata(folderPath, timestamp, backupFolderPath, params.agent_context);
        const metadataPath = `${backupFolderPath}.meta.json`;
        saveBackupMetadata(metadataPath, metadata);
        
        // Report progress
        logProgress(90);
        
        // Clean up old backups
        const versionsKept = cleanupOldBackups(folderPath);
        
        // Report completion
        logProgress(100);
        
        // Return result with versionsKept
        return formatJsonResponse({
          ...metadata,
          versions_kept: versionsKept
        });
      }
      
      case "backup_folder_list": {
        const params = toolInput as z.infer<typeof BackupFolderListSchema>;
        console.error('Received request for backup_folder_list with params:', params);
        
        // Validate required parameters
        validateRequiredParams(params, ['folder_path']);
        
        const folderPath = path.normalize(params.folder_path);
        
        // Report initial progress
        logProgress(0);
        
        // Check if folder exists
        await validateFolderExists(folderPath);
        
        // Report progress
        logProgress(30);
        
        const backups = findBackupsByFolderPath(folderPath);
        
        // Report progress
        logProgress(70);
        
        // Sort backups by timestamp (newest first)
        backups.sort((a, b) => {
          return b.timestamp.localeCompare(a.timestamp);
        });
        
        // Report completion
        logProgress(100);
        
        return formatJsonResponse(backups);
      }
      
      case "backup_folder_restore": {
        const params = toolInput as z.infer<typeof BackupFolderRestoreSchema>;
        console.error('Received request for backup_folder_restore with params:', params);
        
        // Validate required parameters
        validateRequiredParams(params, ['folder_path', 'timestamp']);
        
        const { folder_path, timestamp, create_emergency_backup = true } = params;
        const folderPath = path.normalize(folder_path);
        
        // Check if folder exists
        await validateFolderExists(folderPath);
        
        // Report initial progress
        logProgress(0);
        
        try {
          // Find the backup
          const backups = findBackupsByFolderPath(folderPath);
          const backup = backups.find(b => b.timestamp === timestamp);
          
          if (!backup) {
            throw new Error(`Backup with timestamp ${timestamp} not found for ${folderPath}`);
          }
          
          // Report progress
          logProgress(10);
          
          // Create emergency backup if requested
          let emergencyBackupPath: string | null = null;
          if (create_emergency_backup) {
            emergencyBackupPath = await createEmergencyFolderBackup(folderPath);
          }
          
          // Check if backup path exists
          if (!backup.backup_path || !fs.existsSync(backup.backup_path)) {
            throw new Error(`Backup folder not found: ${backup.backup_path}`);
          }
          
          // Check if operation was cancelled
          const cancelCheck = checkOperationCancelled(
            currentOperationId, 
            operations,
            () => {}
          );
          if (cancelCheck.isCancelled) return cancelCheck.response;
          
          // Copy the backup folder to the original location
          await copyFolderContents(backup.backup_path, folderPath);
          
          // Report completion
          logProgress(100);
          
          return formatJsonResponse({
            restored_path: folderPath,
            timestamp: timestamp,
            emergency_backup_path: emergencyBackupPath
          });
        } catch (error) {
          // Update operation status on error
          const operation = operations.get(currentOperationId);
          if (operation) {
            operation.status = 'error';
          }
          
          throw error;
        }
      }
      
      case "backup_list_all": {
        const params = toolInput as z.infer<typeof ListAllBackupsSchema>;
        console.error('Received request for backup_list_all with params:', params);
        
        // Extract parameters
        const includePattern = params.include_pattern;
        const excludePattern = params.exclude_pattern;
        const includeEmergency = params.include_emergency !== false; // Default to true if not specified
        
        // Create operation for tracking
        const operation = operations.get(currentOperationId);
        if (operation) {
          operation.status = 'running';
        }
        
        // Report initial progress
        logProgress(0);
        
        try {
          // Initialize results object
          const results: {
            main_backups: Array<{
              path: string;
              type: string;
              size: number;
              created_at: string;
              original_path: string | null;
            }>;
            emergency_backups: Array<{
              path: string;
              type: string;
              size: number;
              created_at: string;
              original_path: string | null;
            }>;
          } = {
            main_backups: [],
            emergency_backups: []
          };
          
          // Function to scan a directory and get all backup files
          async function scanBackupDirectory(directory: string, isEmergency: boolean = false) {
            if (!fs.existsSync(directory)) {
              return [];
            }
            
            // Get all files and folders in the directory recursively
            const getAllFiles = async (dir: string, fileList: any[] = []) => {
              const files = await fsPromises.readdir(dir, { withFileTypes: true });
              
              for (const file of files) {
                const filePath = path.join(dir, file.name);
                
                // Check if operation was cancelled
                if (currentOperationId && operations.get(currentOperationId)?.cancelled) {
                  throw new Error('Operation cancelled');
                }
                
                // Apply include/exclude patterns if specified
                if (includePattern && !minimatch(filePath, includePattern)) {
                  continue;
                }
                
                if (excludePattern && minimatch(filePath, excludePattern)) {
                  continue;
                }
                
                if (file.isDirectory()) {
                  fileList = await getAllFiles(filePath, fileList);
                } else {
                  // Check if this is a backup file (has timestamp format in name)
                  const isBackupFile = /\.\d{8}-\d{6}-\d{3}$/.test(file.name);
                  const isMetadataFile = file.name.endsWith('.meta.json');
                  
                  if (isBackupFile || isMetadataFile) {
                    try {
                      const stats = await fsPromises.stat(filePath);
                      
                      // Try to get original path from metadata if this is a backup file
                      let originalPath = null;
                      let backupType = 'unknown';
                      
                      if (isBackupFile) {
                        // Look for corresponding metadata file
                        const metadataPath = `${filePath}.meta.json`;
                        if (await exists(metadataPath)) {
                          try {
                            const metadataContent = await fsPromises.readFile(metadataPath, 'utf8');
                            const metadata = JSON.parse(metadataContent);
                            originalPath = metadata.original_path;
                          } catch (err) {
                            console.error(`Error reading metadata for ${filePath}:`, err);
                          }
                        }
                      } else if (isMetadataFile) {
                        try {
                          const metadataContent = await fsPromises.readFile(filePath, 'utf8');
                          const metadata = JSON.parse(metadataContent);
                          originalPath = metadata.original_path;
                        } catch (err) {
                          console.error(`Error reading metadata file ${filePath}:`, err);
                        }
                      }
                      
                      // Add to appropriate list
                      const result = {
                        path: filePath,
                        type: file.isDirectory() ? 'directory' : 'file',
                        size: stats.size,
                        created_at: stats.birthtime.toISOString(),
                        original_path: originalPath
                      };
                      
                      if (isEmergency) {
                        results.emergency_backups.push(result);
                      } else {
                        results.main_backups.push(result);
                      }
                      
                      // Update progress periodically
                      if (results.main_backups.length % 10 === 0 || results.emergency_backups.length % 10 === 0) {
                        // Calculate progress based on number of files found
                        const totalFiles = results.main_backups.length + results.emergency_backups.length;
                        // Cap progress at 90% until we're completely done
                        const progress = Math.min(90, Math.floor(totalFiles / 10) * 5);
                        logProgress(progress);
                      }
                    } catch (err) {
                      console.error(`Error processing file ${filePath}:`, err);
                    }
                  }
                }
              }
              
              return fileList;
            };
            
            await getAllFiles(directory);
          }
          
          // Scan main backup directory
          await scanBackupDirectory(BACKUP_DIR_NORMALIZED);
          
          // Report progress after scanning main directory
          logProgress(50);
          
          // Scan emergency backup directory if requested
          if (includeEmergency) {
            console.error('Scanning emergency backup directory:', EMERGENCY_BACKUP_DIR_NORMALIZED);
            if (!fs.existsSync(EMERGENCY_BACKUP_DIR_NORMALIZED)) {
              console.error('Emergency backup directory does not exist, creating it');
              await fsPromises.mkdir(EMERGENCY_BACKUP_DIR_NORMALIZED, { recursive: true });
            }
            await scanBackupDirectory(EMERGENCY_BACKUP_DIR_NORMALIZED, true);
          }
          
          // Report completion
          logProgress(100);
          
          return formatJsonResponse(results);
        } catch (error) {
          // Update operation status on error
          const operation = operations.get(currentOperationId);
          if (operation) {
            operation.status = 'error';
          }
          
          throw error;
        }
      }
        
      case "mcp_cancel": {
        const params = toolInput as z.infer<typeof CancelSchema>;
        console.error('Received request for mcp_cancel with params:', params);
        
        // Validate required parameters
        validateRequiredParams(params, ['operationId']);
        
        const { operationId } = params;
        const cancelled = cancelOperation(operationId);
        
        if (!cancelled) {
          return formatJsonResponse({
            success: false,
            error: `Operation ${operationId} not found or already completed`
          });
        }
        
        return formatJsonResponse({
          success: true,
          operationId,
          status: 'cancelled'
        });
      }
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    console.error('Error handling request:', error);
    return formatErrorResponse(error, currentOperationId);
  }
});

// Utility functions
function generateOperationId(): string {
  return crypto.randomUUID();
}

function generateTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
  
  return `${year}${month}${day}-${hours}${minutes}${seconds}-${milliseconds}`;
}

function getBackupDir(filePath: string): string {
  // Create a directory structure that mirrors the original file's path
  const normalizedPath = path.normalize(filePath);
  const parsedPath = path.parse(normalizedPath);
  
  // Remove drive letter (on Windows) and create backup path
  let relativePath = parsedPath.dir.replace(/^[a-zA-Z]:/, '');
  
  // Ensure the path is safe by removing leading slashes
  relativePath = relativePath.replace(/^[/\\]+/, '');
  
  // Create the backup directory path
  return path.join(BACKUP_DIR_NORMALIZED, relativePath);
}

function getBackupFilename(filePath: string, timestamp: string): string {
  const parsedPath = path.parse(filePath);
  return `${parsedPath.name}${parsedPath.ext}.${timestamp}`;
}

function getBackupMetadataFilename(backupFilePath: string): string {
  return `${backupFilePath}.meta.json`;
}

function createBackupMetadata(filePath: string, timestamp: string, backupPath: string, agentContext?: string): BackupMetadata {
  return {
    original_path: filePath,
    original_filename: path.basename(filePath),
    timestamp: timestamp,
    created_at: new Date().toISOString(),
    backup_path: backupPath,
    relative_path: path.relative(process.cwd(), backupPath),
    agent_context: agentContext
  };
}

function saveBackupMetadata(metadataPath: string, metadata: BackupMetadata): void {
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
}

function readBackupMetadata(metadataPath: string): BackupMetadata | BackupFolderMetadata | null {
  try {
    const data = fs.readFileSync(metadataPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Error reading metadata: ${err}`);
    return null;
  }
}

function isFolderMetadata(metadata: any): metadata is BackupFolderMetadata {
  // Check if this is a folder metadata by examining the backup_path
  // Folder backups have a directory structure, while file backups have a file
  return metadata && 
    metadata.original_path && 
    metadata.backup_path && 
    !metadata.backup_path.endsWith('.meta.json') &&
    fs.existsSync(metadata.backup_path) && 
    fs.statSync(metadata.backup_path).isDirectory();
}

// Helper function to check if a path is a parent of another path
function isParentPath(parentPath: string, childPath: string): boolean {
  const normalizedParent = path.normalize(parentPath).toLowerCase() + path.sep;
  const normalizedChild = path.normalize(childPath).toLowerCase() + path.sep;
  return normalizedChild.startsWith(normalizedParent);
}

// Helper function to recursively search for backup metadata files
function findAllBackupMetadataFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) {
    return [];
  }

  let results: string[] = [];
  const items = fs.readdirSync(directory);

  for (const item of items) {
    const itemPath = path.join(directory, item);
    const stats = fs.statSync(itemPath);

    if (stats.isDirectory()) {
      // Recursively search subdirectories
      results = results.concat(findAllBackupMetadataFiles(itemPath));
    } else if (item.endsWith('.meta.json')) {
      // Add metadata files to results
      results.push(itemPath);
    }
  }

  return results;
}

function findBackupsByFilePath(filePath: string): BackupMetadata[] {
  const backupDir = getBackupDir(filePath);
  const backups: BackupMetadata[] = [];
  
  // Start at the root of the backup directory to find all possible backups
  const rootBackupDir = BACKUP_DIR_NORMALIZED;
  
  // Find all metadata files recursively
  const metadataFiles = findAllBackupMetadataFiles(rootBackupDir);
  
  // Process each metadata file
  for (const metadataPath of metadataFiles) {
    const metadata = readBackupMetadata(metadataPath);
    
    // Check if this backup is for the requested file (exact match)
    if (metadata && metadata.original_path === filePath && !isFolderMetadata(metadata)) {
      backups.push(metadata);
    }
  }
  
  // Sort backups by timestamp (newest first)
  backups.sort((a, b) => {
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });
  
  return backups;
}

function findBackupsByFolderPath(folderPath: string): BackupFolderMetadata[] {
  const backups: BackupFolderMetadata[] = [];
  
  // Start at the root of the backup directory to find all possible backups
  const rootBackupDir = BACKUP_DIR_NORMALIZED;
  
  // Find all metadata files recursively
  const metadataFiles = findAllBackupMetadataFiles(rootBackupDir);
  
  // Process each metadata file
  for (const metadataPath of metadataFiles) {
    try {
      const metadata = readBackupMetadata(metadataPath);
      
      // Check if this backup is for the requested folder (exact match) or any subfolder
      if (metadata && isFolderMetadata(metadata)) {
        // Include if it's an exact match or if the original path is a parent of the requested path
        // or if the requested path is a parent of the original path
        if (metadata.original_path === folderPath || 
            isParentPath(metadata.original_path, folderPath) || 
            isParentPath(folderPath, metadata.original_path)) {
          backups.push(metadata);
        }
      }
    } catch (error) {
      console.error(`Error processing metadata file ${metadataPath}:`, error);
      // Continue processing other metadata files
    }
  }
  
  // Sort backups by timestamp (newest first)
  backups.sort((a, b) => {
    return b.timestamp.localeCompare(a.timestamp);
  });
  
  return backups;
}

async function findBackupByTimestamp(filePath: string, timestamp: string): Promise<BackupMetadata | null> {
  const backupDir = getBackupDir(filePath);
  const backupFilename = getBackupFilename(filePath, timestamp);
  const backupPath = path.join(backupDir, backupFilename);
  const metadataPath = `${backupPath}.meta.json`;
  
  if (fs.existsSync(metadataPath)) {
    const metadata = readBackupMetadata(metadataPath);
    if (metadata && !isFolderMetadata(metadata)) {
      return metadata;
    }
  }
  
  return null;
}

async function findFolderBackupByTimestamp(folderPath: string, timestamp: string): Promise<BackupFolderMetadata | null> {
  const backupDir = getBackupDir(folderPath);
  const backupFolderName = getBackupFolderName(folderPath, timestamp);
  const backupPath = path.join(backupDir, backupFolderName);
  const metadataPath = `${backupPath}.meta.json`;
  
  if (fs.existsSync(metadataPath)) {
    const metadata = readBackupMetadata(metadataPath);
    if (metadata && isFolderMetadata(metadata)) {
      return metadata;
    }
  }
  
  return null;
}

async function listFolderBackups(folderPath: string): Promise<BackupFolderMetadata[]> {
  return findBackupsByFolderPath(folderPath);
}

function cleanupOldBackups(filePath: string): number {
  // Get all backups for this file
  const backups = findBackupsByFilePath(filePath);
  
  // If we have more than MAX_VERSIONS, remove the oldest ones
  if (backups.length > MAX_VERSIONS) {
    // Sort backups by timestamp (oldest first)
    backups.sort((a, b) => {
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });
    
    // Remove oldest backups
    const backupsToRemove = backups.slice(0, backups.length - MAX_VERSIONS);
    for (const backup of backupsToRemove) {
      try {
        fs.unlinkSync(backup.backup_path);
        console.log(`Removed old backup: ${backup.backup_path}`);
      } catch (error) {
        console.error(`Error removing old backup: ${backup.backup_path}`, error);
      }
    }
    
    return MAX_VERSIONS;
  }
  
  return backups.length;
}

// Copy folder recursively
async function copyFolderRecursive(sourcePath: string, targetPath: string, includePattern?: string, excludePattern?: string): Promise<void> {
  // Create target folder if it doesn't exist
  if (!fs.existsSync(targetPath)) {
    await fsPromises.mkdir(targetPath, { recursive: true });
  }
  
  // Read source directory
  const entries = fs.readdirSync(sourcePath, { withFileTypes: true });
  
  // Process each entry
  for (const entry of entries) {
    const srcPath = path.join(sourcePath, entry.name);
    const destPath = path.join(targetPath, entry.name);
    
    // Skip excluded files/folders
    if (excludePattern && minimatch(entry.name, excludePattern)) {
      continue;
    }
    
    // Only include files/folders matching the include pattern if specified
    if (includePattern && !minimatch(entry.name, includePattern)) {
      continue;
    }
    
    if (entry.isDirectory()) {
      // Recursively copy subdirectories
      await copyFolderRecursive(srcPath, destPath, includePattern || undefined, excludePattern || undefined);
    } else {
      // Copy files
      await fsPromises.copyFile(srcPath, destPath);
    }
  }
}

// Copy folder contents helper function
async function copyFolderContents(sourcePath: string, targetPath: string, includePattern?: string, excludePattern?: string): Promise<void> {
  if (!sourcePath || !targetPath) {
    throw new Error('Source and target paths are required');
  }
  
  // Ensure target directory exists
  await fsPromises.mkdir(targetPath, { recursive: true });
  
  // Copy folder contents
  await copyFolderRecursive(sourcePath, targetPath, includePattern, excludePattern);
}

// Ensure emergency backup directory exists
async function ensureEmergencyBackupDir(): Promise<void> {
  if (!fs.existsSync(EMERGENCY_BACKUP_DIR_NORMALIZED)) {
    await fsPromises.mkdir(EMERGENCY_BACKUP_DIR_NORMALIZED, { recursive: true });
  }
}

// Create emergency backup of a file before restoration
async function createEmergencyBackup(filePath: string): Promise<string | null> {
  try {
    if (!fs.existsSync(filePath)) {
      console.error(`File not found for emergency backup: ${filePath}`);
      return null;
    }
    
    await ensureEmergencyBackupDir();
    const timestamp = generateTimestamp();
    const fileName = path.basename(filePath);
    
    // Create a directory structure that mirrors the original file's path
    const normalizedPath = path.normalize(filePath);
    const parsedPath = path.parse(normalizedPath);
    
    // Remove drive letter (on Windows) and create backup path
    let relativePath = parsedPath.dir.replace(/^[a-zA-Z]:/, '');
    
    // Ensure the path is safe by removing leading slashes
    relativePath = relativePath.replace(/^[/\\]+/, '');
    
    // Create the emergency backup directory path
    const emergencyBackupDir = path.join(EMERGENCY_BACKUP_DIR_NORMALIZED, relativePath);
    
    // Ensure the directory structure exists
    await fsPromises.mkdir(emergencyBackupDir, { recursive: true });
    
    // Create the emergency backup file path
    const backupPath = path.join(emergencyBackupDir, `${parsedPath.name}${parsedPath.ext}.emergency.${timestamp}`);
    
    // Copy file to emergency backup location
    await fsPromises.copyFile(filePath, backupPath);
    
    // Create metadata file for the emergency backup
    const metadata = createBackupMetadata(filePath, timestamp, backupPath, "Emergency backup created before restoration");
    const metadataPath = path.join(EMERGENCY_BACKUP_DIR_NORMALIZED, `${parsedPath.name}.emergency.${timestamp}.meta.json`);
    await fsPromises.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    
    return backupPath;
  } catch (error) {
    console.error('Error creating emergency backup:', error);
    return null;
  }
}

// Create emergency backup of a folder before restoration
async function createEmergencyFolderBackup(folderPath: string): Promise<string | null> {
  try {
    if (!fs.existsSync(folderPath)) {
      console.error(`Folder not found for emergency backup: ${folderPath}`);
      return null;
    }
    
    await ensureEmergencyBackupDir();
    const timestamp = generateTimestamp();
    
    // Create a directory structure that mirrors the original folder's path
    const normalizedPath = path.normalize(folderPath);
    const parsedPath = path.parse(normalizedPath);
    
    // Remove drive letter (on Windows) and create backup path
    let relativePath = parsedPath.dir.replace(/^[a-zA-Z]:/, '');
    
    // Ensure the path is safe by removing leading slashes
    relativePath = relativePath.replace(/^[/\\]+/, '');
    
    // Create the emergency backup directory path
    const emergencyBackupDir = path.join(EMERGENCY_BACKUP_DIR_NORMALIZED, relativePath);
    
    // Ensure the directory structure exists
    await fsPromises.mkdir(emergencyBackupDir, { recursive: true });
    
    // Create the emergency backup folder path
    const backupPath = path.join(emergencyBackupDir, `${parsedPath.name}.emergency.${timestamp}`);
    
    // Copy folder to emergency backup location
    await copyFolderContents(folderPath, backupPath);
    
    // Create metadata file for the emergency backup
    const metadata = {
      original_path: folderPath,
      original_filename: path.basename(folderPath),
      timestamp: timestamp,
      created_at: new Date().toISOString(),
      backup_path: backupPath,
      relative_path: path.relative(process.cwd(), backupPath),
      agent_context: "Emergency backup created before restoration"
    };
    const metadataPath = path.join(EMERGENCY_BACKUP_DIR_NORMALIZED, `${parsedPath.name}.emergency.${timestamp}.meta.json`);
    await fsPromises.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    
    return backupPath;
  } catch (error) {
    console.error('Error creating emergency folder backup:', error);
    return null;
  }
}

// Fix string | null assignment errors
async function mcp_backup_status(params: { operationId: string }): Promise<{ progress: number, status: string }> {
  const { operationId } = params;
  
  if (!operationId) {
    return { progress: 0, status: 'error' };
  }
  
  // Check if operation exists
  if (operations.has(operationId)) {
    const operation = operations.get(operationId);
    if (operation) {
      return {
        progress: operation.progress,
        status: operation.cancelled ? 'cancelled' : operation.progress >= 100 ? 'completed' : 'in_progress'
      };
    }
  }
  
  return { progress: 0, status: 'not_found' };
}

// Restore backup function
async function restoreBackup(filePath: string, timestamp: string, createEmergencyBackupFlag: boolean = false): Promise<void> {
  // Find the backup
  const backups = findBackupsByFilePath(filePath);
  const backup = backups.find(b => b.timestamp === timestamp);
  
  if (!backup) {
    throw new Error(`Backup with timestamp ${timestamp} not found for ${filePath}`);
  }
  
  // Create emergency backup if requested
  if (createEmergencyBackupFlag) {
    const emergencyBackupPath = await createEmergencyBackup(filePath);
    console.log(`Created emergency backup at: ${emergencyBackupPath}`);
  }
  
  // Get backup path
  const backupPath = backup.backup_path;
  
  // Check if backup exists
  if (!backupPath || !fs.existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${backupPath}`);
  }
  
  // Check if original file exists
  if (!fs.existsSync(filePath)) {
    throw new Error(`Original file not found: ${filePath}`);
  }
  
  // Restore backup by copying it to original location
  await fsPromises.copyFile(backupPath, filePath);
}

// Start the server with stdio transport
const transport = new StdioServerTransport();
server.connect(transport).catch((error: Error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
