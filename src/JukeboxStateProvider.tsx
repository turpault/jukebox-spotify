import React, { useEffect, useState, useRef, useCallback } from 'react';

// Re-export types and utilities from App
export interface TrackMetadata {
  context_uri?: string;
  uri?: string;
  name?: string;
  artist_names?: string[];
  album_name?: string;
  album_cover_url?: string;
  position?: number;
  duration?: number;
}

export interface PlayerState {
  isPaused: boolean;
  isActive: boolean;
  currentTrack: TrackMetadata | null;
  position: number;
  duration: number;
  volume: number;
  volumeMax: number;
  repeatContext: boolean;
  repeatTrack: boolean;
  shuffleContext: boolean;
}

export interface SpotifyIdWithArtwork {
  id: string;
  name: string;
  type: string;
  imageUrl: string;
}

export interface HotkeyConfig {
  keyboard: {
    playPause?: string;
    next?: string;
    previous?: string;
    volumeUp?: string;
    volumeDown?: string;
    seekForward?: string;
    seekBackward?: string;
    shuffle?: string;
    repeat?: string;
  };
  gamepad: {
    playPause?: number;
    next?: number;
    previous?: number;
    volumeUp?: number;
    volumeDown?: number;
    seekForward?: number;
    seekBackward?: number;
    shuffle?: number;
    repeat?: number;
  };
  volumeStep?: number;
  seekStep?: number;
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
        requestBody: data ? (typeof data === 'string' ? data : JSON.stringify(data)) : undefined,
        responseBody: response ? (typeof response === 'string' ? response : JSON.stringify(response)) : undefined,
      });
    } else {
      console.log(`[TRACE] [${timestamp}] [${traceId}] INFO: Outgoing API request`, {
        timestamp,
        traceId,
        level: 'info',
        message: 'Outgoing API request',
        method,
        path: endpoint,
        direction: 'outbound',
        type: 'api',
        requestBody: data ? (typeof data === 'string' ? data : JSON.stringify(data)) : undefined,
      });
    }
  }
};

const logWebSocket = (event: string, data?: any, error?: any) => {
  const timestamp = new Date().toISOString();
  const traceId = generateTraceId();

  if (error) {
    console.error(`[TRACE] [${timestamp}] [${traceId}] ERROR: WebSocket ${event}`, {
      timestamp,
      traceId,
      level: 'error',
      message: `WebSocket ${event}`,
      direction: 'outbound',
      type: 'websocket',
      error: error instanceof Error ? error.message : String(error),
    });
  } else {
    console.log(`[TRACE] [${timestamp}] [${traceId}] INFO: WebSocket ${event}`, {
      timestamp,
      traceId,
      level: 'info',
      message: `WebSocket ${event}`,
      direction: 'outbound',
      type: 'websocket',
      data: data ? (typeof data === 'string' ? data : JSON.stringify(data)) : undefined,
    });
  }
};

// Context interface
export interface JukeboxStateContextValue {
  // Player state
  playerState: PlayerState;
  statusMessage: string;
  isConnected: boolean;
  
  // UI state
  themeName: string;
  viewName: string;
  isKioskMode: boolean;
  hotkeys: HotkeyConfig | null;
  
  // Spotify data
  configuredSpotifyIds: SpotifyIdWithArtwork[];
  recentArtists: SpotifyIdWithArtwork[];
  loadingSpotifyId: string | null;
  
  // Actions
  togglePlay: () => Promise<void>;
  nextTrack: () => Promise<void>;
  previousTrack: () => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  seek: (position: number) => Promise<void>;
  toggleRepeat: () => Promise<void>;
  toggleShuffle: () => Promise<void>;
  setLoadingSpotifyId: (id: string | null) => void;
  setStatusMessage: (message: string | ((prev: string) => string)) => void;
  setThemeName: (name: string) => void;
}

const JukeboxStateContext = React.createContext<JukeboxStateContextValue | null>(null);

export function useJukeboxState() {
  const context = React.useContext(JukeboxStateContext);
  if (!context) {
    throw new Error('useJukeboxState must be used within JukeboxStateProvider');
  }
  return context;
}

interface JukeboxStateProviderProps {
  children: React.ReactNode;
}

export function JukeboxStateProvider({ children }: JukeboxStateProviderProps) {
  // Player state
  const [playerState, setPlayerState] = useState<PlayerState>({
    isPaused: true,
    isActive: false,
    currentTrack: null,
    position: 0,
    duration: 0,
    volume: 50,
    volumeMax: 100,
    repeatContext: false,
    repeatTrack: false,
    shuffleContext: false,
  });
  const [statusMessage, setStatusMessageState] = useState("Connecting to go-librespot...");
  
  // Wrapper to support both string and function updates
  const setStatusMessage = useCallback((message: string | ((prev: string) => string)) => {
    if (typeof message === 'function') {
      setStatusMessageState(prev => message(prev));
    } else {
      setStatusMessageState(message);
    }
  }, []);
  const [isConnected, setIsConnected] = useState(false);
  
  // UI state
  const [themeName, setThemeName] = useState<string>('steampunk');
  const [viewName, setViewName] = useState<string>('default');
  const [isKioskMode, setIsKioskMode] = useState<boolean>(false);
  const [hotkeys, setHotkeys] = useState<HotkeyConfig | null>(null);
  
  // Spotify data
  const [configuredSpotifyIds, setConfiguredSpotifyIds] = useState<SpotifyIdWithArtwork[]>([]);
  const [recentArtists, setRecentArtists] = useState<SpotifyIdWithArtwork[]>([]);
  const [loadingSpotifyId, setLoadingSpotifyId] = useState<string | null>(null);
  
  // Refs
  const pollAbortControllerRef = useRef<AbortController | null>(null);
  const stateVersionRef = useRef<number>(0);
  const gamepadPollIntervalRef = useRef<number | null>(null);
  const lastGamepadStateRef = useRef<boolean[]>([]);
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
      console.log(`[REST API] Response time: ${duration}ms`);
      return responseData;
    } catch (error) {
      logREST(method, endpoint, body, null, error);
      setStatusMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }, [setStatusMessage]);

  const fetchPlaybackStatus = useCallback(async () => {
    logWebSocket('Fetching playback status');
    try {
      const status = await apiCall('/status');

      if (status) {
        logWebSocket('Playback status received', status);
        setPlayerState(prev => ({
          ...prev,
          currentTrack: status.track ? {
            uri: status.track.uri,
            name: status.track.name,
            artist_names: status.track.artist_names || [],
            album_name: status.track.album_name,
            album_cover_url: status.track.album_cover_url,
            duration: status.track.duration,
          } : null,
          isPaused: status.paused === true,
          isActive: !status.stopped && status.track !== null && status.track !== undefined,
          volume: status.volume !== undefined ? status.volume : prev.volume,
          volumeMax: status.volume_steps !== undefined ? status.volume_steps : prev.volumeMax,
          repeatContext: status.repeat_context === true,
          repeatTrack: status.repeat_track === true,
          shuffleContext: status.shuffle_context === true,
        }));
      } else {
        logWebSocket('No playback status available');
      }
    } catch (error) {
      logWebSocket('Error fetching playback status', null, error);
    }
  }, [apiCall]);

  const fetchRecentArtists = useCallback(async () => {
    try {
      const idsResponse = await apiCall('/api/spotify/recent-artists', 'GET', undefined);
      if (idsResponse && idsResponse.ids) {
        const ids: string[] = idsResponse.ids;

        const metadataPromises = ids.map(async (id: string) => {
          try {
            const metadataResponse = await apiCall(`/api/spotify/metadata/${encodeURIComponent(id)}`, 'GET', undefined);
            if (metadataResponse) {
              return {
                id: metadataResponse.id || id,
                name: metadataResponse.name || 'Unknown',
                type: metadataResponse.type || 'unknown',
                imageUrl: metadataResponse.imageUrl || '',
              };
            }
            return { id, name: 'Unknown', type: 'unknown', imageUrl: '' };
          } catch (error) {
            console.error(`Failed to fetch metadata for ${id}:`, error);
            return { id, name: 'Unknown', type: 'unknown', imageUrl: '' };
          }
        });

        const metadata = await Promise.all(metadataPromises);
        setRecentArtists(metadata);
      }
    } catch (error) {
      console.error('Failed to fetch recent artists:', error);
    }
  }, [apiCall]);

  const fetchTrackArtistUri = useCallback(async (trackUri: string) => {
    try {
      const parts = trackUri.split(':');
      if (parts.length < 3 || parts[0] !== 'spotify' || parts[1] !== 'track') {
        return;
      }
      const trackId = parts[2];

      const trackData = await apiCall(`/api/spotify/tracks/${encodeURIComponent(trackId)}`, 'GET', undefined);
      if (!trackData) {
        return;
      }

      if (trackData.artists && trackData.artists.length > 0) {
        const artist = trackData.artists[0];
        const artistUri = artist.uri;

        await apiCall('/api/spotify/recent-artists', 'POST', { artistId: artistUri });
        await fetchRecentArtists();
      }
    } catch (error) {
      console.error('Error fetching track artist URI:', error);
    }
  }, [apiCall, fetchRecentArtists]);

  const pollEvents = useCallback(async () => {
    while (true) {
      if (pollAbortControllerRef.current) {
        pollAbortControllerRef.current.abort();
      }

      const abortController = new AbortController();
      pollAbortControllerRef.current = abortController;

      try {
        const url = `/api/events?version=${stateVersionRef.current}&timeout=30000`;
        logWebSocket('Polling for events', { version: stateVersionRef.current });

        const response = await fetch(url, {
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`Poll failed: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        logWebSocket('Events received', result);

        setIsConnected(result.connected || false);
        if (result.connected) {
          setStatusMessage("Connected to go-librespot");
        } else {
          setStatusMessage("Reconnecting...");
        }

        if (result.version !== undefined) {
          stateVersionRef.current = result.version;
        }

        if (result.state) {
          const state = result.state;
          setPlayerState(prev => {
            const newState = { ...prev };

            if (state.isActive !== undefined) newState.isActive = state.isActive;
            if (state.isPaused !== undefined) newState.isPaused = state.isPaused;
            if (state.currentTrack !== undefined) {
              newState.currentTrack = state.currentTrack;
            }
            if (state.position !== undefined) newState.position = state.position;
            if (state.duration !== undefined) newState.duration = state.duration;
            if (state.volume !== undefined) newState.volume = state.volume;
            if (state.volumeMax !== undefined) newState.volumeMax = state.volumeMax;
            if (state.repeatContext !== undefined) newState.repeatContext = state.repeatContext;
            if (state.repeatTrack !== undefined) newState.repeatTrack = state.repeatTrack;
            if (state.shuffleContext !== undefined) newState.shuffleContext = state.shuffleContext;

            return newState;
          });
        }
      } catch (error: any) {
        if (abortController.signal.aborted) {
          return;
        }

        logWebSocket('Poll error', null, error);
        setIsConnected(false);
        setStatusMessage("Reconnecting...");

        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }, []);

  const fetchKioskMode = useCallback(async () => {
    try {
      const response = await apiCall('/api/kiosk', 'GET', undefined);
      if (response && typeof response.kiosk === 'boolean') {
        setIsKioskMode(response.kiosk);
      }
    } catch (error) {
      console.error('Failed to fetch kiosk mode:', error);
    }
  }, [apiCall]);

  const fetchTheme = useCallback(async () => {
    try {
      const response = await apiCall('/api/theme', 'GET', undefined);
      if (response && response.theme) {
        setThemeName(response.theme);
      }
    } catch (error) {
      console.error('Failed to fetch theme:', error);
    }
  }, [apiCall]);

  const fetchView = useCallback(async () => {
    try {
      const response = await apiCall('/api/view', 'GET', undefined);
      if (response && response.view) {
        setViewName(response.view);
      }
    } catch (error) {
      console.error('Failed to fetch view:', error);
    }
  }, [apiCall]);

  const fetchHotkeys = useCallback(async () => {
    try {
      const response = await apiCall('/api/hotkeys', 'GET', undefined);
      if (response) {
        setHotkeys(response);
      }
    } catch (error) {
      console.error('Failed to fetch hotkeys:', error);
    }
  }, [apiCall]);

  const fetchSpotifyIds = useCallback(async () => {
    try {
      const idsResponse = await apiCall('/api/spotify/ids', 'GET', undefined);
      if (idsResponse && idsResponse.ids) {
        const ids: string[] = idsResponse.ids;

        const metadataPromises = ids.map(async (id: string) => {
          try {
            const metadataResponse = await apiCall(`/api/spotify/metadata/${encodeURIComponent(id)}`, 'GET', undefined);
            if (metadataResponse) {
              return {
                id: metadataResponse.id || id,
                name: metadataResponse.name || 'Unknown',
                type: metadataResponse.type || 'unknown',
                imageUrl: metadataResponse.imageUrl || '',
              };
            }
            return { id, name: 'Unknown', type: 'unknown', imageUrl: '' };
          } catch (error) {
            console.error(`Failed to fetch metadata for ${id}:`, error);
            return { id, name: 'Unknown', type: 'unknown', imageUrl: '' };
          }
        });

        const metadata = await Promise.all(metadataPromises);
        setConfiguredSpotifyIds(metadata);
      }
    } catch (error) {
      console.error('Failed to fetch Spotify IDs:', error);
    }
  }, [apiCall]);

  const checkConfigVersion = useCallback(async () => {
    try {
      const response = await apiCall('/api/config/version', 'GET', undefined);
      if (response && response.version) {
        const currentVersion = response.version;

        if (configVersionRef.current !== null && configVersionRef.current !== currentVersion) {
          console.log('Configuration changed, reloading...');
          await fetchTheme();
          await fetchView();
          await fetchHotkeys();
          await fetchSpotifyIds();
          await fetchRecentArtists();
        }

        configVersionRef.current = currentVersion;
      }
    } catch (error) {
      console.error('Failed to check config version:', error);
    }
  }, [apiCall, fetchTheme, fetchView, fetchHotkeys, fetchSpotifyIds, fetchRecentArtists]);

  // Player actions
  const togglePlay = useCallback(async () => {
    logWebSocket('User action: Toggle play/pause');
    await apiCall('/player/playpause', 'POST');
  }, [apiCall]);

  const nextTrack = useCallback(async () => {
    logWebSocket('User action: Next track');
    await apiCall('/player/next', 'POST');
  }, [apiCall]);

  const previousTrack = useCallback(async () => {
    logWebSocket('User action: Previous track');
    await apiCall('/player/prev', 'POST');
  }, [apiCall]);

  const setVolume = useCallback(async (volume: number) => {
    logWebSocket('User action: Set volume', { volume });
    await apiCall('/player/volume', 'POST', { volume });
  }, [apiCall]);

  const seek = useCallback(async (position: number) => {
    logWebSocket('User action: Seek', { position });
    await apiCall('/player/seek', 'POST', { position });
  }, [apiCall]);

  const toggleRepeat = useCallback(async () => {
    if (!playerState.repeatContext && !playerState.repeatTrack) {
      logWebSocket('User action: Enable repeat context');
      await apiCall('/player/repeat_context', 'POST', { repeat_context: true });
    } else if (playerState.repeatContext && !playerState.repeatTrack) {
      logWebSocket('User action: Switch to repeat track');
      await apiCall('/player/repeat_context', 'POST', { repeat_context: false });
      await apiCall('/player/repeat_track', 'POST', { repeat_track: true });
    } else {
      logWebSocket('User action: Disable repeat');
      await apiCall('/player/repeat_track', 'POST', { repeat_track: false });
    }
  }, [apiCall, playerState.repeatContext, playerState.repeatTrack]);

  const toggleShuffle = useCallback(async () => {
    const newValue = !playerState.shuffleContext;
    logWebSocket('User action: Toggle shuffle', { shuffle_context: newValue });
    await apiCall('/player/shuffle_context', 'POST', { shuffle_context: newValue });
  }, [apiCall, playerState.shuffleContext]);

  // Initialize on mount
  useEffect(() => {
    fetchKioskMode();
    fetchTheme();
    fetchView();
    fetchHotkeys();
    fetchSpotifyIds();
    fetchRecentArtists();
    fetchPlaybackStatus();
    pollEvents();

    configPollIntervalRef.current = window.setInterval(() => {
      checkConfigVersion();
    }, 2000);

    checkConfigVersion().then(() => {});

    return () => {
      if (pollAbortControllerRef.current) {
        pollAbortControllerRef.current.abort();
        pollAbortControllerRef.current = null;
      }
      if (gamepadPollIntervalRef.current) {
        clearInterval(gamepadPollIntervalRef.current);
      }
      if (configPollIntervalRef.current) {
        clearInterval(configPollIntervalRef.current);
      }
    };
  }, [fetchPlaybackStatus, fetchTheme, fetchView, fetchKioskMode, fetchHotkeys, fetchSpotifyIds, fetchRecentArtists, checkConfigVersion, pollEvents]);

  // Update position during playback
  useEffect(() => {
    if (!playerState.isPaused && playerState.isActive && playerState.duration > 0) {
      const interval = setInterval(() => {
        setPlayerState(prev => {
          const newPosition = prev.position + 1000;
          if (newPosition >= prev.duration) {
            return { ...prev, position: prev.duration };
          }
          return { ...prev, position: newPosition };
        });
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [playerState.isPaused, playerState.isActive, playerState.duration]);

  // Fetch artist URI when track changes
  useEffect(() => {
    const currentTrack = playerState.currentTrack;
    if (currentTrack?.uri && currentTrack?.artist_names && currentTrack.artist_names.length > 0) {
      const trackUriParts = currentTrack.uri.split(':');
      if (trackUriParts.length >= 3 && trackUriParts[0] === 'spotify' && trackUriParts[1] === 'track') {
        fetchTrackArtistUri(currentTrack.uri);
      }
    }
  }, [playerState.currentTrack?.uri, fetchTrackArtistUri]);

  const value: JukeboxStateContextValue = {
    playerState,
    statusMessage,
    isConnected,
    themeName,
    viewName,
    isKioskMode,
    hotkeys,
    configuredSpotifyIds,
    recentArtists,
    loadingSpotifyId,
    togglePlay,
    nextTrack,
    previousTrack,
    setVolume,
    seek,
    toggleRepeat,
    toggleShuffle,
    setLoadingSpotifyId,
    setStatusMessage,
    setThemeName,
  };

  return (
    <JukeboxStateContext.Provider value={value}>
      {children}
    </JukeboxStateContext.Provider>
  );
}

