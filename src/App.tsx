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

const LIBRESPOT_API_URL = "http://localhost:3678";
const LIBRESPOT_WS_URL = "ws://localhost:3678/events";

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

// Logging utilities
const logREST = (method: string, endpoint: string, data?: any, response?: any, error?: any) => {
  const timestamp = new Date().toISOString();
  if (error) {
    console.error(`[REST API] [${timestamp}] ${method} ${endpoint} - ERROR:`, error);
  } else {
    console.log(`[REST API] [${timestamp}] ${method} ${endpoint}`, data ? `Request: ${JSON.stringify(data)}` : '', response ? `Response: ${JSON.stringify(response)}` : '');
  }
};

const logWebSocket = (event: string, data?: any, error?: any) => {
  const timestamp = new Date().toISOString();
  if (error) {
    console.error(`[WebSocket] [${timestamp}] ${event} - ERROR:`, error);
  } else {
    console.log(`[WebSocket] [${timestamp}] ${event}`, data ? JSON.stringify(data, null, 2) : '');
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
  const [themeName, setThemeName] = useState<string>('steampunk');
  const [isKioskMode, setIsKioskMode] = useState<boolean>(false);
  const [hotkeys, setHotkeys] = useState<HotkeyConfig | null>(null);
  const [spotifyIds, setSpotifyIds] = useState<SpotifyIdWithArtwork[]>([]);
  
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
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const gamepadPollIntervalRef = useRef<number | null>(null);
  const lastGamepadStateRef = useRef<boolean[]>([]);
  const configVersionRef = useRef<string | null>(null);
  const configPollIntervalRef = useRef<number | null>(null);

  const apiCall = async (endpoint: string, method: string = 'GET', body?: any, useLocalApi: boolean = false) => {
    const baseUrl = useLocalApi ? '' : LIBRESPOT_API_URL;
    const url = `${baseUrl}${endpoint}`;
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
  };

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
  }, []);

  const connectWebSocket = () => {
    logWebSocket('Attempting to connect', { url: LIBRESPOT_WS_URL });
    try {
      const ws = new WebSocket(LIBRESPOT_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        logWebSocket('Connection opened', { readyState: ws.readyState });
        setIsConnected(true);
        setStatusMessage("Connected to go-librespot");
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
        // Fetch current playback status when WebSocket connects
        fetchPlaybackStatus();
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          logWebSocket('Message received', message);
          // Handle nested structure: { type: "...", data: {...} }
          if (message.type && message.data) {
            handleWebSocketEvent({ ...message.data, type: message.type });
          } else {
            // Fallback for flat structure
            handleWebSocketEvent(message);
          }
        } catch (error) {
          logWebSocket('Error parsing message', { raw: event.data }, error);
        }
      };

      ws.onerror = (error) => {
        logWebSocket('Connection error', null, error);
        setStatusMessage("Connection error");
      };

      ws.onclose = (event) => {
        logWebSocket('Connection closed', { 
          code: event.code, 
          reason: event.reason, 
          wasClean: event.wasClean 
        });
        setIsConnected(false);
        setStatusMessage("Reconnecting...");
        // Reconnect after 2 seconds
        reconnectTimeoutRef.current = window.setTimeout(() => {
          logWebSocket('Attempting to reconnect');
          connectWebSocket();
        }, 2000);
      };
    } catch (error) {
      logWebSocket('Failed to create WebSocket connection', null, error);
      setStatusMessage("Failed to connect");
      // Retry connection
      reconnectTimeoutRef.current = window.setTimeout(() => {
        logWebSocket('Retrying WebSocket connection');
        connectWebSocket();
      }, 2000);
    }
  };

  const handleWebSocketEvent = (data: any) => {
    logWebSocket(`Event: ${data.type}`, data);
    switch (data.type) {
      case 'active':
        setPlayerState(prev => ({ ...prev, isActive: true }));
        setStatusMessage("Player active");
        break;
      case 'inactive':
        setPlayerState(prev => ({ ...prev, isActive: false }));
        setStatusMessage("Player inactive");
        break;
      case 'will_play':
        // Track is about to play - prepare UI for upcoming track
        // Metadata will follow, so we can optionally show a loading state here
        break;
      case 'metadata':
        setPlayerState(prev => ({
          ...prev,
          currentTrack: {
            context_uri: data.context_uri,
            uri: data.uri,
            name: data.name,
            artist_names: data.artist_names,
            album_name: data.album_name,
            album_cover_url: data.album_cover_url,
            position: data.position,
            duration: data.duration,
          },
          position: data.position || 0,
          duration: data.duration || 0,
        }));
        break;
      case 'playing':
        setPlayerState(prev => ({ ...prev, isPaused: false, isActive: true }));
        break;
      case 'paused':
        setPlayerState(prev => ({ ...prev, isPaused: true }));
        break;
      case 'not_playing':
        setPlayerState(prev => ({ ...prev, isPaused: true, isActive: false }));
        break;
      case 'stopped':
        setPlayerState(prev => ({ ...prev, isActive: false, currentTrack: null }));
        break;
      case 'seek':
        setPlayerState(prev => ({
          ...prev,
          position: data.position || 0,
          duration: data.duration || 0,
        }));
        break;
      case 'volume':
        setPlayerState(prev => ({
          ...prev,
          volume: data.value || 0,
          volumeMax: data.max || prev.volumeMax,
        }));
        break;
      case 'repeat_context':
        setPlayerState(prev => ({
          ...prev,
          repeatContext: data.value === true,
        }));
        break;
      case 'repeat_track':
        setPlayerState(prev => ({
          ...prev,
          repeatTrack: data.value === true,
        }));
        break;
      case 'shuffle_context':
        setPlayerState(prev => ({
          ...prev,
          shuffleContext: data.value === true,
        }));
        break;
      default:
        logWebSocket(`Unknown event type: ${data.type}`, data);
    }
  };

  const fetchKioskMode = useCallback(async () => {
    try {
      const response = await apiCall('/api/kiosk', 'GET', undefined, true);
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
  }, []);

  const fetchTheme = useCallback(async () => {
    try {
      const response = await apiCall('/api/theme', 'GET', undefined, true);
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
  }, []);

  const fetchHotkeys = useCallback(async () => {
    try {
      const response = await apiCall('/api/hotkeys', 'GET', undefined, true);
      if (response) {
        setHotkeys(response);
      }
    } catch (error) {
      console.error('Failed to fetch hotkeys:', error);
    }
  }, []);

  const fetchSpotifyIds = useCallback(async () => {
    try {
      const response = await apiCall('/api/spotify/ids', 'GET', undefined, true);
      if (response && response.ids) {
        setSpotifyIds(response.ids.map((item: any) => ({
          id: item.id,
          name: item.name || 'Unknown',
          type: item.type || 'unknown',
          imageUrl: item.imageUrl || '',
        })));
      }
    } catch (error) {
      console.error('Failed to fetch Spotify IDs:', error);
    }
  }, []);

  const checkConfigVersion = useCallback(async () => {
    try {
      const response = await apiCall('/api/config/version', 'GET', undefined, true);
      if (response && response.version) {
        const currentVersion = response.version;
        
        // If we have a previous version and it changed, reload config
        if (configVersionRef.current !== null && configVersionRef.current !== currentVersion) {
          console.log('Configuration changed, reloading...');
          // Reload all configuration
          await fetchTheme();
          await fetchHotkeys();
          await fetchSpotifyIds();
        }
        
        configVersionRef.current = currentVersion;
      }
    } catch (error) {
      console.error('Failed to check config version:', error);
    }
  }, [fetchTheme, fetchHotkeys, fetchSpotifyIds]);

  const fetchTracksFromSpotifyId = useCallback(async (spotifyId: string): Promise<string[]> => {
    try {
      // Get Spotify token from server
      const tokenResponse = await apiCall('/api/spotify/token', 'GET', undefined, true);
      if (!tokenResponse || !tokenResponse.token) {
        throw new Error('Failed to get Spotify token');
      }
      const token = tokenResponse.token;

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
        // Fetch album tracks
        let offset = 0;
        const limit = 50;
        while (true) {
          const response = await fetch(`https://api.spotify.com/v1/albums/${spotifyIdValue}/tracks?limit=${limit}&offset=${offset}`, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });
          
          if (!response.ok) {
            throw new Error(`Spotify API error: ${response.status}`);
          }
          
          const data = await response.json();
          tracks.push(...data.items.map((item: any) => item.uri));
          
          if (!data.next) {
            break;
          }
          offset += limit;
        }
      } else if (type === 'playlist') {
        // Fetch playlist tracks
        let offset = 0;
        const limit = 50;
        while (true) {
          const response = await fetch(`https://api.spotify.com/v1/playlists/${spotifyIdValue}/tracks?limit=${limit}&offset=${offset}`, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });
          
          if (!response.ok) {
            throw new Error(`Spotify API error: ${response.status}`);
          }
          
          const data = await response.json();
          tracks.push(...data.items
            .filter((item: any) => item.track && item.track.uri)
            .map((item: any) => item.track.uri));
          
          if (!data.next) {
            break;
          }
          offset += limit;
        }
      } else if (type === 'artist') {
        // Fetch artist's top tracks
        const response = await fetch(`https://api.spotify.com/v1/artists/${spotifyIdValue}/top-tracks?market=US`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        
        if (!response.ok) {
          throw new Error(`Spotify API error: ${response.status}`);
        }
        
        const data = await response.json();
        tracks = data.tracks.map((track: any) => track.uri);
      } else {
        throw new Error(`Unsupported type: ${type}`);
      }

      return tracks;
    } catch (error) {
      console.error('Failed to fetch tracks from Spotify ID:', error);
      throw error;
    }
  }, []);

  const addToQueue = useCallback(async (spotifyId: string) => {
    try {
      const item = spotifyIds.find((s: SpotifyIdWithArtwork) => s.id === spotifyId);
      const itemName = item?.name || spotifyId;
      
      // Fetch all tracks (handles single tracks, albums, playlists, artists)
      const tracks = await fetchTracksFromSpotifyId(spotifyId);
      
      if (tracks.length === 0) {
        setStatusMessage(`No tracks found for ${itemName}`);
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
    }
  }, [spotifyIds, fetchTracksFromSpotifyId]);

  const updateTheme = useCallback(async (newThemeName: string) => {
    // Update theme immediately for responsive UI
    if (themes[newThemeName]) {
      setTheme(themes[newThemeName]);
      setThemeName(newThemeName);
    }
    
    // Persist to server in the background
    try {
      const response = await apiCall('/api/theme', 'POST', { theme: newThemeName }, true);
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
    // Fetch hotkeys on page load
    fetchHotkeys();
    // Fetch Spotify IDs on page load
    fetchSpotifyIds();
    // Fetch initial playback status on page load
    fetchPlaybackStatus();
    // Connect WebSocket for real-time updates
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (gamepadPollIntervalRef.current) {
        clearInterval(gamepadPollIntervalRef.current);
      }
      if (configPollIntervalRef.current) {
        clearInterval(configPollIntervalRef.current);
      }
    };
  }, [fetchPlaybackStatus, fetchTheme, fetchKioskMode, fetchHotkeys, fetchSpotifyIds, checkConfigVersion]);

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
      document.body.style.mozUserSelect = 'none';
      document.body.style.msUserSelect = 'none';
      
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
        document.body.style.mozUserSelect = '';
        document.body.style.msUserSelect = '';
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

  const styles = useMemo(() => createStyles(theme), [theme]);

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
            <h1 style={{...styles.title, fontSize: '3rem', marginBottom: '10px'}}>Jukebox</h1>
            <p style={styles.status}>{statusMessage}</p>
          </>
        )}

        {playerState.isActive && playerState.currentTrack ? (
          <>
            {/* Spotify ID Buttons */}
            {spotifyIds.length > 0 && (
              <div style={styles.spotifyIdsContainer}>
                <h3 style={{
                  color: theme.colors.primary,
                  fontFamily: theme.fonts.title,
                  marginBottom: '20px',
                  fontSize: '1.5rem',
                  textAlign: 'center',
                }}>Quick Add to Queue</h3>
                <div style={styles.spotifyIdsGrid}>
                  {spotifyIds.map((item) => (
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
                          src={item.imageUrl}
                          alt={item.name}
                          style={styles.spotifyIdImage}
                          onError={(e) => {
                            // Fallback if image fails to load
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
            <div style={styles.player}>
            {playerState.currentTrack.album_cover_url && (
              <img
                src={playerState.currentTrack.album_cover_url}
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

            {/* Main playback controls */}
            <div style={styles.controls}>
              <button 
                style={{...styles.button, ...(playerState.shuffleContext ? styles.buttonActive : {})}}
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
                style={{...styles.button, ...(playerState.repeatTrack || playerState.repeatContext ? styles.buttonActive : {})}}
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

            {/* Volume control */}
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
          </div>
          </>
        ) : (
          <div style={styles.placeholder}>
            <p>Waiting for playback...</p>
            <p style={{ fontSize: '0.8em', opacity: 0.7 }}>Play music on Spotify to see it here.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Create styles function that uses theme
const createStyles = (theme: Theme): Record<string, React.CSSProperties> => ({
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    fontFamily: theme.fonts.primary,
    background: theme.colors.background,
    color: theme.colors.text,
    position: 'relative',
    overflow: 'hidden',
  },
  loadingContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '30px',
  },
  title: {
    fontSize: '4rem',
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
    maxWidth: '800px',
    width: '100%',
    padding: '20px',
    background: theme.colors.surface,
    borderRadius: theme.effects.borderRadius,
    border: `2px solid ${theme.colors.border}`,
    boxShadow: theme.effects.shadow,
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
    width: '300px',
    height: '300px',
    borderRadius: theme.effects.borderRadius,
    boxShadow: theme.effects.shadow,
    border: `3px solid ${theme.colors.border}`,
  },
  trackInfo: {
    marginBottom: '20px',
  },
  controls: {
    display: 'flex',
    gap: '20px',
    alignItems: 'center',
  },
  button: {
    background: `linear-gradient(135deg, ${theme.colors.surface} 0%, ${theme.colors.border} 100%)`,
    border: `2px solid ${theme.colors.border}`,
    color: theme.colors.text,
    fontSize: '2rem',
    cursor: 'pointer',
    padding: '12px',
    borderRadius: '50%',
    transition: 'all 0.3s ease',
    boxShadow: `0 4px 15px rgba(0, 0, 0, 0.5)`,
    minWidth: '60px',
    minHeight: '60px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
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
    gap: '10px',
    width: '100%',
    maxWidth: '500px',
  },
  progressBar: {
    flex: 1,
    height: '8px',
    borderRadius: '4px',
    background: theme.colors.progressTrack,
    outline: 'none',
    cursor: 'pointer',
    border: `1px solid ${theme.colors.border}`,
  },
  timeLabel: {
    fontSize: '0.9em',
    color: theme.colors.textSecondary,
    minWidth: '45px',
    textAlign: 'center',
    fontFamily: theme.fonts.primary,
    fontVariantNumeric: 'tabular-nums',
  },
  volumeContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    maxWidth: '300px',
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
  spotifyIdsContainer: {
    marginBottom: '40px',
    padding: '20px',
    background: theme.colors.surface,
    borderRadius: theme.effects.borderRadius,
    border: `2px solid ${theme.colors.border}`,
  },
  spotifyIdsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
    gap: '15px',
    maxWidth: '100%',
  },
  spotifyIdButton: {
    position: 'relative',
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
    height: '6px',
    borderRadius: '3px',
    background: theme.colors.progressTrack,
    outline: 'none',
    cursor: 'pointer',
    border: `1px solid ${theme.colors.border}`,
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
