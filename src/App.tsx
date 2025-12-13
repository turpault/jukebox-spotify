import React, { useEffect, useState, useRef, useCallback } from 'react';

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

  const apiCall = async (endpoint: string, method: string = 'GET', body?: any) => {
    const url = `${LIBRESPOT_API_URL}${endpoint}`;
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
          const data = JSON.parse(event.data);
          logWebSocket('Message received', data);
          handleWebSocketEvent(data);
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

  useEffect(() => {
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
  }, [fetchPlaybackStatus]);

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

  if (!isConnected) {
    return (
      <div style={styles.container}>
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
      <div style={styles.content}>
        <h1>Jukebox</h1>
        <p style={styles.status}>{statusMessage}</p>

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
              <h2>{playerState.currentTrack.name || 'Unknown Track'}</h2>
              <h3>{playerState.currentTrack.artist_names?.join(', ') || 'Unknown Artist'}</h3>
              {playerState.currentTrack.album_name && (
                <p style={{ fontSize: '0.9em', opacity: 0.7 }}>{playerState.currentTrack.album_name}</p>
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
              >
                🔀
              </button>
              <button style={styles.button} onClick={previousTrack} title="Previous">⏮</button>
              <button style={styles.button} onClick={togglePlay} title={playerState.isPaused ? "Play" : "Pause"}>
                {playerState.isPaused ? "▶️" : "⏸"}
              </button>
              <button style={styles.button} onClick={nextTrack} title="Next">⏭</button>
              <button 
                style={{...styles.button, ...(playerState.repeatTrack || playerState.repeatContext ? styles.buttonActive : {})}}
                onClick={toggleRepeat}
                title={playerState.repeatTrack ? "Repeat Track" : playerState.repeatContext ? "Repeat Context" : "Repeat Off"}
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

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    fontFamily: 'system-ui, sans-serif',
    background: '#121212',
    color: '#fff',
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
    background: 'linear-gradient(90deg, #1DB954, #1ed760)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  },
  spinnerContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    width: '60px',
    height: '60px',
    border: '4px solid rgba(255, 255, 255, 0.1)',
    borderTop: '4px solid #1DB954',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  statusMessage: {
    color: '#b3b3b3',
    fontSize: '1.2rem',
    margin: 0,
  },
  content: {
    textAlign: 'center',
    maxWidth: '800px',
    width: '100%',
    padding: '20px',
  },
  status: {
    color: '#b3b3b3',
    marginBottom: '20px',
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
    borderRadius: '8px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
  },
  trackInfo: {
    marginBottom: '20px',
  },
  controls: {
    display: 'flex',
    gap: '20px',
  },
  button: {
    background: 'none',
    border: 'none',
    color: '#fff',
    fontSize: '2rem',
    cursor: 'pointer',
    padding: '10px',
    borderRadius: '50%',
    transition: 'background-color 0.2s',
  },
  buttonActive: {
    backgroundColor: 'rgba(29, 185, 84, 0.3)',
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
    height: '6px',
    borderRadius: '3px',
    background: '#333',
    outline: 'none',
    cursor: 'pointer',
  },
  timeLabel: {
    fontSize: '0.9em',
    color: '#b3b3b3',
    minWidth: '45px',
    textAlign: 'center',
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
  },
  volumeSlider: {
    flex: 1,
    height: '4px',
    borderRadius: '2px',
    background: '#333',
    outline: 'none',
    cursor: 'pointer',
  },
  volumeLabel: {
    fontSize: '0.9em',
    color: '#b3b3b3',
    minWidth: '45px',
    textAlign: 'center',
  },
  placeholder: {
    color: '#b3b3b3',
  }
};
