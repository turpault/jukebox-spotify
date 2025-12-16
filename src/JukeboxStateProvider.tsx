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

// Log player events (not WebSocket - frontend uses HTTP long polling)
const logPlayerEvent = (event: string, data?: any, error?: any) => {
  const timestamp = new Date().toISOString();
  const traceId = generateTraceId();
  if (error) {
    console.error(`[TRACE] [${timestamp}] [${traceId}] ERROR: Player event ${event}`, {
      timestamp,
      traceId,
      level: 'error',
      message: `Player event ${event}`,
      direction: 'outbound',
      type: 'player',
      error: error instanceof Error ? error.message : String(error),
    });
  } else {
    console.log(`[TRACE] [${timestamp}] [${traceId}] INFO: Player event ${event}`, {
      timestamp,
      traceId,
      level: 'info',
      message: `Player event ${event}`,
      direction: 'outbound',
      type: 'player',
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
  isThemeLoaded: boolean;
  isViewLoaded: boolean;
  isHotkeysLoaded: boolean;
  isKioskModeLoaded: boolean;
  isConnectionStatusKnown: boolean;
  isConfigLoaded: boolean;

  // Spotify data
  loadingSpotifyId: string | null;

  // Actions
  togglePlay: () => Promise<void>;
  nextTrack: () => Promise<void>;
  previousTrack: () => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  seek: (position: number) => Promise<void>;
  toggleRepeat: () => Promise<void>;
  toggleShuffle: () => Promise<void>;
  addToQueue: (spotifyId: string) => Promise<void>;
  fetchTracksFromSpotifyId: (spotifyId: string) => Promise<string[]>;
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
  const [statusMessage, setStatusMessageState] = useState("No Spotify Connect instance connected");

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
  const [isThemeLoaded, setIsThemeLoaded] = useState<boolean>(false);
  const [isViewLoaded, setIsViewLoaded] = useState<boolean>(false);
  const [isHotkeysLoaded, setIsHotkeysLoaded] = useState<boolean>(false);
  const [isKioskModeLoaded, setIsKioskModeLoaded] = useState<boolean>(false);
  const [isConnectionStatusKnown, setIsConnectionStatusKnown] = useState<boolean>(false);

  // Spotify data
  const [loadingSpotifyId, setLoadingSpotifyId] = useState<string | null>(null);

  // Refs
  const pollAbortedRef = useRef<boolean>(false);
  const stateVersionRef = useRef<number>(0);
  const gamepadPollIntervalRef = useRef<number | null>(null);
  const lastGamepadStateRef = useRef<boolean[]>([]);

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
    logPlayerEvent('Fetching playback status');
    try {
      const status = await apiCall('/status');

      if (status) {
        logPlayerEvent('Playback status received', status);
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
        logPlayerEvent('No playback status available');
      }
    } catch (error) {
      logPlayerEvent('Error fetching playback status', null, error);
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
        // ConfigStateProvider will automatically refresh recent artists on next poll
      }
    } catch (error) {
      console.error('Error fetching track artist URI:', error);
    }
  }, [apiCall]);

  const pollEvents = useCallback(async () => {
    while (true) {
      // Reset abort flag for new poll
      pollAbortedRef.current = false;

      try {
        const url = `/api/events?version=${stateVersionRef.current}&timeout=30000`;
        logPlayerEvent('Polling for events', { version: stateVersionRef.current });
        const response = await fetch(url);

        // Check if poll was aborted before processing response
        if (pollAbortedRef.current) {
          return;
        }

        if (!response.ok) {
          throw new Error(`Poll failed: ${response.status} ${response.statusText}`);
        }
        const result = await response.json();
        logPlayerEvent('Events received', result);
        // Update connection status based on server response
        // Long polling timeouts are normal and don't indicate disconnection
        // The server always returns the current connection status
        setIsConnected(result.connected === true);
        if (result.connected) {
          setStatusMessage("Connected");
        } else {
          setStatusMessage("No Spotify Connect instance connected");
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
        // Check if poll was aborted
        if (pollAbortedRef.current) {
          return;
        }

        logPlayerEvent('Poll error', null, error);

        // Only mark as disconnected for actual connection failures, not timeouts
        // Timeouts are normal in long polling and don't indicate disconnection
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Check if this is a real connection error (not a timeout)
        const isConnectionError = errorMessage.includes('Failed to fetch') ||
          errorMessage.includes('NetworkError') ||
          errorMessage.includes('404') ||
          (error instanceof TypeError && errorMessage.includes('fetch'));

        if (isConnectionError) {
          // Only set disconnected for actual connection failures
          setIsConnected(false);
          if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
            setStatusMessage("Cannot connect to server. Is the server running?");
          } else if (errorMessage.includes('404')) {
            setStatusMessage("Server endpoint not found. Check server configuration.");
          } else {
            setStatusMessage(`Connection error: ${errorMessage}`);
          }
        } else {
          // For other errors (like timeouts), don't change connection status
          // Just log and continue polling
          console.warn('Poll error (non-fatal):', errorMessage);
        }

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }, [setIsConnected, setStatusMessage, setPlayerState]);

  const fetchKioskMode = useCallback(async () => {
    try {
      const response = await apiCall('/api/kiosk', 'GET', undefined);
      if (response && typeof response.kiosk === 'boolean') {
        setIsKioskMode(response.kiosk);
      }
      setIsKioskModeLoaded(true);
    } catch (error) {
      console.error('Failed to fetch kiosk mode:', error);
      setIsKioskModeLoaded(true); // Mark as loaded even on error to prevent infinite spinner
    }
  }, [apiCall]);

  const fetchTheme = useCallback(async () => {
    try {
      const response = await apiCall('/api/theme', 'GET', undefined);
      if (response && response.theme) {
        setThemeName(response.theme);
      }
      setIsThemeLoaded(true);
    } catch (error) {
      console.error('Failed to fetch theme:', error);
      setIsThemeLoaded(true); // Mark as loaded even on error to prevent infinite spinner
    }
  }, [apiCall]);

  const fetchView = useCallback(async () => {
    try {
      const response = await apiCall('/api/view', 'GET', undefined);
      if (response && response.view) {
        setViewName(response.view);
      }
      setIsViewLoaded(true);
    } catch (error) {
      console.error('Failed to fetch view:', error);
      setIsViewLoaded(true); // Mark as loaded even on error to prevent infinite spinner
    }
  }, [apiCall]);

  const fetchHotkeys = useCallback(async () => {
    try {
      const response = await apiCall('/api/hotkeys', 'GET', undefined);
      if (response) {
        setHotkeys(response);
      }
      setIsHotkeysLoaded(true);
    } catch (error) {
      console.error('Failed to fetch hotkeys:', error);
      setIsHotkeysLoaded(true); // Mark as loaded even on error to prevent infinite spinner
    }
  }, [apiCall]);


  // Player actions
  const togglePlay = useCallback(async () => {
    logPlayerEvent('User action: Toggle play/pause');
    await apiCall('/player/playpause', 'POST');
  }, [apiCall]);

  const nextTrack = useCallback(async () => {
    logPlayerEvent('User action: Next track');
    await apiCall('/player/next', 'POST');
  }, [apiCall]);

  const previousTrack = useCallback(async () => {
    logPlayerEvent('User action: Previous track');
    await apiCall('/player/prev', 'POST');
  }, [apiCall]);

  const setVolume = useCallback(async (volume: number) => {
    logPlayerEvent('User action: Set volume', { volume });
    await apiCall('/player/volume', 'POST', { volume });
  }, [apiCall]);

  const seek = useCallback(async (position: number) => {
    logPlayerEvent('User action: Seek', { position });
    await apiCall('/player/seek', 'POST', { position });
  }, [apiCall]);

  const toggleRepeat = useCallback(async () => {
    if (!playerState.repeatContext && !playerState.repeatTrack) {
      logPlayerEvent('User action: Enable repeat context');
      await apiCall('/player/repeat_context', 'POST', { repeat_context: true });
    } else if (playerState.repeatContext && !playerState.repeatTrack) {
      logPlayerEvent('User action: Switch to repeat track');
      await apiCall('/player/repeat_context', 'POST', { repeat_context: false });
      await apiCall('/player/repeat_track', 'POST', { repeat_track: true });
    } else {
      logPlayerEvent('User action: Disable repeat');
      await apiCall('/player/repeat_track', 'POST', { repeat_track: false });
    }
  }, [apiCall, playerState.repeatContext, playerState.repeatTrack]);

  const toggleShuffle = useCallback(async () => {
    const newValue = !playerState.shuffleContext;
    logPlayerEvent('User action: Toggle shuffle', { shuffle_context: newValue });
    await apiCall('/player/shuffle_context', 'POST', { shuffle_context: newValue });
  }, [apiCall, playerState.shuffleContext]);

  const fetchTracksFromSpotifyId = useCallback(async (spotifyId: string): Promise<string[]> => {
    try {
      // Parse Spotify URI: spotify:track:xxx or spotify:album:xxx
      const parts = spotifyId.split(':');
      if (parts.length < 3 || parts[0] !== 'spotify') {
        throw new Error('Invalid Spotify URI');
      }

      const type = parts[1]; // track, album, playlist, artist
      const spotifyIdValue = parts[2]; // The actual ID

      if (type === 'track') {
        // Single track, return as-is
        return [spotifyId];
      }

      let tracks: string[] = [];

      if (type === 'album') {
        // Fetch album tracks through server
        let offset = 0;
        const limit = 50;
        while (true) {
          const data = await apiCall(`/api/spotify/albums/${encodeURIComponent(spotifyIdValue)}/tracks?limit=${limit}&offset=${offset}`, 'GET', undefined);
          if (!data || !data.items) {
            throw new Error('Failed to fetch album tracks');
          }

          tracks.push(...data.items.map((item: any) => item.uri));

          if (!data.next) {
            break;
          }
          offset += limit;
        }
      } else if (type === 'playlist') {
        // Fetch playlist tracks through server
        let offset = 0;
        const limit = 50;
        while (true) {
          const data = await apiCall(`/api/spotify/playlists/${encodeURIComponent(spotifyIdValue)}/tracks?limit=${limit}&offset=${offset}`, 'GET', undefined);
          if (!data || !data.items) {
            throw new Error('Failed to fetch playlist tracks');
          }

          tracks.push(...data.items
            .filter((item: any) => item.track && item.track.uri)
            .map((item: any) => item.track.uri));

          if (!data.next) {
            break;
          }
          offset += limit;
        }
      } else if (type === 'artist') {
        // Fetch artist's top tracks through server
        const data = await apiCall(`/api/spotify/artists/${encodeURIComponent(spotifyIdValue)}/top-tracks?market=US`, 'GET', undefined);
        if (!data || !data.tracks) {
          throw new Error('Failed to fetch artist top tracks');
        }

        tracks = data.tracks.map((track: any) => track.uri);
      } else {
        throw new Error(`Unsupported type: ${type}`);
      }

      return tracks;
    } catch (error) {
      console.error('Failed to fetch tracks from Spotify ID:', error);
      throw error;
    }
  }, [apiCall]);

  const addToQueue = useCallback(async (spotifyId: string) => {
    setLoadingSpotifyId(spotifyId);
    try {
      // Fetch all tracks (handles single tracks, albums, playlists, artists)
      const tracks = await fetchTracksFromSpotifyId(spotifyId);

      if (tracks.length === 0) {
        setStatusMessage(`No tracks found for ${spotifyId}`);
        setLoadingSpotifyId(null);
        return;
      }

      // Enqueue tracks sequentially
      setStatusMessage(`Adding ${tracks.length} track${tracks.length > 1 ? 's' : ''} to queue...`);

      for (let i = 0; i < tracks.length; i++) {
        await apiCall('/player/add_to_queue', 'POST', { uri: tracks[i] });
        // Small delay between requests to avoid overwhelming the API
        if (i < tracks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const successMessage = `Added ${tracks.length} track${tracks.length > 1 ? 's' : ''} to queue`;
      setStatusMessage(successMessage);
      setTimeout(() => {
        // Clear the success message after 3 seconds
        setStatusMessage(prev => prev === successMessage ? '' : prev);
      }, 3000);
    } catch (error) {
      console.error('Failed to add to queue:', error);
      setStatusMessage(`Error adding to queue: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoadingSpotifyId(null);
    }
  }, [apiCall, fetchTracksFromSpotifyId, setLoadingSpotifyId, setStatusMessage]);

  // Initialize on mount
  useEffect(() => {
    fetchKioskMode();
    fetchTheme();
    fetchView();
    fetchHotkeys();
    fetchPlaybackStatus();

    // Check connection status immediately (before starting long polling)
    const checkInitialConnection = async () => {
      try {
        const response = await fetch(`/api/events?version=0&timeout=100`);
        if (response.ok) {
          const result = await response.json();
          setIsConnected(result.connected === true);
          if (result.connected) {
            setStatusMessage("Connected");
          } else {
            setStatusMessage("No Spotify Connect instance connected");
          }
        }
        setIsConnectionStatusKnown(true);
      } catch (error) {
        // Ignore errors from initial check, will be handled by polling
        console.warn('Initial connection check failed:', error);
        setIsConnectionStatusKnown(true); // Mark as known even on error to prevent infinite spinner
      }
    };
    checkInitialConnection();

    // Start polling - handle errors properly
    const startPolling = async () => {
      try {
        await pollEvents();
      } catch (error) {
        console.error('Failed to start polling:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
          setStatusMessage("Cannot connect to server. Is the server running?");
        } else {
          setStatusMessage(`Failed to connect: ${errorMessage}`);
        }
        setIsConnected(false);
      }
    };
    startPolling();

    return () => {
      // Set abort flag to stop polling
      pollAbortedRef.current = true;
      if (gamepadPollIntervalRef.current) {
        clearInterval(gamepadPollIntervalRef.current);
      }
    };
  }, [fetchPlaybackStatus, fetchTheme, fetchView, fetchKioskMode, fetchHotkeys, pollEvents]);

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

  // Compute if all config is loaded
  const isConfigLoaded = isThemeLoaded && isViewLoaded && isHotkeysLoaded && isKioskModeLoaded && isConnectionStatusKnown;

  const value: JukeboxStateContextValue = {
    playerState,
    statusMessage,
    isConnected,
    themeName,
    viewName,
    isKioskMode,
    hotkeys,
    isThemeLoaded,
    isViewLoaded,
    isHotkeysLoaded,
    isKioskModeLoaded,
    isConnectionStatusKnown,
    isConfigLoaded,
    loadingSpotifyId,
    togglePlay,
    nextTrack,
    previousTrack,
    setVolume,
    seek,
    toggleRepeat,
    toggleShuffle,
    addToQueue,
    fetchTracksFromSpotifyId,
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

