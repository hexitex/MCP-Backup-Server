import fs from 'fs';
import path from 'path';
import { promises as fsPromises } from 'fs';
import { Operation } from './types.js';

// Check if operation was cancelled and return appropriate response if it was
export function checkOperationCancelled(
  operationId: string | null, 
  operations: Map<string, Operation>,
  cleanupFn?: () => void
): { isCancelled: boolean; response?: any } {
  if (operationId && operations.get(operationId)?.cancelled) {
    console.error(`Operation was cancelled`);
    
    // Run cleanup function if provided
    if (cleanupFn) {
      cleanupFn();
    }
    
    return {
      isCancelled: true,
      response: {
        content: [{ type: "text", text: "Operation cancelled" }],
        isError: true
      }
    };
  }
  
  return { isCancelled: false };
}

// Format response with JSON content
export function formatJsonResponse(data: any): any {
  return {
    content: [{ 
      type: "text", 
      text: JSON.stringify(data, null, 2)
    }]
  };
}

// Format error response
export function formatErrorResponse(error: any, operationId: string | null = null): any {
  return {
    content: [{ 
      type: "text", 
      text: JSON.stringify({ 
        error: String(error),
        operationId
      }) 
    }]
  };
}

// Validate required parameters
export function validateRequiredParams(params: Record<string, any>, requiredParams: string[]): void {
  for (const param of requiredParams) {
    if (!params[param]) {
      throw new Error(`Invalid params: ${param} is required`);
    }
  }
}

// Check if file exists and is a file
export async function validateFileExists(filePath: string): Promise<void> {
  try {
    const stats = await fsPromises.stat(filePath);
    if (!stats.isFile()) {
      throw new Error(`Not a file: ${filePath}`);
    }
  } catch (error) {
    throw new Error(`File not found: ${filePath}`);
  }
}

// Check if folder exists and is a directory
export async function validateFolderExists(folderPath: string): Promise<void> {
  try {
    const stats = await fsPromises.stat(folderPath);
    if (!stats.isDirectory()) {
      throw new Error(`Not a directory: ${folderPath}`);
    }
  } catch (error) {
    throw new Error(`Folder not found: ${folderPath}`);
  }
}

// Ensure directory exists
export async function ensureDirectoryExists(dirPath: string): Promise<void> {
  await fsPromises.mkdir(dirPath, { recursive: true });
}

// Check if path exists
export async function exists(path: string): Promise<boolean> {
  try {
    await fsPromises.stat(path);
    return true;
  } catch {
    return false;
  }
}
