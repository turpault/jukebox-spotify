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

export default function App() {
  const [theme, setTheme] = useState<Theme>(steampunkTheme);
  const [themeName, setThemeName] = useState<string>('steampunk');
  
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

  const updateTheme = useCallback(async (newThemeName: string) => {
    try {
      const response = await apiCall('/api/theme', 'POST', { theme: newThemeName }, true);
      if (response && response.theme) {
        const themeKey = response.theme;
        if (themes[themeKey]) {
          setTheme(themes[themeKey]);
          setThemeName(themeKey);
        }
      }
    } catch (error) {
      console.error('Failed to update theme:', error);
    }
  }, []);

  useEffect(() => {
    // Fetch theme on page load
    fetchTheme();
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
    };
  }, [fetchPlaybackStatus, fetchTheme]);

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
      <div style={styles.content}>
        {!isConnected && (
          <>
            <h1 style={{...styles.title, fontSize: '3rem', marginBottom: '10px'}}>Jukebox</h1>
            <p style={styles.status}>{statusMessage}</p>
          </>
        )}

        {playerState.isActive && playerState.currentTrack ? (
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
                🔀
              </button>
              <button 
                style={styles.button} 
                onClick={previousTrack} 
                title="Previous"
                onMouseEnter={(e) => Object.assign(e.currentTarget.style, styles.buttonHover)}
                onMouseLeave={(e) => Object.assign(e.currentTarget.style, styles.button)}
              >
                ⏮
              </button>
              <button 
                style={styles.button} 
                onClick={togglePlay} 
                title={playerState.isPaused ? "Play" : "Pause"}
                onMouseEnter={(e) => Object.assign(e.currentTarget.style, styles.buttonHover)}
                onMouseLeave={(e) => Object.assign(e.currentTarget.style, styles.button)}
              >
                {playerState.isPaused ? "▶️" : "⏸"}
              </button>
              <button 
                style={styles.button} 
                onClick={nextTrack} 
                title="Next"
                onMouseEnter={(e) => Object.assign(e.currentTarget.style, styles.buttonHover)}
                onMouseLeave={(e) => Object.assign(e.currentTarget.style, styles.button)}
              >
                ⏭
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
                {playerState.repeatTrack ? "🔂" : "🔁"}
              </button>
            </div>

            {/* Volume control */}
            <div style={styles.volumeContainer}>
              <span style={styles.volumeIcon}>🔊</span>
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
  volumeIcon: {
    fontSize: '1.2rem',
    color: theme.colors.textSecondary,
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
