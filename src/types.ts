// Define interfaces for backup operations
export interface BackupMetadata {
  original_path: string;
  original_filename: string;
  timestamp: string;
  created_at: string;
  backup_path: string;
  relative_path: string;
  agent_context?: string; // Optional field for agent conversational context
}

export interface BackupFolderMetadata {
  original_path: string;
  original_foldername: string;
  timestamp: string;
  backup_path: string;
  include_pattern: string | null;
  exclude_pattern: string | null;
  agent_context?: string; // Optional field for agent conversational context
}

export interface BackupResult {
  success?: boolean;
  timestamp?: string;
  original_path?: string;
  original_filename?: string;
  original_foldername?: string;
  backup_path?: string;
  operation_id?: string;
  error?: string;
}

export interface Operation {
  id: string;
  type: string;
  progress: number;
  cancelled: boolean;
  status: string;
}
