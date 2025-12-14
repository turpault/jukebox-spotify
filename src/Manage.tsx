import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
    primary: '#D4AF37',
    secondary: '#B8860B',
    accent: '#CD853F',
    background: 'linear-gradient(135deg, #2C1810 0%, #1A0F08 50%, #0D0603 100%)',
    surface: 'rgba(61, 40, 23, 0.8)',
    text: '#F4E4BC',
    textSecondary: '#D4AF37',
    border: '#8B6914',
    active: '#D4AF37',
    progress: '#D4AF37',
    progressTrack: '#3D2817',
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
    primary: '#00FF41',
    secondary: '#00CC33',
    accent: '#00FF88',
    background: '#000000',
    surface: 'rgba(0, 0, 0, 0.9)',
    text: '#00FF41',
    textSecondary: '#00CC33',
    border: '#003311',
    active: '#00FF41',
    progress: '#00FF41',
    progressTrack: '#001100',
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

const themes: Record<string, Theme> = {
  steampunk: steampunkTheme,
  matrix: matrixTheme,
};

const API_BASE = '';

interface SpotifyId {
  id: string;
  name: string;
  type: string;
}

export default function Manage() {
  const [hotkeys, setHotkeys] = useState<HotkeyConfig | null>(null);
  const [themeName, setThemeName] = useState<string>('steampunk');
  const [theme, setTheme] = useState<Theme>(steampunkTheme);
  const [viewName, setViewName] = useState<string>('default');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [capturingKey, setCapturingKey] = useState<string | null>(null);
  const [capturingButton, setCapturingButton] = useState<string | null>(null);
  const [spotifyIds, setSpotifyIds] = useState<SpotifyId[]>([]);
  const [recentArtists, setRecentArtists] = useState<SpotifyId[]>([]);
  const [recentArtistsLimit, setRecentArtistsLimit] = useState<number>(20);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const [apiStats, setApiStats] = useState<any>(null);
  const isInitialLoad = useRef(true);

  const fetchHotkeys = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/hotkeys`);
      const data = await response.json();
      if (data && !data.error) {
        setHotkeys(data);
      }
    } catch (error) {
      console.error('Failed to fetch hotkeys:', error);
    }
  }, []);

  const fetchTheme = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/theme`);
      const data = await response.json();
      if (data && data.theme) {
        const themeKey = data.theme;
        setThemeName(themeKey);
        if (themes[themeKey]) {
          setTheme(themes[themeKey]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch theme:', error);
    }
  }, []);

  const fetchView = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/view`);
      const data = await response.json();
      if (data && data.view) {
        setViewName(data.view);
      }
    } catch (error) {
      console.error('Failed to fetch view:', error);
    }
  }, []);

  const fetchSpotifyIds = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/spotify/ids`);
      const data = await response.json();
      if (data && data.ids) {
        setSpotifyIds(data.ids);
      }
    } catch (error) {
      console.error('Failed to fetch Spotify IDs:', error);
    }
  }, []);

  const fetchRecentArtists = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/spotify/recent-artists`);
      const data = await response.json();
      if (data && data.ids) {
        setRecentArtists(data.ids);
      }
    } catch (error) {
      console.error('Failed to fetch recent artists:', error);
    }
  }, []);

  const clearRecentArtists = async () => {
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/api/spotify/recent-artists`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (data.success) {
        setMessage('Recent artists cleared successfully!');
        await fetchRecentArtists();
      } else {
        setMessage('Failed to clear recent artists');
      }
    } catch (error) {
      setMessage('Error clearing recent artists');
      console.error(error);
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const fetchRecentArtistsLimit = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/spotify/recent-artists-limit`);
      const data = await response.json();
      if (data && data.limit) {
        setRecentArtistsLimit(data.limit);
      }
    } catch (error) {
      console.error('Failed to fetch recent artists limit:', error);
    }
  }, []);

  const fetchApiStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/stats`);
      const data = await response.json();
      if (data && !data.error) {
        setApiStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch API stats:', error);
    }
  }, []);

  const saveRecentArtistsLimit = async (limit: number) => {
    try {
      const response = await fetch(`${API_BASE}/api/spotify/recent-artists-limit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit }),
      });
      const data = await response.json();
      if (!data.success) {
        console.error('Failed to save recent artists limit');
      }
    } catch (error) {
      console.error('Error saving recent artists limit:', error);
    }
  };

  useEffect(() => {
    fetchHotkeys();
    fetchTheme();
    fetchView();
    fetchSpotifyIds();
    fetchRecentArtists();
    fetchRecentArtistsLimit();
    fetchApiStats();
    // Mark initial load as complete after a short delay
    setTimeout(() => {
      isInitialLoad.current = false;
    }, 1000);
  }, [fetchHotkeys, fetchTheme, fetchView, fetchSpotifyIds, fetchRecentArtists, fetchRecentArtistsLimit, fetchApiStats]);

  // Poll API stats every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchApiStats();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchApiStats]);

  const saveHotkeys = async (hotkeysToSave: HotkeyConfig) => {
    try {
      const response = await fetch(`${API_BASE}/api/hotkeys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(hotkeysToSave),
      });
      const data = await response.json();
      if (!data.success) {
        console.error('Failed to save hotkeys');
      }
    } catch (error) {
      console.error('Error saving hotkeys:', error);
    }
  };

  const saveTheme = async (themeToSave: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/theme`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: themeToSave }),
      });
      const data = await response.json();
      if (data.theme) {
        // Update local theme immediately
        if (themes[data.theme]) {
          setTheme(themes[data.theme]);
        }
      } else {
        console.error('Failed to save theme');
      }
    } catch (error) {
      console.error('Error saving theme:', error);
    }
  };

  const saveView = async (viewToSave: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/view`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ view: viewToSave }),
      });
      const data = await response.json();
      if (!data.view) {
        console.error('Failed to save view');
      }
    } catch (error) {
      console.error('Error saving view:', error);
    }
  };

  // Update theme when themeName changes and auto-save
  useEffect(() => {
    if (themes[themeName]) {
      setTheme(themes[themeName]);
      // Auto-save theme when it changes (but not on initial load)
      if (!isInitialLoad.current) {
        saveTheme(themeName);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeName]);

  // Auto-save view when it changes
  useEffect(() => {
    if (!isInitialLoad.current) {
      saveView(viewName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewName]);

  // Auto-save hotkeys when they change
  useEffect(() => {
    if (hotkeys && !isInitialLoad.current) {
      saveHotkeys(hotkeys);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotkeys]);

  // Update document body background when theme changes
  useEffect(() => {
    const bgColor = theme.colors.background.includes('gradient') 
      ? '#000000'
      : theme.colors.background;
    
    document.body.style.background = bgColor;
    document.body.style.color = theme.colors.text;
    
    return () => {
      document.body.style.background = '';
      document.body.style.color = '';
    };
  }, [theme]);

  const handleKeyCapture = (key: string) => {
    setCapturingKey(key);
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      const keyCode = e.code || e.key;
      if (hotkeys) {
        setHotkeys({
          ...hotkeys,
          keyboard: {
            ...hotkeys.keyboard,
            [key]: keyCode,
          },
        });
      }
      setCapturingKey(null);
      window.removeEventListener('keydown', handler);
    };
    window.addEventListener('keydown', handler);
  };


  const searchSpotify = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const response = await fetch(`${API_BASE}/api/spotify/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await response.json();
      if (data && !data.error) {
        setSearchResults(data);
      } else {
        setMessage('Search failed: ' + (data.error || 'Unknown error'));
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (error) {
      setMessage('Error searching Spotify');
      console.error(error);
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setSearching(false);
    }
  };

  const addSpotifyId = async (id: string) => {
    const currentIds = spotifyIds.map(s => s.id);
    if (currentIds.includes(id)) {
      setMessage('ID already in list');
      setTimeout(() => setMessage(''), 2000);
      return;
    }

    const newIds = [...currentIds, id];
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/spotify/ids`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: newIds }),
      });
      const data = await response.json();
      if (data.success) {
        await fetchSpotifyIds();
        setMessage('Spotify ID added');
        setTimeout(() => setMessage(''), 2000);
      } else {
        setMessage('Failed to add Spotify ID');
        setTimeout(() => setMessage(''), 2000);
      }
    } catch (error) {
      setMessage('Error adding Spotify ID');
      console.error(error);
      setTimeout(() => setMessage(''), 2000);
    } finally {
      setSaving(false);
    }
  };

  const removeSpotifyId = async (id: string) => {
    const newIds = spotifyIds.filter(s => s.id !== id).map(s => s.id);
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/spotify/ids`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: newIds }),
      });
      const data = await response.json();
      if (data.success) {
        await fetchSpotifyIds();
        setMessage('Spotify ID removed');
        setTimeout(() => setMessage(''), 2000);
      } else {
        setMessage('Failed to remove Spotify ID');
        setTimeout(() => setMessage(''), 2000);
      }
    } catch (error) {
      setMessage('Error removing Spotify ID');
      console.error(error);
      setTimeout(() => setMessage(''), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleButtonCapture = (action: string) => {
    setCapturingButton(action);
    const pollGamepads = () => {
      const gamepads = navigator.getGamepads();
      if (!gamepads || gamepads.length === 0) {
        setTimeout(pollGamepads, 100);
        return;
      }

      const gamepad = gamepads[0];
      if (!gamepad) {
        setTimeout(pollGamepads, 100);
        return;
      }

      for (let i = 0; i < gamepad.buttons.length; i++) {
        if (gamepad.buttons[i].pressed) {
          if (hotkeys) {
            setHotkeys({
              ...hotkeys,
              gamepad: {
                ...hotkeys.gamepad,
                [action]: i,
              },
            });
          }
          setCapturingButton(null);
          return;
        }
      }
      setTimeout(pollGamepads, 100);
    };
    pollGamepads();
  };

  const keyboardActions = [
    { key: 'playPause', label: 'Play/Pause' },
    { key: 'next', label: 'Next Track' },
    { key: 'previous', label: 'Previous Track' },
    { key: 'volumeUp', label: 'Volume Up' },
    { key: 'volumeDown', label: 'Volume Down' },
    { key: 'seekForward', label: 'Seek Forward' },
    { key: 'seekBackward', label: 'Seek Backward' },
    { key: 'shuffle', label: 'Shuffle' },
    { key: 'repeat', label: 'Repeat' },
  ];

  const gamepadActions = [
    { key: 'playPause', label: 'Play/Pause' },
    { key: 'next', label: 'Next Track' },
    { key: 'previous', label: 'Previous Track' },
    { key: 'volumeUp', label: 'Volume Up' },
    { key: 'volumeDown', label: 'Volume Down' },
    { key: 'shuffle', label: 'Shuffle' },
    { key: 'repeat', label: 'Repeat' },
  ];

  const styles = useMemo(() => ({
    container: {
      minHeight: '100vh',
      background: theme.colors.background,
      color: theme.colors.text,
      padding: '40px',
      fontFamily: theme.fonts.primary,
    } as React.CSSProperties,
    content: {
      maxWidth: '1200px',
      margin: '0 auto',
    } as React.CSSProperties,
    title: {
      fontSize: '3rem',
      marginBottom: '40px',
      textAlign: 'center' as const,
      color: theme.colors.primary,
      textShadow: theme.name === 'Matrix' 
        ? `0 0 20px ${theme.colors.primary}, 0 0 40px ${theme.colors.primary}`
        : `0 0 30px rgba(212, 175, 55, 0.5)`,
      fontFamily: theme.fonts.title,
    } as React.CSSProperties,
    message: {
      padding: '15px',
      marginBottom: '30px',
      background: message.includes('success') ? 'rgba(0, 200, 0, 0.3)' : 'rgba(200, 0, 0, 0.3)',
      border: `2px solid ${message.includes('success') ? '#00FF00' : '#FF0000'}`,
      borderRadius: theme.effects.borderRadius,
      textAlign: 'center' as const,
    } as React.CSSProperties,
    card: {
      background: theme.colors.surface,
      padding: '30px',
      borderRadius: theme.effects.borderRadius,
      border: `2px solid ${theme.colors.border}`,
      boxShadow: theme.effects.shadow,
    } as React.CSSProperties,
    cardTitle: {
      color: theme.colors.primary,
      marginTop: 0,
      marginBottom: '20px',
      fontFamily: theme.fonts.title,
    } as React.CSSProperties,
    label: {
      display: 'block',
      marginBottom: '10px',
      color: theme.colors.text,
      fontFamily: theme.fonts.primary,
    } as React.CSSProperties,
    select: {
      width: '100%',
      padding: '10px',
      background: theme.colors.surface,
      color: theme.colors.text,
      border: `2px solid ${theme.colors.border}`,
      borderRadius: theme.effects.borderRadius,
      fontSize: '1rem',
      fontFamily: theme.fonts.primary,
    } as React.CSSProperties,
    input: {
      width: '100%',
      padding: '8px',
      background: theme.colors.surface,
      color: theme.colors.text,
      border: `2px solid ${theme.colors.border}`,
      borderRadius: theme.effects.borderRadius,
      fontSize: '1rem',
      fontFamily: theme.fonts.primary,
    } as React.CSSProperties,
    button: {
      padding: '12px',
      background: `linear-gradient(135deg, ${theme.colors.primary} 0%, ${theme.colors.secondary} 100%)`,
      border: `2px solid ${theme.colors.border}`,
      borderRadius: theme.effects.borderRadius,
      color: theme.name === 'Matrix' ? '#000000' : '#2C1810',
      fontSize: '1rem',
      fontWeight: 'bold' as const,
      cursor: 'pointer',
      boxShadow: theme.effects.shadow,
    } as React.CSSProperties,
    buttonDisabled: {
      opacity: 0.6,
      cursor: 'not-allowed' as const,
    } as React.CSSProperties,
    buttonSmall: {
      padding: '8px 15px',
      background: theme.colors.surface,
      border: `2px solid ${theme.colors.border}`,
      borderRadius: theme.effects.borderRadius,
      color: theme.colors.primary,
      cursor: 'pointer',
      minWidth: '120px',
    } as React.CSSProperties,
    buttonSmallActive: {
      background: `linear-gradient(135deg, ${theme.colors.primary} 0%, ${theme.colors.secondary} 100%)`,
      color: theme.name === 'Matrix' ? '#000000' : '#2C1810',
      fontWeight: 'bold' as const,
    } as React.CSSProperties,
    actionRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '10px',
      background: theme.name === 'Matrix' 
        ? 'rgba(0, 0, 0, 0.5)' 
        : 'rgba(61, 40, 23, 0.5)',
      borderRadius: theme.effects.borderRadius,
      border: `1px solid ${theme.colors.border}`,
    } as React.CSSProperties,
    actionLabel: {
      color: theme.colors.text,
      fontFamily: theme.fonts.primary,
    } as React.CSSProperties,
    link: {
      color: theme.colors.primary,
      textDecoration: 'none' as const,
      fontSize: '1.1rem',
      borderBottom: `1px solid ${theme.colors.primary}`,
      fontFamily: theme.fonts.primary,
    } as React.CSSProperties,
    helpText: {
      color: theme.colors.textSecondary,
      marginBottom: '20px',
      fontSize: '0.9rem',
      fontFamily: theme.fonts.primary,
    } as React.CSSProperties,
  }), [theme, message]);

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        <h1 style={styles.title}>
          Jukebox Management
        </h1>

        {message && (
          <div style={styles.message}>
            {message}
          </div>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '40px',
          marginBottom: '40px',
        }}>
          {/* Theme & View Configuration */}
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Theme & View</h2>
            <div style={{ marginBottom: '20px' }}>
              <label style={styles.label}>
                Select Theme:
              </label>
              <select
                value={themeName}
                onChange={(e) => setThemeName(e.target.value)}
                style={styles.select}
              >
                <option value="steampunk">Steampunk 1930s</option>
                <option value="matrix">Matrix</option>
              </select>
            </div>
            <div>
              <label style={styles.label}>
                Select View:
              </label>
              <select
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
                style={styles.select}
              >
                <option value="default">Default (Controls & Queue)</option>
                <option value="dash">Dash (Track Only)</option>
              </select>
            </div>
          </div>

          {/* Settings */}
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Settings</h2>
            {hotkeys && (
              <>
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ ...styles.label, marginBottom: '5px' }}>
                    Volume Step:
                  </label>
                  <input
                    type="number"
                    value={hotkeys.volumeStep || 5}
                    onChange={(e) => setHotkeys({
                      ...hotkeys,
                      volumeStep: parseInt(e.target.value) || 5,
                    })}
                    style={styles.input}
                  />
                </div>
                <div>
                  <label style={{ ...styles.label, marginBottom: '5px' }}>
                    Seek Step (ms):
                  </label>
                  <input
                    type="number"
                    value={hotkeys.seekStep || 10000}
                    onChange={(e) => setHotkeys({
                      ...hotkeys,
                      seekStep: parseInt(e.target.value) || 10000,
                    })}
                    style={styles.input}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Keyboard Hotkeys */}
        <div style={{ ...styles.card, marginBottom: '40px' }}>
          <h2 style={styles.cardTitle}>Keyboard Hotkeys</h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '15px',
          }}>
            {keyboardActions.map((action) => (
              <div key={action.key} style={styles.actionRow}>
                <span style={styles.actionLabel}>{action.label}:</span>
                <button
                  onClick={() => handleKeyCapture(action.key)}
                  style={{
                    ...styles.buttonSmall,
                    ...(capturingKey === action.key ? styles.buttonSmallActive : {}),
                  }}
                >
                  {capturingKey === action.key
                    ? 'Press key...'
                    : hotkeys?.keyboard[action.key as keyof typeof hotkeys.keyboard] || 'Not set'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Gamepad Hotkeys */}
        <div style={{ ...styles.card, marginBottom: '40px' }}>
          <h2 style={styles.cardTitle}>Gamepad Hotkeys</h2>
          <p style={styles.helpText}>
            Connect a USB gamepad and click a button to capture the gamepad button number.
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '15px',
          }}>
            {gamepadActions.map((action) => (
              <div key={action.key} style={styles.actionRow}>
                <span style={styles.actionLabel}>{action.label}:</span>
                <button
                  onClick={() => handleButtonCapture(action.key)}
                  style={{
                    ...styles.buttonSmall,
                    ...(capturingButton === action.key ? styles.buttonSmallActive : {}),
                  }}
                >
                  {capturingButton === action.key
                    ? 'Press button...'
                    : hotkeys?.gamepad[action.key as keyof typeof hotkeys.gamepad] !== undefined
                    ? `Button ${hotkeys.gamepad[action.key as keyof typeof hotkeys.gamepad]}`
                    : 'Not set'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* API Statistics */}
        <div style={{ ...styles.card, marginBottom: '40px' }}>
          <h2 style={styles.cardTitle}>API Statistics</h2>
          {apiStats ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Overview Stats */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '15px',
              }}>
                <div style={{
                  padding: '15px',
                  background: theme.colors.surface,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.effects.borderRadius,
                }}>
                  <div style={{ color: theme.colors.textSecondary, fontSize: '0.9rem', fontFamily: theme.fonts.primary, marginBottom: '5px' }}>
                    Total Calls
                  </div>
                  <div style={{ color: theme.colors.primary, fontSize: '1.5rem', fontWeight: 'bold', fontFamily: theme.fonts.primary }}>
                    {apiStats.totalCalls.toLocaleString()}
                  </div>
                </div>
                <div style={{
                  padding: '15px',
                  background: theme.colors.surface,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.effects.borderRadius,
                }}>
                  <div style={{ color: theme.colors.textSecondary, fontSize: '0.9rem', fontFamily: theme.fonts.primary, marginBottom: '5px' }}>
                    Total Errors
                  </div>
                  <div style={{ color: apiStats.totalErrors > 0 ? '#FF4444' : theme.colors.primary, fontSize: '1.5rem', fontWeight: 'bold', fontFamily: theme.fonts.primary }}>
                    {apiStats.totalErrors.toLocaleString()}
                  </div>
                </div>
                <div style={{
                  padding: '15px',
                  background: theme.colors.surface,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.effects.borderRadius,
                }}>
                  <div style={{ color: theme.colors.textSecondary, fontSize: '0.9rem', fontFamily: theme.fonts.primary, marginBottom: '5px' }}>
                    Avg Duration
                  </div>
                  <div style={{ color: theme.colors.primary, fontSize: '1.5rem', fontWeight: 'bold', fontFamily: theme.fonts.primary }}>
                    {apiStats.averageDuration}ms
                  </div>
                </div>
                <div style={{
                  padding: '15px',
                  background: theme.colors.surface,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.effects.borderRadius,
                }}>
                  <div style={{ color: theme.colors.textSecondary, fontSize: '0.9rem', fontFamily: theme.fonts.primary, marginBottom: '5px' }}>
                    Last 24h
                  </div>
                  <div style={{ color: theme.colors.primary, fontSize: '1.5rem', fontWeight: 'bold', fontFamily: theme.fonts.primary }}>
                    {apiStats.callsLast24h.toLocaleString()}
                  </div>
                </div>
                <div style={{
                  padding: '15px',
                  background: theme.colors.surface,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.effects.borderRadius,
                }}>
                  <div style={{ color: theme.colors.textSecondary, fontSize: '0.9rem', fontFamily: theme.fonts.primary, marginBottom: '5px' }}>
                    Last Hour
                  </div>
                  <div style={{ color: theme.colors.primary, fontSize: '1.5rem', fontWeight: 'bold', fontFamily: theme.fonts.primary }}>
                    {apiStats.callsLastHour.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Calls by Method */}
              {Object.keys(apiStats.callsByMethod).length > 0 && (
                <div>
                  <h3 style={{ ...styles.cardTitle, fontSize: '1.2rem', marginBottom: '10px' }}>Calls by Method</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {Object.entries(apiStats.callsByMethod)
                      .sort(([, a], [, b]) => (b as number) - (a as number))
                      .map(([method, count]) => (
                        <div key={method} style={styles.actionRow}>
                          <span style={styles.actionLabel}>{method}:</span>
                          <span style={{ color: theme.colors.primary, fontFamily: theme.fonts.primary, fontWeight: 'bold' }}>
                            {count.toLocaleString()}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Calls by Path */}
              {Object.keys(apiStats.callsByPath).length > 0 && (
                <div>
                  <h3 style={{ ...styles.cardTitle, fontSize: '1.2rem', marginBottom: '10px' }}>Top Endpoints</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {Object.entries(apiStats.callsByPath)
                      .slice(0, 10)
                      .map(([path, count]) => (
                        <div key={path} style={styles.actionRow}>
                          <span style={{ ...styles.actionLabel, fontFamily: theme.fonts.primary, fontSize: '0.9rem' }}>{path}:</span>
                          <span style={{ color: theme.colors.primary, fontFamily: theme.fonts.primary, fontWeight: 'bold' }}>
                            {count.toLocaleString()}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Calls by Status */}
              {Object.keys(apiStats.callsByStatus).length > 0 && (
                <div>
                  <h3 style={{ ...styles.cardTitle, fontSize: '1.2rem', marginBottom: '10px' }}>Calls by Status Code</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {Object.entries(apiStats.callsByStatus)
                      .sort(([a], [b]) => parseInt(a) - parseInt(b))
                      .map(([status, count]) => (
                        <div key={status} style={styles.actionRow}>
                          <span style={styles.actionLabel}>
                            {status} {status === '200' ? '✓' : status.startsWith('4') || status.startsWith('5') ? '✗' : ''}:
                          </span>
                          <span style={{ 
                            color: status === '200' ? theme.colors.primary : status.startsWith('4') || status.startsWith('5') ? '#FF4444' : theme.colors.textSecondary,
                            fontFamily: theme.fonts.primary,
                            fontWeight: 'bold'
                          }}>
                            {count.toLocaleString()}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Recent Errors */}
              {apiStats.recentErrors && apiStats.recentErrors.length > 0 && (
                <div>
                  <h3 style={{ ...styles.cardTitle, fontSize: '1.2rem', marginBottom: '10px' }}>Recent Errors</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '200px', overflowY: 'auto' }}>
                    {apiStats.recentErrors.map((error: any, index: number) => (
                      <div key={index} style={{
                        padding: '10px',
                        background: 'rgba(255, 68, 68, 0.1)',
                        border: `1px solid #FF4444`,
                        borderRadius: theme.effects.borderRadius,
                        fontSize: '0.85rem',
                        fontFamily: theme.fonts.primary,
                      }}>
                        <div style={{ color: '#FF4444', fontWeight: 'bold', marginBottom: '5px' }}>
                          {error.path || error.message || 'Unknown error'}
                        </div>
                        {error.error && (
                          <div style={{ color: theme.colors.textSecondary, fontSize: '0.8rem' }}>
                            {error.error}
                          </div>
                        )}
                        <div style={{ color: theme.colors.textSecondary, fontSize: '0.75rem', marginTop: '5px' }}>
                          {new Date(error.timestamp).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p style={styles.helpText}>Loading API statistics...</p>
          )}
        </div>

        {/* Configured Spotify IDs */}
        <div style={{ ...styles.card, marginBottom: '40px' }}>
          <h2 style={styles.cardTitle}>Configured Spotify IDs</h2>
          {spotifyIds.length === 0 ? (
            <p style={styles.helpText}>No Spotify IDs configured. Use search below to add some.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '30px' }}>
              {spotifyIds.map((item) => (
                <div key={item.id} style={styles.actionRow}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: theme.colors.text, fontWeight: 'bold', fontFamily: theme.fonts.primary }}>
                      {item.name}
                    </div>
                    <div style={{ color: theme.colors.textSecondary, fontSize: '0.9rem', fontFamily: theme.fonts.primary }}>
                      {item.type} • {item.id}
                    </div>
                  </div>
                  <button
                    onClick={() => removeSpotifyId(item.id)}
                    style={{
                      ...styles.buttonSmall,
                      background: 'rgba(200, 0, 0, 0.3)',
                      border: '2px solid #FF0000',
                      color: '#FF0000',
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Spotify Search */}
          <div style={{ borderTop: `1px solid ${theme.colors.border}`, paddingTop: '30px', marginTop: '30px' }}>
            <h3 style={{ ...styles.cardTitle, fontSize: '1.3rem', marginBottom: '20px' }}>Search Spotify</h3>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    searchSpotify();
                  }
                }}
                style={{ ...styles.input, flex: 1 }}
                placeholder="Search for tracks, albums, playlists, artists..."
              />
              <button
                onClick={searchSpotify}
                disabled={searching || !searchQuery.trim()}
                style={{
                  ...styles.button,
                  ...(searching || !searchQuery.trim() ? styles.buttonDisabled : {}),
                }}
              >
                {searching ? 'Searching...' : 'Search'}
              </button>
            </div>

            {searchResults && (
              <div>
                {(() => {
                  const validTracks = searchResults.tracks?.items?.filter((track: any) => track && track.id && track.name) || [];
                  return validTracks.length > 0 && (
                    <div style={{ marginBottom: '30px' }}>
                      <h4 style={{ ...styles.cardTitle, fontSize: '1.1rem', marginBottom: '15px' }}>Tracks</h4>
                      {validTracks.map((track: any) => (
                        <div key={track.id} style={styles.actionRow}>
                          <div style={{ flex: 1 }}>
                            <div style={{ color: theme.colors.text, fontWeight: 'bold', fontFamily: theme.fonts.primary }}>
                              {track.name || 'Unknown'}
                            </div>
                            <div style={{ color: theme.colors.textSecondary, fontSize: '0.9rem', fontFamily: theme.fonts.primary }}>
                              {track.artists?.map((a: any) => a?.name).filter(Boolean).join(', ') || 'Unknown'} • {track.album?.name || 'Unknown'}
                            </div>
                          </div>
                          <button
                            onClick={() => track.uri && addSpotifyId(track.uri)}
                            style={{
                              ...styles.buttonSmall,
                              ...styles.buttonSmallActive,
                              minWidth: '60px',
                            }}
                          >
                            +
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {(() => {
                  const validAlbums = searchResults.albums?.items?.filter((album: any) => album && album.id && album.name) || [];
                  return validAlbums.length > 0 && (
                    <div style={{ marginBottom: '30px' }}>
                      <h4 style={{ ...styles.cardTitle, fontSize: '1.1rem', marginBottom: '15px' }}>Albums</h4>
                      {validAlbums.map((album: any) => (
                        <div key={album.id} style={styles.actionRow}>
                          <div style={{ flex: 1 }}>
                            <div style={{ color: theme.colors.text, fontWeight: 'bold', fontFamily: theme.fonts.primary }}>
                              {album.name || 'Unknown'}
                            </div>
                            <div style={{ color: theme.colors.textSecondary, fontSize: '0.9rem', fontFamily: theme.fonts.primary }}>
                              {album.artists?.map((a: any) => a?.name).filter(Boolean).join(', ') || 'Unknown'}
                            </div>
                          </div>
                          <button
                            onClick={() => album.uri && addSpotifyId(album.uri)}
                            style={{
                              ...styles.buttonSmall,
                              ...styles.buttonSmallActive,
                              minWidth: '60px',
                            }}
                          >
                            +
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {(() => {
                  const validPlaylists = searchResults.playlists?.items?.filter((playlist: any) => playlist && playlist.id && playlist.name) || [];
                  return validPlaylists.length > 0 && (
                    <div style={{ marginBottom: '30px' }}>
                      <h4 style={{ ...styles.cardTitle, fontSize: '1.1rem', marginBottom: '15px' }}>Playlists</h4>
                      {validPlaylists.map((playlist: any) => (
                        <div key={playlist.id} style={styles.actionRow}>
                          <div style={{ flex: 1 }}>
                            <div style={{ color: theme.colors.text, fontWeight: 'bold', fontFamily: theme.fonts.primary }}>
                              {playlist.name || 'Unknown'}
                            </div>
                            <div style={{ color: theme.colors.textSecondary, fontSize: '0.9rem', fontFamily: theme.fonts.primary }}>
                              by {playlist.owner?.display_name || playlist.owner?.id || 'Unknown'}
                            </div>
                          </div>
                          <button
                            onClick={() => playlist.uri && addSpotifyId(playlist.uri)}
                            style={{
                              ...styles.buttonSmall,
                              ...styles.buttonSmallActive,
                              minWidth: '60px',
                            }}
                          >
                            +
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {(() => {
                  const validArtists = searchResults.artists?.items?.filter((artist: any) => artist && artist.id && artist.name) || [];
                  return validArtists.length > 0 && (
                    <div style={{ marginBottom: '30px' }}>
                      <h4 style={{ ...styles.cardTitle, fontSize: '1.1rem', marginBottom: '15px' }}>Artists</h4>
                      {validArtists.map((artist: any) => (
                        <div key={artist.id} style={styles.actionRow}>
                          <div style={{ flex: 1 }}>
                            <div style={{ color: theme.colors.text, fontWeight: 'bold', fontFamily: theme.fonts.primary }}>
                              {artist.name || 'Unknown'}
                            </div>
                            <div style={{ color: theme.colors.textSecondary, fontSize: '0.9rem', fontFamily: theme.fonts.primary }}>
                              Artist
                            </div>
                          </div>
                          <button
                            onClick={() => artist.uri && addSpotifyId(artist.uri)}
                            style={{
                              ...styles.buttonSmall,
                              ...styles.buttonSmallActive,
                              minWidth: '60px',
                            }}
                          >
                            +
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>

        {/* Recently Played Artists */}
        <div style={{ ...styles.card, marginBottom: '40px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={styles.cardTitle}>Recently Played Artists</h2>
            {recentArtists.length > 0 && (
              <button
                onClick={clearRecentArtists}
                disabled={saving}
                style={{
                  ...styles.buttonSmall,
                  background: 'rgba(200, 0, 0, 0.3)',
                  border: '2px solid #FF0000',
                  color: '#FF0000',
                  ...(saving ? styles.buttonDisabled : {}),
                }}
              >
                {saving ? 'Clearing...' : 'Clear All'}
              </button>
            )}
          </div>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ ...styles.label, marginBottom: '5px' }}>
              Recent Artists Limit:
            </label>
            <input
              type="number"
              min="1"
              value={recentArtistsLimit}
              onChange={(e) => {
                const limit = parseInt(e.target.value) || 20;
                setRecentArtistsLimit(limit);
                saveRecentArtistsLimit(limit);
              }}
              style={styles.input}
            />
          </div>
          {recentArtists.length === 0 ? (
            <p style={styles.helpText}>No recently played artists. Artists will be added automatically when tracks are played.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {recentArtists.map((item) => (
                <div key={item.id} style={styles.actionRow}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: theme.colors.text, fontWeight: 'bold', fontFamily: theme.fonts.primary }}>
                      {item.name}
                    </div>
                    <div style={{ color: theme.colors.textSecondary, fontSize: '0.9rem', fontFamily: theme.fonts.primary }}>
                      {item.type} • {item.id}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>



        <div style={{ textAlign: 'center', marginTop: '40px' }}>
          <a href="/" style={styles.link}>
            ← Back to Jukebox
          </a>
        </div>
      </div>
    </div>
  );
}
