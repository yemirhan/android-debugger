import { useState, useEffect, useCallback, useRef } from 'react';
import type { Device, FileEntry } from '@android-debugger/shared';

export function useFileInspector(device: Device | null, packageName: string) {
  const [currentPath, setCurrentPath] = useState<string>('');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only the most recent list/read request may update state, so a slow
  // response can't overwrite a newer navigation or a different device/package.
  const requestIdRef = useRef(0);
  const deviceId = device?.id;

  useEffect(() => {
    requestIdRef.current++;
    setCurrentPath('');
    setFiles([]);
    setSelectedFile(null);
    setFileContent(null);
    setLoading(false);
    setError(null);
  }, [deviceId, packageName]);

  const listFiles = useCallback(
    async (path: string = '') => {
      if (!deviceId || !packageName) {
        setError('No device or package selected');
        return;
      }

      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);

      try {
        const result = await window.electronAPI.listFiles(deviceId, packageName, path);
        if (requestId !== requestIdRef.current) return;
        setFiles(result);
        setCurrentPath(path);
        setSelectedFile(null);
        setFileContent(null);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setError(err instanceof Error ? err.message : 'Failed to list files');
        setFiles([]);
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [deviceId, packageName]
  );

  const navigateTo = useCallback(
    async (entry: FileEntry) => {
      if (entry.type === 'directory') {
        await listFiles(entry.path);
      } else {
        if (!deviceId || !packageName) {
          setError('No device or package selected');
          return;
        }

        const requestId = ++requestIdRef.current;
        setSelectedFile(entry);
        setFileContent(null);
        setLoading(true);
        setError(null);

        try {
          const content = await window.electronAPI.readFile(deviceId, packageName, entry.path);
          if (requestId !== requestIdRef.current) return;
          setFileContent(content);
        } catch (err) {
          if (requestId !== requestIdRef.current) return;
          setError(err instanceof Error ? err.message : 'Failed to read file');
          setFileContent(null);
        } finally {
          if (requestId === requestIdRef.current) {
            setLoading(false);
          }
        }
      }
    },
    [deviceId, packageName, listFiles]
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
