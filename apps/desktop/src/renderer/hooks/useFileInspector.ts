import { useState, useCallback } from 'react';
import type { Device, FileEntry } from '@android-debugger/shared';

export function useFileInspector(device: Device | null, packageName: string) {
  const [currentPath, setCurrentPath] = useState<string>('');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listFiles = useCallback(
    async (path: string = '') => {
      if (!device || !packageName) {
        setError('No device or package selected');
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const result = await window.electronAPI.listFiles(device.id, packageName, path);
        setFiles(result);
        setCurrentPath(path);
        setSelectedFile(null);
        setFileContent(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to list files');
        setFiles([]);
      } finally {
        setLoading(false);
      }
    },
    [device, packageName]
  );

  const navigateTo = useCallback(
    async (entry: FileEntry) => {
      if (entry.type === 'directory') {
        await listFiles(entry.path);
      } else {
        setSelectedFile(entry);
        setLoading(true);
        setError(null);

        try {
          const content = await window.electronAPI.readFile(device!.id, packageName, entry.path);
          setFileContent(content);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to read file');
          setFileContent(null);
        } finally {
          setLoading(false);
        }
      }
    },
    [device, packageName, listFiles]
  );

  const navigateUp = useCallback(async () => {
    if (!currentPath) return;

    const parentPath = currentPath.split('/').slice(0, -1).join('/');
    await listFiles(parentPath);
  }, [currentPath, listFiles]);

  const refresh = useCallback(() => {
    listFiles(currentPath);
  }, [currentPath, listFiles]);

  return {
    currentPath,
    files,
    selectedFile,
    fileContent,
    loading,
    error,
    listFiles,
    navigateTo,
    navigateUp,
    refresh,
  };
}
