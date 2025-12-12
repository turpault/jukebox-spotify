import React, { useEffect, useState, useCallback } from 'react';

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady: () => void;
    Spotify: any;
  }
}

interface TokenResponse {
  token: string;
  connectDeviceName: string;
  error?: string;
  authUrl?: string;
}

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [player, setPlayer] = useState<any>(null);
  const [isPaused, setPaused] = useState(false);
  const [isActive, setActive] = useState(false);
  const [currentTrack, setTrack] = useState<any>(null);
  const [statusMessage, setStatusMessage] = useState("Authenticating...");
  const [targetDeviceName, setTargetDeviceName] = useState<string>("");
  const [isAuthenticating, setIsAuthenticating] = useState(true);

  const fetchToken = useCallback(async () => {
    try {
      const res = await fetch('/api/token');
      const data: TokenResponse = await res.json();

      if (data.error) {
        setIsAuthenticating(true);
        setStatusMessage("Waiting for authentication...");
        // Poll for token every 2 seconds
        setTimeout(() => {
          fetchToken();
        }, 2000);
        return;
      }

      setIsAuthenticating(false);
      setToken(data.token);
      setTargetDeviceName(data.connectDeviceName);
      setStatusMessage("Connected");
    } catch (err) {
      console.error(err);
      setIsAuthenticating(true);
      setStatusMessage("Waiting for authentication...");
      // Retry after 2 seconds
      setTimeout(() => {
        fetchToken();
      }, 2000);
    }
  }, []);

  useEffect(() => {
    fetchToken();
  }, [fetchToken]);

  useEffect(() => {
    if (!token) return;

    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;

    document.body.appendChild(script);

    window.onSpotifyWebPlaybackSDKReady = () => {
      const player = new window.Spotify.Player({
        name: targetDeviceName || 'Web Playback SDK',
        getOAuthToken: (cb: (token: string) => void) => { cb(token); },
        volume: 0.5
      });

      setPlayer(player);

      player.addListener('ready', ({ device_id }: { device_id: string }) => {
        console.log('Ready with Device ID', device_id);
        setDeviceId(device_id);
        setStatusMessage(`Device Ready: ${targetDeviceName} (${device_id})`);

        // Attempt to transfer playback to this device
        transferPlayback(token, device_id);
      });

      player.addListener('not_ready', ({ device_id }: { device_id: string }) => {
        console.log('Device ID has gone offline', device_id);
        setStatusMessage("Device offline");
      });

      player.addListener('player_state_changed', (state: any) => {
        if (!state) {
          return;
        }
        setTrack(state.track_window.current_track);
        setPaused(state.paused);

        player.getCurrentState().then((state: any) => {
          (!state) ? setActive(false) : setActive(true)
        });
      });

      player.connect();
    };
  }, [token, targetDeviceName]);

  const transferPlayback = async (token: string, deviceId: string) => {
    console.log(`Transferring playback to ${deviceId}...`);
    try {
      await fetch('https://api.spotify.com/v1/me/player', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          device_ids: [deviceId],
          play: true,
        }),
      });
      setStatusMessage("Playback transferred to this device.");
    } catch (e) {
      console.error("Error transferring playback:", e);
      setStatusMessage("Failed to transfer playback.");
    }
  };

  if (!token || isAuthenticating) {
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

        {isActive ? (
          <div style={styles.player}>
            {currentTrack?.album?.images?.[0]?.url && (
              <img
                src={currentTrack.album.images[0].url}
                alt={currentTrack.name}
                style={styles.albumArt}
              />
            )}
            <div style={styles.trackInfo}>
              <h2>{currentTrack?.name}</h2>
              <h3>{currentTrack?.artists?.[0]?.name}</h3>
            </div>
            <div style={styles.controls}>
              <button style={styles.button} onClick={() => player.previousTrack()}>⏮</button>
              <button style={styles.button} onClick={() => player.togglePlay()}>
                {isPaused ? "▶️" : "⏸"}
              </button>
              <button style={styles.button} onClick={() => player.nextTrack()}>⏭</button>
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
