import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';

interface TrackMetadata {
  context_uri?: string;
  uri?: string;
  name?: string;
  artist_names?: string[];
  album_name?: string;
  album_cover_url?: string;
  position?: number;
  duration?: number;
}

interface PlayerState {
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

interface SpotifyIdWithArtwork {
  id: string;
  name: string;
  type: string;
  imageUrl: string;
}

// All API calls are proxied through the server (local API)

// Helper function to convert image URL to cached endpoint
function getCachedImageUrl(imageUrl: string): string {
  if (!imageUrl) return '';
  // If already using the cached endpoint, return as-is
  if (imageUrl.startsWith('/api/image/')) return imageUrl;
  // Base64 encode the URL and use the cached endpoint
  // Use btoa for browser compatibility
  const base64Url = btoa(unescape(encodeURIComponent(imageUrl)));
  return `/api/image/${base64Url}`;
}

// Theme system
interface Theme {
  name: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    active: string;
    progress: string;
    progressTrack: string;
  };
  fonts: {
    primary: string;
    title: string;
  };
  effects: {
    shadow: string;
    borderRadius: string;
  };
}

const steampunkTheme: Theme = {
  name: 'Steampunk 1930s',
  colors: {
    primary: '#D4AF37',      // Brass/Gold
    secondary: '#B8860B',    // Darker gold
    accent: '#CD853F',       // Peru/bronze
    background: 'linear-gradient(135deg, #2C1810 0%, #1A0F08 50%, #0D0603 100%)', // Dark wood gradient
    surface: 'rgba(61, 40, 23, 0.8)', // Dark brown with transparency
    text: '#F4E4BC',         // Warm cream
    textSecondary: '#D4AF37', // Brass
    border: '#8B6914',       // Aged brass
    active: '#D4AF37',       // Brass for active states
    progress: '#D4AF37',     // Brass progress
    progressTrack: '#3D2817', // Dark brown track
  },
  fonts: {
    primary: '"Cinzel", "Playfair Display", "Times New Roman", serif',
    title: '"Cinzel", "Playfair Display", "Times New Roman", serif',
  },
  effects: {
    shadow: '0 8px 32px rgba(0, 0, 0, 0.8), 0 0 20px rgba(212, 175, 55, 0.3)',
    borderRadius: '8px',
  },
};

const matrixTheme: Theme = {
  name: 'Matrix',
  colors: {
    primary: '#00FF41',      // Matrix green
    secondary: '#00CC33',    // Darker green
    accent: '#00FF88',       // Bright green
    background: '#000000',   // Pure black
    surface: 'rgba(0, 0, 0, 0.9)', // Black with slight transparency
    text: '#00FF41',         // Matrix green
    textSecondary: '#00CC33', // Darker green
    border: '#003311',       // Dark green border
    active: '#00FF41',       // Matrix green for active states
    progress: '#00FF41',     // Matrix green progress
    progressTrack: '#001100', // Very dark green track
  },
  fonts: {
    primary: '"Courier New", "Monaco", "Consolas", monospace',
    title: '"Courier New", "Monaco", "Consolas", monospace',
  },
  effects: {
    shadow: '0 0 20px rgba(0, 255, 65, 0.5), 0 0 40px rgba(0, 255, 65, 0.3)',
    borderRadius: '0px',
  },
};

// Theme registry
const themes: Record<string, Theme> = {
  steampunk: steampunkTheme,
  matrix: matrixTheme,
};

// Client-side tracing utilities (matching server-side trace format)
function generateTraceId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

const traceContexts = new Map<string, { startTime: number; method: string; endpoint: string }>();

// Logging utilities with trace format
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

interface HotkeyConfig {
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
    shuffle?: number;
    repeat?: number;
  };
  volumeStep?: number;
  seekStep?: number;
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(steampunkTheme);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  const [themeName, setThemeName] = useState<string>('steampunk');
  const [viewName, setViewName] = useState<string>('default');
  const [isKioskMode, setIsKioskMode] = useState<boolean>(false);
  const [hotkeys, setHotkeys] = useState<HotkeyConfig | null>(null);
  const [configuredSpotifyIds, setConfiguredSpotifyIds] = useState<SpotifyIdWithArtwork[]>([]);
  const [recentArtists, setRecentArtists] = useState<SpotifyIdWithArtwork[]>([]);
  const [loadingSpotifyId, setLoadingSpotifyId] = useState<string | null>(null);

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
  const [statusMessage, setStatusMessage] = useState("Connecting to go-librespot...");
  const [isConnected, setIsConnected] = useState(false);
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
      // Use /status endpoint as per API spec
      const status = await apiCall('/status');

      if (status) {
        logWebSocket('Playback status received', status);
        // Update player state with current status according to API spec
        // Status response: paused, stopped, buffering, volume, volume_steps, track
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
          // Note: position is not in status response, it comes from WebSocket events
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
      // First get the list of IDs
      const idsResponse = await apiCall('/api/spotify/recent-artists', 'GET', undefined);
      if (idsResponse && idsResponse.ids) {
        const ids: string[] = idsResponse.ids;

        // Then fetch metadata for each ID
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
      // Parse track URI
      const parts = trackUri.split(':');
      if (parts.length < 3 || parts[0] !== 'spotify' || parts[1] !== 'track') {
        return;
      }
      const trackId = parts[2];

      // Fetch track details through server
      const trackData = await apiCall(`/api/spotify/tracks/${encodeURIComponent(trackId)}`, 'GET', undefined);
      if (!trackData) {
        return;
      }

      if (trackData.artists && trackData.artists.length > 0) {
        const artist = trackData.artists[0];
        const artistUri = artist.uri;

        // Add to recent artists via API (which will handle deduplication and persistence)
        await apiCall('/api/spotify/recent-artists', 'POST', { artistId: artistUri });

        // Refresh the recent artists list
        await fetchRecentArtists();
      }
    } catch (error) {
      console.error('Error fetching track artist URI:', error);
    }
  }, [apiCall, fetchRecentArtists]);

  const pollEvents = useCallback(async () => {
    while (true) {
      // Cancel any existing poll
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

        // Update connection status
        setIsConnected(result.connected || false);
        if (result.connected) {
          setStatusMessage("Connected to go-librespot");
        } else {
          setStatusMessage("Reconnecting...");
        }

        // Update state version
        if (result.version !== undefined) {
          stateVersionRef.current = result.version;
        }

        // Update player state from result
        if (result.state) {
          const state = result.state;
          setPlayerState(prev => {
            const newState = { ...prev };

            if (state.isActive !== undefined) newState.isActive = state.isActive;
            if (state.isPaused !== undefined) newState.isPaused = state.isPaused;
            if (state.currentTrack !== undefined) {
              newState.currentTrack = state.currentTrack;
              // Extract artist URI and add to Quick Add list
              if (state.currentTrack?.uri && state.currentTrack?.artist_names && state.currentTrack.artist_names.length > 0) {
                // Parse track URI to get artist ID
                const trackUriParts = state.currentTrack.uri.split(':');
                if (trackUriParts.length >= 3 && trackUriParts[0] === 'spotify' && trackUriParts[1] === 'track') {
                  // Fetch track details to get artist URI
                  fetchTrackArtistUri(state.currentTrack.uri);
                }
              }
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

        // Continue polling (loop will continue)
      } catch (error: any) {
        if (abortController.signal.aborted) {
          // Poll was cancelled, exit loop
          return;
        }

        logWebSocket('Poll error', null, error);
        setIsConnected(false);
        setStatusMessage("Reconnecting...");

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }, [fetchTrackArtistUri]);

  const fetchKioskMode = useCallback(async () => {
    try {
      const response = await apiCall('/api/kiosk', 'GET', undefined);
      if (response && typeof response.kiosk === 'boolean') {
        setIsKioskMode(response.kiosk);
        if (response.kiosk) {
          // Enter fullscreen if supported
          if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {
              // Ignore fullscreen errors (user may have denied permission)
            });
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch kiosk mode:', error);
    }
  }, [apiCall]);

  const fetchTheme = useCallback(async () => {
    try {
      const response = await apiCall('/api/theme', 'GET', undefined);
      if (response && response.theme) {
        const themeKey = response.theme;
        if (themes[themeKey]) {
          setTheme(themes[themeKey]);
          setThemeName(themeKey);
        }
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
      // First get the list of IDs
      const idsResponse = await apiCall('/api/spotify/ids', 'GET', undefined);
      if (idsResponse && idsResponse.ids) {
        const ids: string[] = idsResponse.ids;

        // Then fetch metadata for each ID
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

        // If we have a previous version and it changed, reload config
        if (configVersionRef.current !== null && configVersionRef.current !== currentVersion) {
          console.log('Configuration changed, reloading...');
          // Reload all configuration
          await fetchTheme();
          await fetchView();
          await fetchHotkeys();
          await fetchSpotifyIds();
          await fetchRecentArtists();
        }

        // Update version reference (do this after reload to avoid triggering again)
        configVersionRef.current = currentVersion;
      }
    } catch (error) {
      console.error('Failed to check config version:', error);
    }
  }, [apiCall, fetchTheme, fetchView, fetchHotkeys, fetchSpotifyIds, fetchRecentArtists]);

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
      const item = [...configuredSpotifyIds, ...recentArtists].find((s: SpotifyIdWithArtwork) => s.id === spotifyId);
      const itemName = item?.name || spotifyId;

      // Fetch all tracks (handles single tracks, albums, playlists, artists)
      const tracks = await fetchTracksFromSpotifyId(spotifyId);

      if (tracks.length === 0) {
        setStatusMessage(`No tracks found for ${itemName}`);
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

      setStatusMessage(`Added ${tracks.length} track${tracks.length > 1 ? 's' : ''} to queue: ${itemName}`);
      setTimeout(() => {
        setStatusMessage((prev) => {
          if (prev.startsWith('Added')) {
            return '';
          }
          return prev;
        });
      }, 3000);
    } catch (error) {
      console.error('Failed to add to queue:', error);
      setStatusMessage(`Error adding to queue: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoadingSpotifyId(null);
    }
  }, [configuredSpotifyIds, recentArtists, fetchTracksFromSpotifyId]);

  const updateTheme = useCallback(async (newThemeName: string) => {
    // Update theme immediately for responsive UI
    if (themes[newThemeName]) {
      setTheme(themes[newThemeName]);
      setThemeName(newThemeName);
    }

    // Persist to server in the background
    try {
      const response = await apiCall('/api/theme', 'POST', { theme: newThemeName });
      if (!response || !response.theme) {
        console.warn('Theme update may not have been persisted:', response);
      }
    } catch (error) {
      console.error('Failed to persist theme to server:', error);
      // Theme is already updated in UI, so we just log the error
    }
  }, []);

  useEffect(() => {
    // Fetch kiosk mode on page load
    fetchKioskMode();
    // Fetch theme on page load
    fetchTheme();
    // Fetch view on page load
    fetchView();
    // Fetch hotkeys on page load
    fetchHotkeys();
    // Fetch Spotify IDs on page load
    fetchSpotifyIds();
    // Fetch recent artists on page load
    fetchRecentArtists();
    // Fetch initial playback status on page load
    fetchPlaybackStatus();
    // Start long polling for real-time updates
    pollEvents();

    // Set up config version polling (check every 2 seconds)
    configPollIntervalRef.current = window.setInterval(() => {
      checkConfigVersion();
    }, 2000);

    // Initial config version check
    checkConfigVersion().then(() => {
      // Store initial version after first check
    });

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
          const newPosition = prev.position + 1000; // Increment by 1 second (1000ms)
          // Stop at duration
          if (newPosition >= prev.duration) {
            return { ...prev, position: prev.duration };
          }
          return { ...prev, position: newPosition };
        });
      }, 1000); // Update every second

      return () => clearInterval(interval);
    }
  }, [playerState.isPaused, playerState.isActive, playerState.duration]);

  // Update document body background when theme changes
  useEffect(() => {
    // Extract solid color from theme background (handle gradients)
    const bgColor = theme.colors.background.includes('gradient')
      ? '#000000' // Default to black for gradients
      : theme.colors.background;

    document.body.style.background = bgColor;
    document.body.style.color = theme.colors.text;

    return () => {
      // Reset on unmount
      document.body.style.background = '';
      document.body.style.color = '';
    };
  }, [theme]);

  // Kiosk mode: disable text selection and right-click
  useEffect(() => {
    if (isKioskMode) {
      // Disable text selection
      document.body.style.userSelect = 'none';
      document.body.style.webkitUserSelect = 'none';
      (document.body.style as any).mozUserSelect = 'none';
      (document.body.style as any).msUserSelect = 'none';

      // Disable right-click context menu
      const handleContextMenu = (e: MouseEvent) => {
        e.preventDefault();
        return false;
      };

      // Disable common keyboard shortcuts that could exit kiosk mode
      const handleKeyDown = (e: KeyboardEvent) => {
        // Allow F11 for fullscreen toggle, but block F12 (dev tools) and Ctrl+Shift+I
        if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
          e.preventDefault();
          return false;
        }
      };

      document.addEventListener('contextmenu', handleContextMenu);
      document.addEventListener('keydown', handleKeyDown);

      return () => {
        document.body.style.userSelect = '';
        document.body.style.webkitUserSelect = '';
        (document.body.style as any).mozUserSelect = '';
        (document.body.style as any).msUserSelect = '';
        document.removeEventListener('contextmenu', handleContextMenu);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isKioskMode]);

  const togglePlay = async () => {
    // Use /player/playpause endpoint as per API spec
    logWebSocket('User action: Toggle play/pause');
    await apiCall('/player/playpause', 'POST');
  };

  const nextTrack = async () => {
    logWebSocket('User action: Next track');
    await apiCall('/player/next', 'POST');
  };

  const previousTrack = async () => {
    // Use /player/prev endpoint as per API spec (not /player/previous)
    logWebSocket('User action: Previous track');
    await apiCall('/player/prev', 'POST');
  };

  const setVolume = async (volume: number) => {
    logWebSocket('User action: Set volume', { volume });
    await apiCall('/player/volume', 'POST', { volume });
  };

  const seek = async (position: number) => {
    logWebSocket('User action: Seek', { position });
    await apiCall('/player/seek', 'POST', { position });
  };

  const toggleRepeat = async () => {
    // Cycle through: off -> context -> track -> off
    if (!playerState.repeatContext && !playerState.repeatTrack) {
      // Off -> Context
      logWebSocket('User action: Enable repeat context');
      await apiCall('/player/repeat_context', 'POST', { repeat_context: true });
    } else if (playerState.repeatContext && !playerState.repeatTrack) {
      // Context -> Track
      logWebSocket('User action: Switch to repeat track');
      await apiCall('/player/repeat_context', 'POST', { repeat_context: false });
      await apiCall('/player/repeat_track', 'POST', { repeat_track: true });
    } else {
      // Track -> Off
      logWebSocket('User action: Disable repeat');
      await apiCall('/player/repeat_track', 'POST', { repeat_track: false });
    }
  };

  const toggleShuffle = async () => {
    const newValue = !playerState.shuffleContext;
    logWebSocket('User action: Toggle shuffle', { shuffle_context: newValue });
    await apiCall('/player/shuffle_context', 'POST', { shuffle_context: newValue });
  };

  const adjustVolume = async (delta: number) => {
    const newVolume = Math.max(0, Math.min(playerState.volumeMax, playerState.volume + delta));
    await setVolume(newVolume);
  };

  const adjustSeek = async (delta: number) => {
    const newPosition = Math.max(0, Math.min(playerState.duration, playerState.position + delta));
    await seek(newPosition);
  };

  // Keyboard hotkey handler
  useEffect(() => {
    if (!hotkeys) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger hotkeys when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const key = e.code || e.key;
      const kb = hotkeys.keyboard;

      if (kb.playPause && (key === kb.playPause || (kb.playPause === "Space" && key === " "))) {
        e.preventDefault();
        togglePlay();
      } else if (kb.next && key === kb.next) {
        e.preventDefault();
        nextTrack();
      } else if (kb.previous && key === kb.previous) {
        e.preventDefault();
        previousTrack();
      } else if (kb.volumeUp && key === kb.volumeUp) {
        e.preventDefault();
        adjustVolume(hotkeys.volumeStep || 5);
      } else if (kb.volumeDown && key === kb.volumeDown) {
        e.preventDefault();
        adjustVolume(-(hotkeys.volumeStep || 5));
      } else if (kb.seekForward && key === kb.seekForward) {
        e.preventDefault();
        adjustSeek(hotkeys.seekStep || 10000);
      } else if (kb.seekBackward && key === kb.seekBackward) {
        e.preventDefault();
        adjustSeek(-(hotkeys.seekStep || 10000));
      } else if (kb.shuffle && key === kb.shuffle) {
        e.preventDefault();
        toggleShuffle();
      } else if (kb.repeat && key === kb.repeat) {
        e.preventDefault();
        toggleRepeat();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [hotkeys, playerState.volume, playerState.volumeMax, playerState.position, playerState.duration]);

  // Gamepad hotkey handler
  useEffect(() => {
    if (!hotkeys) return;

    const pollGamepads = () => {
      const gamepads = navigator.getGamepads();
      if (!gamepads || gamepads.length === 0) return;

      const gamepad = gamepads[0]; // Use first connected gamepad
      if (!gamepad) return;

      // Initialize last state array if needed
      if (lastGamepadStateRef.current.length !== gamepad.buttons.length) {
        lastGamepadStateRef.current = new Array(gamepad.buttons.length).fill(false);
      }

      const gp = hotkeys.gamepad;
      const buttons = gamepad.buttons;

      // Check each configured button
      const checkButton = (buttonIndex: number | undefined, action: () => void) => {
        if (buttonIndex !== undefined && buttonIndex < buttons.length) {
          const pressed = buttons[buttonIndex].pressed;
          const wasPressed = lastGamepadStateRef.current[buttonIndex];

          if (pressed && !wasPressed) {
            action();
          }
          lastGamepadStateRef.current[buttonIndex] = pressed;
        }
      };

      checkButton(gp.playPause, togglePlay);
      checkButton(gp.next, nextTrack);
      checkButton(gp.previous, previousTrack);
      checkButton(gp.volumeUp, () => adjustVolume(hotkeys.volumeStep || 5));
      checkButton(gp.volumeDown, () => adjustVolume(-(hotkeys.volumeStep || 5)));
      checkButton(gp.shuffle, toggleShuffle);
      checkButton(gp.repeat, toggleRepeat);
    };

    // Poll gamepads every 50ms
    gamepadPollIntervalRef.current = window.setInterval(pollGamepads, 50);

    return () => {
      if (gamepadPollIntervalRef.current) {
        clearInterval(gamepadPollIntervalRef.current);
        gamepadPollIntervalRef.current = null;
      }
    };
  }, [hotkeys, playerState.volume, playerState.volumeMax]);

  const formatTime = (ms: number): string => {
    if (!ms || isNaN(ms)) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const styles = useMemo(() => createStyles(theme, isMobile), [theme, isMobile]);

  // Add spinner animation if not already in document
  useEffect(() => {
    if (!document.getElementById('spinner-keyframes')) {
      const style = document.createElement('style');
      style.id = 'spinner-keyframes';
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  if (!isConnected) {
    return (
      <div style={styles.container}>
        {/* Theme selector */}
        <div style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          zIndex: 1000,
        }}>
          <select
            value={themeName}
            onChange={(e) => updateTheme(e.target.value)}
            style={{
              background: theme.colors.surface,
              color: theme.colors.text,
              border: `2px solid ${theme.colors.border}`,
              borderRadius: theme.effects.borderRadius,
              padding: '8px 12px',
              fontFamily: theme.fonts.primary,
              fontSize: '0.9rem',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="steampunk">Steampunk 1930s</option>
            <option value="matrix">Matrix</option>
          </select>
        </div>
        <div style={styles.loadingContent}>
          <h1 style={styles.title}>Jukebox</h1>
          <div style={styles.spinnerContainer}>
            <div style={styles.spinner}></div>
          </div>
          <p style={styles.statusMessage}>{statusMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Theme selector - hidden in kiosk mode */}
      {!isKioskMode && (
        <div style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          zIndex: 1000,
        }}>
          <select
            value={themeName}
            onChange={(e) => updateTheme(e.target.value)}
            style={{
              background: theme.colors.surface,
              color: theme.colors.text,
              border: `2px solid ${theme.colors.border}`,
              borderRadius: theme.effects.borderRadius,
              padding: '8px 12px',
              fontFamily: theme.fonts.primary,
              fontSize: '0.9rem',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="steampunk">Steampunk 1930s</option>
            <option value="matrix">Matrix</option>
          </select>
        </div>
      )}
      <div style={styles.content}>
        {!isConnected && (
          <>
            <h1 style={{ ...styles.title, fontSize: '3rem', marginBottom: '10px' }}>Jukebox</h1>
            <p style={styles.status}>{statusMessage}</p>
          </>
        )}

        {playerState.isActive && playerState.currentTrack ? (
          <>
            <div style={styles.player}>
              {playerState.currentTrack.album_cover_url && (
                <img
                  src={getCachedImageUrl(playerState.currentTrack.album_cover_url)}
                  alt={playerState.currentTrack.name || 'Album cover'}
                  style={styles.albumArt}
                />
              )}
              <div style={styles.trackInfo}>
                <h2 style={{
                  color: theme.colors.text,
                  fontFamily: theme.fonts.title,
                  margin: '10px 0',
                  fontSize: '1.8rem',
                  textShadow: theme.name === 'Matrix'
                    ? `0 0 10px ${theme.colors.primary}, 0 0 20px ${theme.colors.primary}`
                    : `0 2px 10px rgba(212, 175, 55, 0.3)`
                }}>{playerState.currentTrack.name || 'Unknown Track'}</h2>
                <h3 style={{
                  color: theme.colors.textSecondary,
                  fontFamily: theme.fonts.primary,
                  margin: '5px 0',
                  fontSize: '1.2rem',
                  fontWeight: 'normal'
                }}>{playerState.currentTrack.artist_names?.join(', ') || 'Unknown Artist'}</h3>
                {playerState.currentTrack.album_name && (
                  <p style={{
                    fontSize: '0.9em',
                    color: theme.colors.textSecondary,
                    opacity: 0.8,
                    fontFamily: theme.fonts.primary,
                    margin: '5px 0'
                  }}>{playerState.currentTrack.album_name}</p>
                )}
              </div>
              {/* Progress bar / Seek control */}
              <div style={styles.progressContainer}>
                <span style={styles.timeLabel}>{formatTime(playerState.position)}</span>
                <input
                  type="range"
                  min={0}
                  max={playerState.duration || 0}
                  value={playerState.position}
                  onChange={(e) => {
                    const newPosition = parseInt(e.target.value);
                    setPlayerState(prev => ({ ...prev, position: newPosition }));
                  }}
                  onMouseUp={(e) => {
                    const target = e.target as HTMLInputElement;
                    seek(parseInt(target.value));
                  }}
                  onTouchEnd={(e) => {
                    const target = e.target as HTMLInputElement;
                    seek(parseInt(target.value));
                  }}
                  style={styles.progressBar}
                />
                <span style={styles.timeLabel}>{formatTime(playerState.duration)}</span>
              </div>

              {/* Main playback controls - hidden in dash view */}
              {viewName !== 'dash' && (
                <div style={styles.controls}>
                  <button
                    style={{ ...styles.button, ...(playerState.shuffleContext ? styles.buttonActive : {}) }}
                    onClick={toggleShuffle}
                    title="Shuffle"
                    onMouseEnter={(e) => {
                      if (!playerState.shuffleContext) {
                        Object.assign(e.currentTarget.style, styles.buttonHover);
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!playerState.shuffleContext) {
                        Object.assign(e.currentTarget.style, styles.button);
                      }
                    }}
                  >
                    <div style={styles.iconShuffle}>
                      <div style={styles.iconShuffleArrow1}></div>
                      <div style={styles.iconShuffleLine}></div>
                      <div style={styles.iconShuffleArrow2}></div>
                    </div>
                  </button>
                  <button
                    style={styles.button}
                    onClick={previousTrack}
                    title="Previous"
                    onMouseEnter={(e) => Object.assign(e.currentTarget.style, styles.buttonHover)}
                    onMouseLeave={(e) => Object.assign(e.currentTarget.style, styles.button)}
                  >
                    <div style={styles.iconPrevious}>
                      <div style={styles.iconPreviousTriangle}></div>
                      <div style={styles.iconPreviousTriangle}></div>
                    </div>
                  </button>
                  <button
                    style={styles.button}
                    onClick={togglePlay}
                    title={playerState.isPaused ? "Play" : "Pause"}
                    onMouseEnter={(e) => Object.assign(e.currentTarget.style, styles.buttonHover)}
                    onMouseLeave={(e) => Object.assign(e.currentTarget.style, styles.button)}
                  >
                    {playerState.isPaused ? (
                      <div style={styles.iconPlay}></div>
                    ) : (
                      <div style={styles.iconPause}>
                        <div style={styles.iconPauseBar}></div>
                        <div style={styles.iconPauseBar}></div>
                      </div>
                    )}
                  </button>
                  <button
                    style={styles.button}
                    onClick={nextTrack}
                    title="Next"
                    onMouseEnter={(e) => Object.assign(e.currentTarget.style, styles.buttonHover)}
                    onMouseLeave={(e) => Object.assign(e.currentTarget.style, styles.button)}
                  >
                    <div style={styles.iconNext}>
                      <div style={styles.iconNextTriangle}></div>
                      <div style={styles.iconNextTriangle}></div>
                    </div>
                  </button>
                  <button
                    style={{ ...styles.button, ...(playerState.repeatTrack || playerState.repeatContext ? styles.buttonActive : {}) }}
                    onClick={toggleRepeat}
                    title={playerState.repeatTrack ? "Repeat Track" : playerState.repeatContext ? "Repeat Context" : "Repeat Off"}
                    onMouseEnter={(e) => {
                      if (!playerState.repeatTrack && !playerState.repeatContext) {
                        Object.assign(e.currentTarget.style, styles.buttonHover);
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!playerState.repeatTrack && !playerState.repeatContext) {
                        Object.assign(e.currentTarget.style, styles.button);
                      }
                    }}
                  >
                    {playerState.repeatTrack ? (
                      <div style={styles.iconRepeatOne}>
                        <div style={styles.iconRepeatOneText}>1</div>
                      </div>
                    ) : (
                      <div style={styles.iconRepeat}>
                        <div style={styles.iconRepeatArrow}></div>
                      </div>
                    )}
                  </button>
                </div>
              )}

              {/* Volume control - hidden in dash view */}
              {viewName !== 'dash' && (
                <div style={styles.volumeContainer}>
                  <div style={styles.iconVolume}>
                    <div style={styles.iconVolumeBody}></div>
                    <div style={styles.iconVolumeWaves}></div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={playerState.volumeMax || 100}
                    value={playerState.volume}
                    onChange={(e) => {
                      const newVolume = parseInt(e.target.value);
                      setPlayerState(prev => ({ ...prev, volume: newVolume }));
                    }}
                    onMouseUp={(e) => {
                      const target = e.target as HTMLInputElement;
                      setVolume(parseInt(target.value));
                    }}
                    onTouchEnd={(e) => {
                      const target = e.target as HTMLInputElement;
                      setVolume(parseInt(target.value));
                    }}
                    style={styles.volumeSlider}
                  />
                  <span style={styles.volumeLabel}>{Math.round((playerState.volume / (playerState.volumeMax || 100)) * 100)}%</span>
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={styles.placeholder}>
            <p>Waiting for playback...</p>
            <p style={{ fontSize: '0.8em', opacity: 0.7 }}>Play music on Spotify to see it here.</p>
          </div>
        )}

        {/* Spotify ID Lists - Side by side on desktop, stacked on mobile - hidden in dash view */}
        {viewName !== 'dash' && (
          <div style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            width: '100%',
            gap: isMobile ? '0' : '0',
            marginTop: isMobile ? '20px' : '0',
          }}>
            {/* Configured IDs - Left Side */}
            {configuredSpotifyIds.length > 0 && (
              <div style={styles.spotifyIdsSidebarLeft}>
                <div style={styles.spotifyIdsSidebarTitle}>Configured</div>
                <div style={styles.spotifyIdsSidebarScroll}>
                  {configuredSpotifyIds.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => addToQueue(item.id)}
                      style={styles.spotifyIdButton}
                      title={item.name}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.05)';
                        e.currentTarget.style.boxShadow = theme.effects.shadow;
                        const overlay = e.currentTarget.querySelector('[data-overlay]') as HTMLElement;
                        if (overlay) overlay.style.opacity = '1';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = 'none';
                        const overlay = e.currentTarget.querySelector('[data-overlay]') as HTMLElement;
                        if (overlay) overlay.style.opacity = '0';
                      }}
                    >
                      {item.imageUrl ? (
                        <img
                          src={getCachedImageUrl(item.imageUrl)}
                          alt={item.name}
                          style={{
                            ...styles.spotifyIdImage,
                            opacity: loadingSpotifyId === item.id ? 0.3 : 1,
                            filter: loadingSpotifyId === item.id ? 'grayscale(100%)' : 'none',
                          }}
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            const parent = target.parentElement;
                            if (parent) {
                              const fallback = document.createElement('div');
                              fallback.style.cssText = `width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: ${theme.colors.surface}; color: ${theme.colors.text}; font-size: 0.8rem; text-align: center; padding: 10px; font-family: ${theme.fonts.primary};`;
                              fallback.textContent = item.name;
                              parent.appendChild(fallback);
                            }
                          }}
                        />
                      ) : (
                        <div style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: theme.colors.surface,
                          color: theme.colors.text,
                          fontSize: '0.8rem',
                          textAlign: 'center',
                          padding: '10px',
                          fontFamily: theme.fonts.primary,
                          opacity: loadingSpotifyId === item.id ? 0.3 : 1,
                          filter: loadingSpotifyId === item.id ? 'grayscale(100%)' : 'none',
                          transition: 'opacity 0.3s, filter 0.3s',
                        }}>
                          {item.name}
                        </div>
                      )}
                      <div style={styles.spotifyIdOverlay} data-overlay>
                        <div style={styles.spotifyIdName}>{item.name}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Artists - Right Side */}
            {recentArtists.length > 0 && (
              <div style={styles.spotifyIdsSidebarRight}>
                <div style={styles.spotifyIdsSidebarTitle}>Recent Artists</div>
                <div style={styles.spotifyIdsSidebarScroll}>
                  {recentArtists.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => addToQueue(item.id)}
                      style={styles.spotifyIdButton}
                      title={item.name}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.05)';
                        e.currentTarget.style.boxShadow = theme.effects.shadow;
                        const overlay = e.currentTarget.querySelector('[data-overlay]') as HTMLElement;
                        if (overlay) overlay.style.opacity = '1';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = 'none';
                        const overlay = e.currentTarget.querySelector('[data-overlay]') as HTMLElement;
                        if (overlay) overlay.style.opacity = '0';
                      }}
                    >
                      {item.imageUrl ? (
                        <img
                          src={getCachedImageUrl(item.imageUrl)}
                          alt={item.name}
                          style={{
                            ...styles.spotifyIdImage,
                            opacity: loadingSpotifyId === item.id ? 0.3 : 1,
                            filter: loadingSpotifyId === item.id ? 'grayscale(100%)' : 'none',
                          }}
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            const parent = target.parentElement;
                            if (parent) {
                              const fallback = document.createElement('div');
                              fallback.style.cssText = `width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: ${theme.colors.surface}; color: ${theme.colors.text}; font-size: 0.8rem; text-align: center; padding: 10px; font-family: ${theme.fonts.primary};`;
                              fallback.textContent = item.name;
                              parent.appendChild(fallback);
                            }
                          }}
                        />
                      ) : (
                        <div style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: theme.colors.surface,
                          color: theme.colors.text,
                          fontSize: '0.8rem',
                          textAlign: 'center',
                          padding: '10px',
                          fontFamily: theme.fonts.primary,
                          opacity: loadingSpotifyId === item.id ? 0.3 : 1,
                          filter: loadingSpotifyId === item.id ? 'grayscale(100%)' : 'none',
                          transition: 'opacity 0.3s, filter 0.3s',
                        }}>
                          {item.name}
                        </div>
                      )}
                      <div style={styles.spotifyIdOverlay} data-overlay>
                        <div style={styles.spotifyIdName}>{item.name}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Create styles function that uses theme and mobile detection
const createStyles = (theme: Theme, isMobile: boolean): Record<string, React.CSSProperties> => ({
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    minHeight: '100vh',
    fontFamily: theme.fonts.primary,
    background: theme.colors.background,
    color: theme.colors.text,
    position: 'relative',
    overflow: 'hidden',
    // Safe area padding - iOS 9 doesn't support env(), but also doesn't have notches
    // So we can safely use 0 for iOS 9 devices
    // For iOS 11+, the CSS @supports rule in index.html will add the env() padding
    paddingTop: isMobile ? '0' : '0',
    paddingBottom: isMobile ? '0' : '0',
    paddingLeft: isMobile ? '0' : '0',
    paddingRight: isMobile ? '0' : '0',
  },
  loadingContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '30px',
  },
  title: {
    fontSize: isMobile ? '2.5rem' : '4rem',
    margin: 0,
    fontWeight: 'bold',
    fontFamily: theme.fonts.title,
    background: `linear-gradient(135deg, ${theme.colors.primary} 0%, ${theme.colors.secondary} 100%)`,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    textShadow: theme.name === 'Matrix'
      ? `0 0 20px ${theme.colors.primary}, 0 0 40px ${theme.colors.primary}`
      : `0 0 30px rgba(212, 175, 55, 0.5)`,
    letterSpacing: theme.name === 'Matrix' ? '0.2em' : '0.1em',
  },
  spinnerContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    width: '60px',
    height: '60px',
    border: `4px solid ${theme.colors.border}`,
    borderTop: `4px solid ${theme.colors.primary}`,
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    boxShadow: theme.name === 'Matrix'
      ? `0 0 20px ${theme.colors.primary}`
      : `0 0 20px rgba(212, 175, 55, 0.4)`,
  },
  statusMessage: {
    color: theme.colors.textSecondary,
    fontSize: '1.2rem',
    margin: 0,
    fontFamily: theme.fonts.primary,
  },
  content: {
    textAlign: 'center',
    maxWidth: isMobile ? '100%' : '800px',
    width: '100%',
    padding: isMobile ? '15px' : '20px',
    marginLeft: isMobile ? '0' : '180px',
    marginRight: isMobile ? '0' : '180px',
    background: theme.colors.surface,
    borderRadius: theme.effects.borderRadius,
    border: `2px solid ${theme.colors.border}`,
    boxShadow: theme.effects.shadow,
    boxSizing: 'border-box',
  },
  status: {
    color: theme.colors.textSecondary,
    marginBottom: '20px',
    fontFamily: theme.fonts.primary,
  },
  player: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '20px',
  },
  albumArt: {
    width: isMobile ? '250px' : '300px',
    height: isMobile ? '250px' : '300px',
    maxWidth: '100%',
    borderRadius: theme.effects.borderRadius,
    boxShadow: theme.effects.shadow,
    border: `3px solid ${theme.colors.border}`,
  },
  trackInfo: {
    marginBottom: '20px',
  },
  controls: {
    display: 'flex',
    gap: isMobile ? '15px' : '20px',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  button: {
    background: `linear-gradient(135deg, ${theme.colors.surface} 0%, ${theme.colors.border} 100%)`,
    border: `2px solid ${theme.colors.border}`,
    color: theme.colors.text,
    fontSize: isMobile ? '1.5rem' : '2rem',
    cursor: 'pointer',
    padding: isMobile ? '15px' : '12px',
    borderRadius: '50%',
    transition: 'all 0.3s ease',
    boxShadow: `0 4px 15px rgba(0, 0, 0, 0.5)`,
    minWidth: isMobile ? '56px' : '60px',
    minHeight: isMobile ? '56px' : '60px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    touchAction: 'manipulation',
    WebkitTapHighlightColor: 'transparent',
  },
  buttonHover: {
    background: `linear-gradient(135deg, ${theme.colors.border} 0%, ${theme.colors.primary} 100%)`,
    boxShadow: theme.name === 'Matrix'
      ? `0 0 20px ${theme.colors.primary}, 0 4px 15px rgba(0, 0, 0, 0.5)`
      : `0 0 20px rgba(212, 175, 55, 0.5), 0 4px 15px rgba(0, 0, 0, 0.5)`,
    transform: 'scale(1.05)',
  },
  buttonActive: {
    background: `linear-gradient(135deg, ${theme.colors.primary} 0%, ${theme.colors.secondary} 100%)`,
    boxShadow: theme.name === 'Matrix'
      ? `0 0 25px ${theme.colors.primary}, 0 4px 15px rgba(0, 0, 0, 0.5)`
      : `0 0 25px rgba(212, 175, 55, 0.6), 0 4px 15px rgba(0, 0, 0, 0.5)`,
    border: `2px solid ${theme.colors.primary}`,
  },
  progressContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: isMobile ? '8px' : '10px',
    width: '100%',
    maxWidth: isMobile ? '100%' : '500px',
    padding: isMobile ? '0 10px' : '0',
  },
  progressBar: {
    flex: 1,
    height: isMobile ? '10px' : '8px',
    borderRadius: '4px',
    background: theme.colors.progressTrack,
    outline: 'none',
    cursor: 'pointer',
    border: `1px solid ${theme.colors.border}`,
    touchAction: 'pan-y',
    WebkitTapHighlightColor: 'transparent',
  },
  timeLabel: {
    fontSize: isMobile ? '0.8em' : '0.9em',
    color: theme.colors.textSecondary,
    minWidth: isMobile ? '40px' : '45px',
    textAlign: 'center',
    fontFamily: theme.fonts.primary,
    fontVariantNumeric: 'tabular-nums',
  },
  volumeContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: isMobile ? '8px' : '10px',
    width: '100%',
    maxWidth: isMobile ? '100%' : '300px',
    padding: isMobile ? '0 10px' : '0',
  },
  // Icon styles - simple shapes
  iconPlay: {
    width: 0,
    height: 0,
    borderLeft: `12px solid ${theme.colors.text}`,
    borderTop: '8px solid transparent',
    borderBottom: '8px solid transparent',
    marginLeft: '4px',
  },
  iconPause: {
    display: 'flex',
    gap: '4px',
    alignItems: 'center',
  },
  iconPauseBar: {
    width: '4px',
    height: '16px',
    background: theme.colors.text,
  },
  iconPrevious: {
    display: 'flex',
    gap: '2px',
    alignItems: 'center',
  },
  iconPreviousTriangle: {
    width: 0,
    height: 0,
    borderRight: `8px solid ${theme.colors.text}`,
    borderTop: '6px solid transparent',
    borderBottom: '6px solid transparent',
  },
  iconNext: {
    display: 'flex',
    gap: '2px',
    alignItems: 'center',
  },
  iconNextTriangle: {
    width: 0,
    height: 0,
    borderLeft: `8px solid ${theme.colors.text}`,
    borderTop: '6px solid transparent',
    borderBottom: '6px solid transparent',
  },
  iconShuffle: {
    position: 'relative',
    width: '20px',
    height: '16px',
  },
  iconShuffleArrow1: {
    position: 'absolute',
    left: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    width: 0,
    height: 0,
    borderTop: `4px solid transparent`,
    borderBottom: `4px solid transparent`,
    borderLeft: `8px solid ${theme.colors.text}`,
  },
  iconShuffleArrow2: {
    position: 'absolute',
    right: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    width: 0,
    height: 0,
    borderTop: `4px solid transparent`,
    borderBottom: `4px solid transparent`,
    borderRight: `8px solid ${theme.colors.text}`,
  },
  iconShuffleLine: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    width: '2px',
    height: '12px',
    background: theme.colors.text,
  },
  iconRepeat: {
    position: 'relative',
    width: '18px',
    height: '18px',
    border: `2px solid ${theme.colors.text}`,
    borderRadius: '50%',
  },
  iconRepeatArrow: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%) rotate(45deg)',
    width: 0,
    height: 0,
    borderTop: `4px solid transparent`,
    borderBottom: `4px solid transparent`,
    borderRight: `6px solid ${theme.colors.text}`,
    marginTop: '-2px',
  },
  iconRepeatOne: {
    position: 'relative',
    width: '18px',
    height: '18px',
    border: `2px solid ${theme.colors.text}`,
    borderRadius: '50%',
  },
  iconRepeatOneText: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    fontSize: '10px',
    fontWeight: 'bold',
    color: theme.colors.text,
    lineHeight: 1,
  },
  iconVolume: {
    position: 'relative',
    width: '20px',
    height: '16px',
  },
  iconVolumeBody: {
    position: 'absolute',
    left: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    width: '10px',
    height: '10px',
    border: `2px solid ${theme.colors.textSecondary}`,
    borderRight: 'none',
    borderRadius: '2px 0 0 2px',
  },
  spotifyIdsSidebarLeft: {
    position: isMobile ? 'relative' : 'fixed',
    left: 0,
    top: 0,
    bottom: isMobile ? 'auto' : 0,
    width: isMobile ? '100%' : '160px',
    maxHeight: isMobile ? '200px' : 'none',
    padding: isMobile ? '10px' : '15px 10px',
    background: theme.colors.surface,
    borderRight: isMobile ? 'none' : `2px solid ${theme.colors.border}`,
    borderBottom: isMobile ? `2px solid ${theme.colors.border}` : 'none',
    boxShadow: isMobile ? 'none' : `4px 0 20px rgba(0, 0, 0, 0.5)`,
    zIndex: 100,
    display: 'flex',
    flexDirection: 'column',
    marginBottom: isMobile ? '10px' : '0',
  },
  spotifyIdsSidebarRight: {
    position: isMobile ? 'relative' : 'fixed',
    right: 0,
    top: 0,
    bottom: isMobile ? 'auto' : 0,
    width: isMobile ? '100%' : '160px',
    maxHeight: isMobile ? '200px' : 'none',
    padding: isMobile ? '10px' : '15px 10px',
    background: theme.colors.surface,
    borderLeft: isMobile ? 'none' : `2px solid ${theme.colors.border}`,
    borderTop: isMobile ? `2px solid ${theme.colors.border}` : 'none',
    boxShadow: isMobile ? 'none' : `-4px 0 20px rgba(0, 0, 0, 0.5)`,
    zIndex: 100,
    display: 'flex',
    flexDirection: 'column',
    marginTop: isMobile ? '10px' : '0',
  },
  spotifyIdsSidebarTitle: {
    color: theme.colors.primary,
    fontSize: '0.9rem',
    fontWeight: 'bold',
    fontFamily: theme.fonts.title,
    marginBottom: '15px',
    textAlign: 'center',
    paddingBottom: '10px',
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  spotifyIdsSidebarScroll: {
    display: 'flex',
    flexDirection: isMobile ? 'row' : 'column',
    gap: isMobile ? '10px' : '15px',
    overflowY: isMobile ? 'hidden' : 'auto',
    overflowX: isMobile ? 'auto' : 'hidden',
    scrollbarWidth: 'thin',
    scrollbarColor: `${theme.colors.border} ${theme.colors.surface}`,
    flex: 1,
    WebkitOverflowScrolling: 'touch',
  },
  spotifyIdButton: {
    position: 'relative',
    flexShrink: 0,
    width: '100%',
    aspectRatio: '1',
    padding: 0,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.effects.borderRadius,
    background: theme.colors.surface,
    cursor: 'pointer',
    overflow: 'hidden',
    transition: 'transform 0.2s, box-shadow 0.2s',
    outline: 'none',
  },
  spotifyIdImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
    transition: 'opacity 0.3s, filter 0.3s',
  },
  spotifyIdOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    background: `linear-gradient(to top, ${theme.colors.surface} 0%, transparent 100%)`,
    padding: '10px',
    opacity: 0,
    transition: 'opacity 0.2s',
  },
  spotifyIdName: {
    color: theme.colors.text,
    fontSize: '0.9rem',
    fontFamily: theme.fonts.primary,
    fontWeight: 'bold',
    textAlign: 'center',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  spotifyIdLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    pointerEvents: 'none',
  },
  spotifyIdSpinner: {
    width: '50px',
    height: '50px',
    border: `5px solid ${theme.colors.border}`,
    borderTop: `5px solid ${theme.colors.primary}`,
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    boxShadow: theme.name === 'Matrix'
      ? `0 0 20px ${theme.colors.primary}`
      : `0 0 15px rgba(212, 175, 55, 0.6)`,
  },
  iconVolumeWaves: {
    position: 'absolute',
    right: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    width: 0,
    height: 0,
    borderTop: `3px solid transparent`,
    borderBottom: `3px solid transparent`,
    borderLeft: `6px solid ${theme.colors.textSecondary}`,
  },
  volumeSlider: {
    flex: 1,
    height: isMobile ? '8px' : '6px',
    borderRadius: '3px',
    background: theme.colors.progressTrack,
    outline: 'none',
    cursor: 'pointer',
    border: `1px solid ${theme.colors.border}`,
    touchAction: 'pan-y',
    WebkitTapHighlightColor: 'transparent',
  },
  volumeLabel: {
    fontSize: '0.9em',
    color: theme.colors.textSecondary,
    minWidth: '45px',
    textAlign: 'center',
    fontFamily: theme.fonts.primary,
    fontVariantNumeric: 'tabular-nums',
  },
  placeholder: {
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.primary,
  }
});