import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';

export interface SpotifyIdWithArtwork {
  id: string;
  name: string;
  type: string;
  imageUrl: string;
}

// Logging utilities
function generateTraceId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

const traceContexts = new Map<string, { startTime: number; method: string; endpoint: string }>();

const logREST = (method: string, endpoint: string, data?: any, response?: any, error?: any) => {
  const timestamp = new Date().toISOString();
  const traceId = generateTraceId();

  if (error) {
    const duration = traceContexts.get(traceId) ? Date.now() - traceContexts.get(traceId)!.startTime : undefined;
    console.error(`[TRACE] [${timestamp}] [${traceId}] ERROR: API request failed`, {
      timestamp,
      traceId,
      level: 'error',
      message: 'API request failed',
      method,
      path: endpoint,
      direction: 'outbound',
      type: 'api',
      ...(duration !== undefined && { durationMs: duration }),
      error: error instanceof Error ? error.message : String(error),
    });
    traceContexts.delete(traceId);
  } else {
    const startTime = Date.now();
    traceContexts.set(traceId, { startTime, method, endpoint });

    if (response !== undefined) {
      const duration = Date.now() - startTime;
      traceContexts.delete(traceId);
      console.log(`[TRACE] [${timestamp}] [${traceId}] INFO: API request completed`, {
        timestamp,
        traceId,
        level: 'info',
        message: 'API request completed',
        method,
        path: endpoint,
        direction: 'outbound',
        type: 'api',
        durationMs: duration,
        response,
      });
    }
  }
};

// Context interface
export interface ConfigStateContextValue {
  configuredSpotifyIds: string[]; // Just IDs, not full metadata
  recentArtists: string[]; // Just IDs, not full metadata
}

const ConfigStateContext = createContext<ConfigStateContextValue | undefined>(undefined);

interface ConfigStateProviderProps {
  children: React.ReactNode;
}

export function ConfigStateProvider({ children }: ConfigStateProviderProps) {
  const [configuredSpotifyIds, setConfiguredSpotifyIds] = useState<string[]>([]);
  const [recentArtists, setRecentArtists] = useState<string[]>([]);

  const configVersionRef = useRef<string | null>(null);
  const configPollIntervalRef = useRef<number | null>(null);

  const apiCall = useCallback(async (endpoint: string, method: string = 'GET', body?: any) => {
    const url = endpoint;
    logREST(method, endpoint, body);

    try {
      const startTime = Date.now();
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const duration = Date.now() - startTime;
      const responseData = await response.json().catch(() => null);

      if (!response.ok) {
        const error = new Error(`API call failed: ${response.status} ${response.statusText}`);
        logREST(method, endpoint, body, null, { status: response.status, statusText: response.statusText, duration: `${duration}ms` });
        throw error;
      }

      logREST(method, endpoint, body, responseData, null);
      return responseData;
    } catch (error) {
      logREST(method, endpoint, body, null, error);
      return null;
    }
  }, []);

  const fetchSpotifyIds = useCallback(async () => {
    try {
      const idsResponse = await apiCall('/api/spotify/ids', 'GET', undefined);
      if (idsResponse && idsResponse.ids) {
        const ids: string[] = idsResponse.ids;
        setConfiguredSpotifyIds(ids);
      }
    } catch (error) {
      console.error('Failed to fetch Spotify IDs:', error);
    }
  }, [apiCall]);

  const fetchRecentArtists = useCallback(async () => {
    try {
      const idsResponse = await apiCall('/api/spotify/recent-artists', 'GET', undefined);
      if (idsResponse && idsResponse.ids) {
        const ids: string[] = idsResponse.ids;
        setRecentArtists(ids);
      }
    } catch (error) {
      console.error('Failed to fetch recent artists:', error);
    }
  }, [apiCall]);

  const checkConfigVersion = useCallback(async () => {
    try {
      const response = await apiCall('/api/config/version', 'GET', undefined);
      if (response && response.version) {
        const currentVersion = response.version;

        if (configVersionRef.current !== null && configVersionRef.current !== currentVersion) {
          console.log('Configuration changed, reloading...');
          await fetchSpotifyIds();
          await fetchRecentArtists();
        }

        configVersionRef.current = currentVersion;
      }
    } catch (error) {
      console.error('Failed to check config version:', error);
    }
  }, [apiCall, fetchSpotifyIds, fetchRecentArtists]);

  // Initial fetch
  useEffect(() => {
    fetchSpotifyIds();
    fetchRecentArtists();
    checkConfigVersion();
  }, [fetchSpotifyIds, fetchRecentArtists, checkConfigVersion]);

  // Poll config version periodically
  useEffect(() => {
    // Poll every 5 seconds
    configPollIntervalRef.current = setInterval(() => {
      checkConfigVersion();
    }, 5000);

    return () => {
      if (configPollIntervalRef.current) {
        clearInterval(configPollIntervalRef.current);
        configPollIntervalRef.current = null;
      }
    };
  }, [checkConfigVersion]);

  const value: ConfigStateContextValue = {
    configuredSpotifyIds,
    recentArtists,
  };

  return (
    <ConfigStateContext.Provider value={value}>
      {children}
    </ConfigStateContext.Provider>
  );
}

export const useConfigState = () => {
  const context = useContext(ConfigStateContext);
  if (context === undefined) {
    throw new Error('useConfigState must be used within a ConfigStateProvider');
  }
  return context;
};

