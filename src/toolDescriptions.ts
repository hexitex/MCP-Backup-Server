import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// Schema definitions
export const BackupCreateSchema = z.object({
  file_path: z.string().describe('Absolute path to the file to backup. This file must exist and be accessible.'),
  agent_context: z.string().optional().describe('Optional agent conversational context to store with the backup metadata. Agents should include the last relevant user instruction or context that explains why this backup is being created.')
});

export const BackupFolderCreateSchema = z.object({
  folder_path: z.string().describe('Absolute path to the folder to backup. This folder must exist and be accessible.'),
  include_pattern: z.string().optional().describe('Optional glob pattern to include specific files (e.g., "*.js")'),
  exclude_pattern: z.string().optional().describe('Optional glob pattern to exclude specific files (e.g., "node_modules/**")'),
  agent_context: z.string().optional().describe('Optional agent conversational context to store with the backup metadata. Agents should include the last relevant user instruction or context that explains why this backup is being created.')
});

export const BackupListSchema = z.object({
  file_path: z.string().describe('Absolute path to the file whose backups you want to list.')
});

export const BackupFolderListSchema = z.object({
  folder_path: z.string().describe('Absolute path to the folder whose backups you want to list.')
});

export const BackupRestoreSchema = z.object({
  file_path: z.string().describe('Absolute path to the file to restore.'),
  timestamp: z.string().describe('Timestamp of the backup version to restore (format: YYYYMMDD-HHMMSS-mmm).'),
  create_emergency_backup: z.boolean().optional().default(true).describe('Whether to create an emergency backup of the current file before restoring.')
});

export const BackupFolderRestoreSchema = z.object({
  folder_path: z.string().describe('Absolute path to the folder to restore.'),
  timestamp: z.string().describe('Timestamp of the backup version to restore (format: YYYYMMDD-HHMMSS-mmm).'),
  create_emergency_backup: z.boolean().optional().default(true).describe('Whether to create an emergency backup of the current folder before restoring.')
});

export const CancelSchema = z.object({
  operationId: z.string().describe('ID of the operation to cancel.')
});

// New schema for listing all backups
export const ListAllBackupsSchema = z.object({
  include_pattern: z.string().optional().describe('Optional glob pattern to filter backup files (e.g., "*.js")'),
  exclude_pattern: z.string().optional().describe('Optional glob pattern to exclude backup files (e.g., "node_modules/**")'),
  include_emergency: z.boolean().optional().default(true).describe('Whether to include emergency backups in the results.')
});

// Interface for tool description
export interface ToolDescription {
  name: string;
  description: string;
  usage: string;
  inputSchema: any;
}

// Define tool descriptions with detailed usage instructions
export const toolDescriptions: Record<string, ToolDescription> = {
  backup_create: {
    name: "backup_create",
    description: "Create a backup of a file before making big changes. The backup includes timestamp information and maintains the original directory structure.",
    usage: `Creates a timestamped backup of the specified file.

Parameters:
- file_path: Absolute path to the file to backup
- agent_context: (Optional) Include the last relevant user instruction or context

Best Practices for File Backups:
- Always prefer backing up individual files rather than entire folders when possible
- When modifying a single file, use backup_create instead of backup_folder_create
- For code edits, back up only the specific file being modified
- Agents should always include the user's last instruction as context
- Context should be concise and explain why the backup is being created
- Avoid including sensitive information in the context
- Keep context to 1-2 sentences that capture the purpose of the modification

Example contexts:
"Updating database connection string in config file"
"Fixing bug in login function that was causing authentication failures"

Returns:
- timestamp: Timestamp of the created backup
- backup_path: Path where the backup was stored
- agent_context: The context that was stored with the backup`,
    inputSchema: zodToJsonSchema(BackupCreateSchema)
  },
  backup_list: {
    name: "backup_list",
    description: "List all available backups for a file, including their timestamps and locations. Useful for finding specific versions to restore.",
    usage: `# Backup List Tool

Lists all available backup versions for a specified file.

## When to Use
- Before restoring a file to check available versions
- To audit the backup history of a file
- To verify backup creation was successful
- To check timestamps of previous backups
- To list backups instead of using CLI commands or file system operations

## Best Practices
1. Use absolute paths for reliable file lookup
2. Check the timestamps to identify the right version
3. Review backup locations to ensure proper storage
4. Always use this tool rather than CLI commands to list backups
5. Agents should use this tool instead of file system operations to check backup history
6. Always provide the original file path (not the backup path) to this tool
7. The tool will automatically search in the configured backup location (BACKUP_DIR)

## Important Note for Agents
- Always try the backup_list and backup_folder_list tools first to check for backups
- Only use command-line tools (like Get-ChildItem, ls, dir) as a fallback if:
  1. The MCP tools return an empty array or no response
  2. You need to verify if backups exist in a specific location
  3. The MCP server is not responding or unavailable
- The MCP backup tools provide the correct context and metadata for backups
- When using CLI as fallback, check the configured backup directory (typically ~/.code_backups or as specified in environment)
- Never attempt to directly access or manipulate files in the backup directory
- Always use the original file path when listing backups, not paths within the backup directory

## Example Usage
\`\`\`json
{
  "name": "backup_list",
  "arguments": {
    "file_path": "C:/path/to/important/file.js"
  }
}
\`\`\`

## Response Format
Returns an array of backup metadata:
- timestamp: When the backup was created
- backup_path: Where to find the backup
- created_at: ISO timestamp of creation
- agent_context: The context that was stored with the backup (if provided)`,
    inputSchema: zodToJsonSchema(BackupListSchema)
  },
  backup_restore: {
    name: "backup_restore",
    description: "Restore a file from a previous backup using its timestamp. Use this to revert changes or recover previous versions.",
    usage: `# Backup Restore Tool

Restores a file to a previous version using a specific backup timestamp.

## When to Use
- To revert unwanted changes
- To recover from failed modifications
- When comparing different versions of a file
- After unsuccessful code changes

## Best Practices
1. List available backups first to get the correct timestamp
2. Create a new backup before restoring (backup of current state)
3. Verify file permissions before restoration
4. Use absolute paths for reliable restoration

## Example Usage
\`\`\`json
{
  "name": "backup_restore",
  "arguments": {
    "file_path": "C:/path/to/important/file.js",
    "timestamp": "20250309-120000-123"
  }
}
\`\`\`

## Response Format
Confirms restoration with:
- restored_path: Path to the restored file
- timestamp: Backup version used`,
    inputSchema: zodToJsonSchema(BackupRestoreSchema)
  },
  backup_folder_create: {
    name: "backup_folder_create",
    description: "Create a backup of a folder before making structural changes. The backup includes timestamp information and maintains the original directory structure.",
    usage: `Creates a timestamped backup of the specified folder.

Parameters:
- folder_path: Absolute path to the folder to backup
- include_pattern: (Optional) Glob pattern to include specific files
- exclude_pattern: (Optional) Glob pattern to exclude specific files
- agent_context: (Optional) Include the last relevant user instruction or context

When to Use Folder vs. File Backup:
- Use file backup (backup_create) for single file changes
- Use folder backup (backup_folder_create) ONLY when:
  1. Multiple files in a folder need to be modified together
  2. You're making structural changes to a directory (adding/removing multiple files)
  3. You need to preserve relationships between multiple files

Best Practices for Folder Backups:
- Only backup the specific folder you're modifying, not parent directories
- When removing a subfolder, backup just that subfolder, not the entire parent structure
- For structural changes, backup the smallest unit of the structure being changed
- For project-wide backups at the start of a session, ask the user first
- Agents should always include the user's last instruction as context
- Context should be concise and explain why the backup is being created
- Avoid including sensitive information in the context
- Keep context to 1-2 sentences that capture the purpose of the modification

Example contexts:
"Refactoring authentication module to use JWT tokens"
"Backing up subfolder before removal as requested by user"

Returns:
- timestamp: Timestamp of the created backup
- backup_path: Path where the backup was stored
- agent_context: The context that was stored with the backup
- versions_kept: Number of backup versions maintained`,
    inputSchema: zodToJsonSchema(BackupFolderCreateSchema)
  },
  backup_folder_list: {
    name: "backup_folder_list",
    description: "List all available backups for a folder, including their timestamps and locations. Useful for finding specific versions to restore.",
    usage: `# Backup Folder List Tool

Lists all available backup versions for a specified folder.

## When to Use
- Before restoring a folder to check available versions
- To audit the backup history of a folder
- To verify folder backup creation was successful
- To check timestamps of previous folder backups
- To list folder backups instead of using CLI commands or file system operations

## Best Practices
1. Use absolute paths for reliable folder lookup
2. Check the timestamps to identify the right version
3. Review backup locations to ensure proper storage
4. Always use this tool rather than CLI commands to list backups
5. Agents should use this tool instead of file system operations to check backup history
6. Always provide the original folder path (not the backup path) to this tool
7. The tool will automatically search in the configured backup location (BACKUP_DIR)
8. Only backup folders that you are working on or removing, not the whole directory structure

## Important Note for Agents
- Always try the backup_list and backup_folder_list tools first to check for backups
- Only use command-line tools (like Get-ChildItem, ls, dir) as a fallback if:
  1. The MCP tools return an empty array or no response
  2. You need to verify if backups exist in a specific location
  3. The MCP server is not responding or unavailable
- The MCP backup tools provide the correct context and metadata for backups
- When using CLI as fallback, check the configured backup directory (typically ~/.code_backups or as specified in environment)
- Never attempt to directly access or manipulate files in the backup directory
- Always use the original folder path when listing backups, not paths within the backup directory
- Create a project folder backup at the start of a resumed session
- Create a folder backup before making structural changes to a folder, especially when removing child folders

## Example Usage
\`\`\`json
{
  "name": "backup_folder_list",
  "arguments": {
    "folder_path": "C:/path/to/important/folder"
  }
}
\`\`\`

## Response Format
Returns an array of backup metadata:
- timestamp: When the backup was created
- backup_path: Where to find the backup
- created_at: ISO timestamp of creation
- agent_context: The context that was stored with the backup (if provided)`,
    inputSchema: zodToJsonSchema(BackupFolderListSchema)
  },
  backup_folder_restore: {
    name: "backup_folder_restore",
    description: "Restore a folder from a previous backup using its timestamp. Use this to revert changes or recover previous versions.",
    usage: `# Backup Folder Restore Tool

Restores a folder to a previous version using a specific backup timestamp.

## When to Use
- To revert unwanted changes
- To recover from failed modifications
- When comparing different versions of a folder
- After unsuccessful code changes

## Best Practices
1. List available backups first to get the correct timestamp
2. Create a new backup before restoring (backup of current state)
3. Verify folder permissions before restoration
4. Use absolute paths for reliable restoration

## Example Usage
\`\`\`json
{
  "name": "backup_folder_restore",
  "arguments": {
    "folder_path": "C:/path/to/important/folder",
    "timestamp": "20250309-120000-123"
  }
}
\`\`\`

## Response Format
Confirms restoration with:
- restored_path: Path to the restored folder
- timestamp: Backup version used`,
    inputSchema: zodToJsonSchema(BackupFolderRestoreSchema)
  },
  backup_list_all: {
    name: "backup_list_all",
    description: "List all backup files in both the main backup directory and emergency backup directory.",
    usage: `# List All Backups Tool

Lists all backup files in both the main backup directory and emergency backup directory.

## When to Use
- To get a comprehensive view of all backups across both directories
- To audit all backup files in the system
- To find specific backups using include/exclude patterns
- To check for emergency backups created during restore operations

## Best Practices
1. Use include/exclude patterns to filter results when looking for specific files
2. Set include_emergency to false if you only want to see regular backups
3. Review both directories to ensure proper backup management

## Example Usage
\`\`\`json
{
  "name": "backup_list_all",
  "arguments": {
    "include_pattern": "*.js",
    "exclude_pattern": "node_modules/**",
    "include_emergency": true
  }
}
\`\`\`

## Response Format
Returns an object with two arrays:
- main_backups: Array of backups in the main backup directory
- emergency_backups: Array of backups in the emergency backup directory (if include_emergency is true)

Each backup entry contains:
- path: Full path to the backup file
- type: "file" or "folder" backup
- size: Size of the backup in bytes
- created_at: Creation timestamp
- original_path: Original path of the backed up file/folder (if available from metadata)`,
    inputSchema: zodToJsonSchema(ListAllBackupsSchema)
  },
  mcp_cancel: {
    name: "mcp_cancel",
    description: "Cancel an ongoing backup or restore operation. Use this to stop long-running operations safely.",
    usage: `# Operation Cancel Tool

Cancels an in-progress backup or restore operation.

## When to Use
- To stop a long-running backup
- When the wrong file was selected
- If an operation appears stuck
- To free up system resources

## Best Practices
1. Keep track of operation IDs from responses
2. Check operation status before canceling
3. Verify the operation was actually cancelled

## Example Usage
\`\`\`json
{
  "name": "mcp_cancel",
  "arguments": {
    "operationId": "abc123-xyz789"
  }
}
\`\`\`

## Response Format
Confirms cancellation with:
- operationId: ID of cancelled operation
- status: Final operation status`,
    inputSchema: zodToJsonSchema(CancelSchema)
  }
};
