[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/hexitex-mcp-backup-server-badge.png)](https://mseep.ai/app/hexitex-mcp-backup-server)

# MCP Backup Server
[![smithery badge](https://smithery.ai/badge/@hexitex/MCP-Backup-Server)](https://smithery.ai/server/@hexitex/MCP-Backup-Server)

A specialized MCP server that provides backup and restoration capabilities for AI agents and code editing tools. Tested in both Cursor and Windsurf editors.

Repository: [https://github.com/hexitex/MCP-Backup-Server](https://github.com/hexitex/MCP-Backup-Server)

## Why Use This (Not Git)

This system serves a different purpose than Git:

**Pros:**
- Creates instant, targeted backups with agent context
- Simpler than Git for single-operation safety
- Preserves thought process and intent in backups
- No commit messages or branching required
- Better for AI agents making critical changes
- Works without repository initialization
- Faster for emergency "save points" during edits

**Cons:**
- Not for long-term version tracking 
- Limited collaboration features
- No merging or conflict resolution
- No distributed backup capabilities
- Not a replacement for proper version control
- Stores complete file copies rather than diffs

**When to use:** Before risky edits, folder restructuring, or when you need quick safety backups with context.

**When to use Git instead:** For proper version history, collaboration, and project management.

## Features
- Preserves agent context and reasoning
- Creates targeted, minimal backups
- Supports file and folder operations
- Maintains version history
- Provides restore safety
- Uses pattern filtering
- Tracks operations
- Allows cancellation

## Setup

### Installing via Smithery

To install Backup Server for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@hexitex/MCP-Backup-Server):

```bash
npx -y @smithery/cli install @hexitex/MCP-Backup-Server --client claude
```

### Installing Manually
```bash
# Install dependencies
npm install

# Build TypeScript files
npm run build

# Start the backup server
npm start
```

## Config

Env:
- `BACKUP_DIR`: Backup directory (./.code_backups)
- `EMERGENCY_BACKUP_DIR`: Emergency backups (./.code_emergency_backups)
- `MAX_VERSIONS`: Version limit (10)

Configure in editor:

Windsurf MCP config:
```json
{
  "mcpServers": {
    "backup": {
      "command": "node",
      "args": ["./dist/index.js"],
      "env": {
        "BACKUP_DIR": "./.code_backups",
        "EMERGENCY_BACKUP_DIR": "./.code_emergency_backups",
        "MAX_VERSIONS": "20"
      }
    }
  }
}
```

Cursor: Create `.cursor/mcp.json` with similar config.

## Tools

### File Operations
- `backup_create`: Create backup with context
- `backup_list`: List available backups
- `backup_restore`: Restore with safety backup

### Folder Operations  
- `backup_folder_create`: Backup with pattern filtering
- `backup_folder_list`: List folder backups
- `backup_folder_restore`: Restore folder structure

### Management
- `backup_list_all`: List all backups
- `mcp_cancel`: Cancel operations

## When to Use Backups

Only create backups when truly needed:

1. **Before Refactoring**: When changing important code
2. **Before Removing Folders**: When reorganizing project structure
3. **Multiple Related Changes**: When updating several connected files
4. **Resuming Major Work**: When continuing significant changes
5. **Before Restores**: Create safety backup before restoring

Keep backups minimal and purposeful. Document why each backup is needed.

## Rules for Copy-Paste

```
Always try to use the backup MCP server for operations that require a backup, listing backups and restoring backups.
Only backup before critical code changes, folder removal, changes to multiple related files, resuming major work, or restoring files.
Keep backups minimal and focused only on files being changed.
Always provide clear context for why a backup is being created.
Use pattern filters to exclude irrelevant files from folder backups.
Use relative file paths when creating backups.
Create emergency backups before restore operations.
Clean up old backups to maintain system efficiency.
Backup tools: backup_create, backup_list, backup_restore, backup_folder_create, backup_folder_list, backup_folder_restore, backup_list_all, mcp_cancel.
```

## For Human Users

Simple commands like these at the start you may have to mention MCP tool

```
# Back up an important file
"Back up my core file before refactoring"

# Back up a folder before changes
"Create backup of the API folder before restructuring"

# Find previous backups
"Show me my recent backups"

# Restore a previous version
"Restore my core file from this morning"
```

## Agent Examples

### Quick Backups
```json
// Before project changes
{
  "name": "mcp0_backup_folder_create",
  "parameters": {
    "folder_path": "./src",
    "include_pattern": "*.{js,ts}",
    "exclude_pattern": "{node_modules,dist,test}/**",
    "agent_context": "Start auth changes"
  }
}

// Before core fix
{
  "name": "mcp0_backup_create",
  "parameters": {
    "file_path": "./src/core.js",
    "agent_context": "Fix validation"
  }
}
```

### Resume Session
```json
// View recent work
{
  "name": "mcp0_backup_list_all",
  "parameters": {
    "include_pattern": "src/**/*.js"
  }
}

// Get last version
{
  "name": "mcp0_backup_restore",
  "parameters": {
    "file_path": "./src/core.js",
    "timestamp": "20250310-055950-000",
    "create_emergency_backup": true
  }
}
```

### Core Changes
```json
// Critical update
{
  "name": "mcp0_backup_create",
  "parameters": {
    "file_path": "./src/core.js",
    "agent_context": "Add validation"
  }
}

// Module update
{
  "name": "mcp0_backup_folder_create",
  "parameters": {
    "folder_path": "./src/api",
    "include_pattern": "*.js",
    "exclude_pattern": "test/**",
    "agent_context": "Refactor modules"
  }
}
```

### Restore Points
```json
// Check versions
{
  "name": "mcp0_backup_list",
  "parameters": {
    "file_path": "./src/core.js"
  }
}

{
  "name": "mcp0_backup_folder_list",
  "parameters": {
    "folder_path": "./src/api"
  }
}

// File restore
{
  "name": "mcp0_backup_restore",
  "parameters": {
    "file_path": "./src/core.js",
    "timestamp": "20250310-055950-000",
    "create_emergency_backup": true
  }
}

// Folder restore
{
  "name": "mcp0_backup_folder_restore",
  "parameters": {
    "folder_path": "./src/api",
    "timestamp": "20250310-055950-000",
    "create_emergency_backup": true
  }
}
```

### Manage
```json
// List recent
{
  "name": "mcp0_backup_list_all",
  "parameters": {
    "include_pattern": "src/**/*.js"
  }
}

// Stop backup
{
  "name": "mcp0_mcp_cancel",
  "parameters": {
    "operationId": "backup_1234"
  }
}
```

## License
MIT
