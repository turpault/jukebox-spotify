import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useJukeboxState } from './JukeboxStateProvider';
import { useConfigState } from './ConfigStateProvider';
import { SpotifyIdsList } from './SpotifyIdsList';

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
  // Get state from provider
  const {
    playerState,
    statusMessage,
    isConnected,
    themeName,
    viewName,
    isKioskMode,
    hotkeys,
    isThemeLoaded,
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
  } = useJukeboxState();

  // Get config state
  const { configuredSpotifyIds, recentArtists } = useConfigState();

  // Local UI state
  const [theme, setTheme] = useState<Theme>(steampunkTheme);
  const [isMobile, setIsMobile] = useState(false);
  const gamepadPollIntervalRef = useRef<number | null>(null);
  const lastGamepadStateRef = useRef<boolean[]>([]);

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // UI-specific API call helper (for functions that need to update statusMessage)
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
      return null;
    }
  }, []);


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

  // Update theme when themeName changes
  useEffect(() => {
    if (themes[themeName]) {
      setTheme(themes[themeName]);
    }
  }, [themeName]);

  // Handle kiosk mode fullscreen
  useEffect(() => {
    if (isKioskMode) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {
          // Ignore fullscreen errors (user may have denied permission)
        });
      }
    }
  }, [isKioskMode]);

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

    // Check if gamepad API is available (not available in iOS 9)
    if (typeof navigator.getGamepads !== 'function') {
      return;
    }

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

  // iOS 9 compatible padStart replacement
  const padStart = (str: string, targetLength: number, padString: string): string => {
    const strValue = String(str);
    if (strValue.length >= targetLength) {
      return strValue;
    }
    const pad = padString || ' ';
    const padLength = targetLength - strValue.length;
    let padded = '';
    for (let i = 0; i < padLength; i++) {
      padded += pad;
    }
    return padded + strValue;
  };

  const formatTime = (ms: number): string => {
    if (!ms || isNaN(ms)) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes + ':' + padStart(String(seconds), 2, '0');
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

  // Show loading spinner until all config is loaded
  if (!isConfigLoaded) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#000000',
        zIndex: 10000,
      }}>
        <div style={{
          width: '60px',
          height: '60px',
          border: '4px solid #333333',
          borderTop: '4px solid #ffffff',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }} />
      </div>
    );
  }

  if (!isConnected && isConnectionStatusKnown) {
    return (
      <div style={styles.container}>
        {/* Theme selector */}
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
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
        <div style={{
          ...styles.loadingContent,
          maxWidth: isMobile ? '95%' : '800px',
          padding: isMobile ? '20px' : '40px',
        }}>
          <h1 style={styles.title}>Jukebox</h1>
          <div style={{
            background: theme.colors.surface,
            borderRadius: theme.effects.borderRadius,
            border: `2px solid ${theme.colors.border}`,
            padding: isMobile ? '20px' : '30px',
            boxShadow: theme.effects.shadow,
            width: '100%',
            boxSizing: 'border-box',
          }}>
            <h2 style={{
              color: theme.colors.text,
              fontFamily: theme.fonts.title,
              fontSize: isMobile ? '1.5rem' : '2rem',
              marginTop: 0,
              marginBottom: '20px',
              textAlign: 'center',
            }}>
              No Spotify Connect Instance Connected
            </h2>
            <p style={{
              color: theme.colors.textSecondary,
              fontSize: isMobile ? '0.9rem' : '1.1rem',
              lineHeight: '1.6',
              marginBottom: '30px',
              textAlign: 'center',
            }}>
              To use this jukebox, you need to connect a Spotify Connect device from the Spotify app.
            </p>

            <div style={{
              marginTop: '30px',
            }}>
              <h3 style={{
                color: theme.colors.primary,
                fontFamily: theme.fonts.title,
                fontSize: isMobile ? '1.2rem' : '1.5rem',
                marginBottom: '20px',
                borderBottom: `2px solid ${theme.colors.border}`,
                paddingBottom: '10px',
              }}>
                How to Connect:
              </h3>

              <ol style={{
                color: theme.colors.text,
                fontSize: isMobile ? '0.9rem' : '1rem',
                lineHeight: '2',
                paddingLeft: '20px',
                margin: 0,
              }}>
                <li style={{ marginBottom: '15px' }}>
                  <strong>Open the Spotify app</strong> on your phone, tablet, or computer
                </li>
                <li style={{ marginBottom: '15px' }}>
                  <strong>Start playing any song</strong> or open a playlist/album
                </li>
                <li style={{ marginBottom: '15px' }}>
                  <strong>Tap the "Devices Available" button</strong> (looks like a speaker or computer icon) at the bottom of the Now Playing screen
                </li>
                <li style={{ marginBottom: '15px' }}>
                  <strong>Select "Jukebox"</strong> from the list of available devices
                </li>
                <li style={{ marginBottom: '15px' }}>
                  <strong>Your music will start playing</strong> through the jukebox, and you'll see it appear here!
                </li>
              </ol>
            </div>
          </div>
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
          left: '50%',
          transform: 'translateX(-50%)',
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
        {!isConnected && isConnectionStatusKnown && (
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
                    // Position will be updated when seek completes
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
                      // Volume will be updated when setVolume completes
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
            <SpotifyIdsList
              items={configuredSpotifyIds}
              title="Configured"
              sidebarStyle="left"
              theme={theme}
              styles={styles}
              isMobile={isMobile}
            />

            {/* Recent Artists - Right Side */}
            {viewName !== 'dash' && (
              <SpotifyIdsList
                items={recentArtists}
                title="Recent Artists"
                sidebarStyle="right"
                theme={theme}
                styles={styles}
                isMobile={isMobile}
              />
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