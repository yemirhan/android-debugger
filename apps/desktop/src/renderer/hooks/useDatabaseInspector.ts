import { useState, useEffect, useCallback, useRef } from 'react';
import type { Device, DatabaseInfo, DatabaseQueryResult } from '@android-debugger/shared';

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export function useDatabaseInspector(device: Device | null, packageName: string) {
  const [databases, setDatabases] = useState<DatabaseInfo[]>([]);
  const [selectedDatabase, setSelectedDatabaseState] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [queryResult, setQueryResult] = useState<DatabaseQueryResult | null>(null);
  const [customQuery, setCustomQuery] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [queryLoading, setQueryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRequestIdRef = useRef(0);
  const queryRequestIdRef = useRef(0);
  const selectedDatabaseRef = useRef<string | null>(null);
  const deviceId = device?.id;

  const fetchDatabases = useCallback(async () => {
    // Invalidate any in-flight request for a previous device/package.
    const requestId = ++listRequestIdRef.current;

    if (!deviceId || !packageName) {
      setDatabases([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.listDatabases(deviceId, packageName);
      if (requestId !== listRequestIdRef.current) return;
      setDatabases(result);
      // Keep the current selection if it still exists, otherwise pick the first database.
      const current = selectedDatabaseRef.current;
      if (!current || !result.some((db) => db.name === current)) {
        const first = result[0];
        selectedDatabaseRef.current = first?.name ?? null;
        setSelectedDatabaseState(first?.name ?? null);
        setSelectedTable(first?.tables[0] ?? null);
        setQueryResult(null);
      }
    } catch (err) {
      if (requestId !== listRequestIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to list databases');
      setDatabases([]);
    } finally {
      if (requestId === listRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [deviceId, packageName]);

  const refresh = useCallback(() => {
    fetchDatabases();
  }, [fetchDatabases]);

  // Reset and fetch databases when device or package changes
  useEffect(() => {
    queryRequestIdRef.current++;
    selectedDatabaseRef.current = null;
    setDatabases([]);
    setSelectedDatabaseState(null);
    setSelectedTable(null);
    setQueryResult(null);
    setQueryLoading(false);
    setError(null);
    fetchDatabases();
  }, [fetchDatabases]);

  // Switching databases invalidates the table selection and any result from the previous one.
  const setSelectedDatabase = useCallback((name: string | null) => {
    queryRequestIdRef.current++;
    selectedDatabaseRef.current = name;
    setSelectedDatabaseState(name);
    setSelectedTable(null);
    setQueryResult(null);
    setQueryLoading(false);
  }, []);

  const executeQuery = useCallback(
    async (query: string) => {
      if (!deviceId || !packageName || !selectedDatabase) {
        setError('No database selected');
        return null;
      }

      const requestId = ++queryRequestIdRef.current;
      setQueryLoading(true);
      setError(null);

      try {
        const result = await window.electronAPI.queryDatabase(
          deviceId,
          packageName,
          selectedDatabase,
          query
        );
        if (requestId !== queryRequestIdRef.current) return null;
        if (!result) {
          // The main process logs the underlying error and returns null.
          setError('Query failed. Check the SQL syntax and that the database is readable.');
        }
        setQueryResult(result);
        return result;
      } catch (err) {
        if (requestId !== queryRequestIdRef.current) return null;
        setError(err instanceof Error ? err.message : 'Query failed');
        setQueryResult(null);
        return null;
      } finally {
        if (requestId === queryRequestIdRef.current) {
          setQueryLoading(false);
        }
      }
    },
    [deviceId, packageName, selectedDatabase]
  );

  const loadTableData = useCallback(
    async (tableName: string) => {
      setSelectedTable(tableName);
      // Quote the identifier so table names with spaces, keywords or quotes work.
      return executeQuery(`SELECT * FROM ${quoteIdentifier(tableName)} LIMIT 100`);
    },
    [executeQuery]
  );

  const getSelectedDatabaseInfo = useCallback(() => {
    return databases.find((db) => db.name === selectedDatabase) || null;
  }, [databases, selectedDatabase]);

  return {
    databases,
    selectedDatabase,
    setSelectedDatabase,
    selectedTable,
    setSelectedTable,
    selectedDatabaseInfo: getSelectedDatabaseInfo(),
    queryResult,
    customQuery,
    setCustomQuery,
    loading,
    queryLoading,
    error,
    refresh,
    executeQuery,
    loadTableData,
  };
}
