/// <reference types="vite/client" />

// Injected at build time by Vite `define` (see vite.config.ts).
declare const __APP_VERSION__: string;
declare const __APP_LICENSE__: string;

// Optional bridge exposed by the Electron preload script.
interface Window {
  desktop?: {
    isElectron: boolean;
    platform: string;
    shareByEmail?: (payload: {
      filename: string;
      content: string;
      subject?: string;
      body?: string;
    }) => Promise<{
      ok: boolean;
      filePath?: string;
      method?: string;
      error?: string;
    }>;
  };
}

// Minimal File System Access API declarations (browser folder browsing).
interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

interface FileSystemHandle {
  readonly kind: 'file' | 'directory';
  readonly name: string;
  queryPermission?: (desc?: FileSystemHandlePermissionDescriptor) => Promise<PermissionState>;
  requestPermission?: (desc?: FileSystemHandlePermissionDescriptor) => Promise<PermissionState>;
}

interface FileSystemFileHandle extends FileSystemHandle {
  readonly kind: 'file';
  getFile(): Promise<File>;
  createWritable?: (options?: {
    keepExistingData?: boolean;
  }) => Promise<FileSystemWritableFileStream>;
}

interface FileSystemWritableFileStream {
  write(data: string | BufferSource | Blob): Promise<void>;
  close(): Promise<void>;
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
  readonly kind: 'directory';
  values(): AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle>;
}

interface Window {
  showDirectoryPicker?: (options?: {
    mode?: 'read' | 'readwrite';
  }) => Promise<FileSystemDirectoryHandle>;
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    excludeAcceptAllOption?: boolean;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  }) => Promise<FileSystemFileHandle[]>;
}
