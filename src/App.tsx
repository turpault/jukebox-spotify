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
            <div style={styles.controls}>
              <button style={styles.button} onClick={previousTrack}>⏮</button>
              <button style={styles.button} onClick={togglePlay}>
                {playerState.isPaused ? "▶️" : "⏸"}
              </button>
              <button style={styles.button} onClick={nextTrack}>⏭</button>
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
  },
  placeholder: {
    color: '#b3b3b3',
  }
};
