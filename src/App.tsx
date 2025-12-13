import React, { useEffect, useState, useRef } from 'react';

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

const LIBRESPOT_API_URL = "/api";
const LIBRESPOT_WS_URL = "ws://localhost:3678/events";

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

  const connectWebSocket = () => {
    try {
      const ws = new WebSocket(LIBRESPOT_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected to go-librespot');
        setIsConnected(true);
        setStatusMessage("Connected to go-librespot");
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWebSocketEvent(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setStatusMessage("Connection error");
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        setStatusMessage("Reconnecting...");
        // Reconnect after 2 seconds
        reconnectTimeoutRef.current = window.setTimeout(() => {
          connectWebSocket();
        }, 2000);
      };
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      setStatusMessage("Failed to connect");
      // Retry connection
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connectWebSocket();
      }, 2000);
    }
  };

  const handleWebSocketEvent = (data: any) => {
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
    }
  };

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  const apiCall = async (endpoint: string, method: string = 'GET', body?: any) => {
    try {
      const response = await fetch(`${LIBRESPOT_API_URL}${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) {
        throw new Error(`API call failed: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`Error calling ${endpoint}:`, error);
      setStatusMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const togglePlay = async () => {
    if (playerState.isPaused) {
      await apiCall('/player/play', 'POST');
    } else {
      await apiCall('/player/pause', 'POST');
    }
  };

  const nextTrack = async () => {
    await apiCall('/player/next', 'POST');
  };

  const previousTrack = async () => {
    await apiCall('/player/previous', 'POST');
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
