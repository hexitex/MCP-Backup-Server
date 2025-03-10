# @modelcontextprotocol/server-backup

An MCP server that provides file backup and restoration capabilities for AI agents and code editing tools.

## Features
- Adds agent context to the backup metadata
- Creates timestamped backups of files before modification
- Maintains original directory structure for easy identification
- Supports multiple backup versions with automatic cleanup
- Provides progress tracking for long-running operations
- Supports cancellation of ongoing operations
- Complies with JSON-RPC 2.0 and MCP protocol standards
- Emergency backups are stored separately during restore operations to prevent data loss to the original folder or file, these should be in a seperate directory from regular backups.

## Installation

```bash
npm install -g @modelcontextprotocol/server-backup
```

Or use it directly with npx:

```bash
npx @modelcontextprotocol/server-backup
```

## Configuration

The server is configured through environment variables:

- `BACKUP_DIR`: Directory where backups are stored (default: `~/.code_backups`)
- `EMERGENCY_BACKUP_DIR`: Directory where emergency backups are stored during restore operations (default: `~/.code_emergency_backups`)
- `MAX_VERSIONS`: Maximum number of backup versions to keep per file (default: `10`)

## Windsurf Integration

To use this server with Windsurf, you need to add it to your Windsurf MCP configuration:

1. Open or create the MCP configuration file at `~/.codeium/windsurf/mcp_config.json`
2. Add the backup server configuration as shown below:

```json
{
  "mcpServers": {
    "backup": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-backup"],
      "env": {
        "BACKUP_DIR": "~/.code_backups",
        "EMERGENCY_BACKUP_DIR": "~/.code_emergency_backups",
        "MAX_VERSIONS": "10"
      }
    }
  }
}
```

3. If you have other MCP servers (like GitHub), your configuration might look like:

```json
{
  "mcpServers": {
    "backup": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-backup"],
      "env": {
        "BACKUP_DIR": "~/.code_backups",
        "EMERGENCY_BACKUP_DIR": "~/.code_emergency_backups",
        "MAX_VERSIONS": "10"
      }
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "<YOUR_TOKEN>"
      }
    }
  }
}
```

4. Save the configuration file
5. Restart Windsurf to apply the changes refresh also works after config changes 

Once configured, Windsurf will automatically connect to the backup server and make it available to AI agents. 

Add the following to your global rules:

```
Use the backup MCP only for operations that require a backup. these are typically before refactoring code or making lots of changes to files and folders. Only backup folders that you are working on or removing not the whole directory structure. Use a project folder backup at the start of a resumed session, ask the user if they want to do this. Use a folder backup for before making structural changes to a folder, typically removing child folders. Commands are backup_create, backup_list, backup_restore, backup_folder_create, backup_folder_list, backup_folder_restore. Always try to use the backup MCP server for operations that require a backup, listing backups and restoring backups.

```

## Agent Instructions

When implementing agents that use the MCP backup server, follow these guidelines:

1. **Use Direct Tool Interface**: Always use the MCP tools directly through the tool interface (backup_create, backup_list, etc.) rather than through alternative means.

2. **Use Configured Backup Folders**: Always use the configured backup folders when listing or restoring backups. The backup location is specified by the `BACKUP_DIR` environment variable.

3. **Original Paths for Listing**: When listing backups, provide the original file or folder path (not the backup path) to the backup_list and backup_folder_list tools.

4. **Emergency Backup Location**: For emergency backups during restore operations, use the location specified by the `EMERGENCY_BACKUP_DIR` environment variable.

5. **Selective Backups**: Only backup folders that you are working on or removing, not the whole directory structure.

6. **Session Start Backups**: Create a project folder backup at the start of a resumed session.

7. **Structural Change Backups**: Create a folder backup before making structural changes to a folder, especially when removing child folders.

## MCP Protocol Integration

The server follows the MCP tools API specification with the following tools:

### `tools/list`

Lists all available tools with their descriptions and input schemas.

```json
{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "params": {},
  "id": "request-id"
}
```

### `tools/call`

Calls a specific tool with the provided arguments.

#### Tools

##### `backup_create`
Creates a backup of a specified file.

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "backup_create",
    "arguments": {
      "file_path": "/absolute/path/to/file"
    }
  },
  "id": "request-id"
}
```

##### `backup_list`
Lists all backups for a specified file.

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "backup_list",
    "arguments": {
      "file_path": "/absolute/path/to/file"
    }
  },
  "id": "request-id"
}
```

##### `backup_restore`
Restores a file from a specified backup.

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "backup_restore",
    "arguments": {
      "file_path": "/absolute/path/to/file",
      "timestamp": "20250309-120000"
    }
  },
  "id": "request-id"
}
```

##### `mcp_cancel`
Cancels an ongoing operation.

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "mcp_cancel",
    "arguments": {
      "operationId": "operation-id"
    }
  },
  "id": "request-id"
}
```

### Response Format

All tool responses include structured content in the following format:

```json
{
  "jsonrpc": "2.0",
  "id": "request-id",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "JSON-formatted result data"
      }
    ]
  }
}
```

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Start the server
npm start

# Run tests
node test\ scripts/test_client.js
```

## License

MIT
