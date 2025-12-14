import { createRoot } from 'react-dom/client';
import React, { useEffect, useState, useCallback, useMemo } from 'react';

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

interface SpotifyConfig {
  clientId: string;
  clientSecret: string;
}

function Manage() {
  const [hotkeys, setHotkeys] = useState<HotkeyConfig | null>(null);
  const [themeName, setThemeName] = useState<string>('steampunk');
  const [theme, setTheme] = useState<Theme>(steampunkTheme);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [capturingKey, setCapturingKey] = useState<string | null>(null);
  const [capturingButton, setCapturingButton] = useState<string | null>(null);
  const [spotifyIds, setSpotifyIds] = useState<SpotifyId[]>([]);
  const [spotifyConfig, setSpotifyConfig] = useState<SpotifyConfig>({ clientId: '', clientSecret: '' });
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<any>(null);
  const [searching, setSearching] = useState(false);

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

  const fetchSpotifyConfig = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/spotify/config`);
      const data = await response.json();
      if (data) {
        setSpotifyConfig({
          clientId: data.clientId || '',
          clientSecret: data.clientSecret || '',
        });
      }
    } catch (error) {
      console.error('Failed to fetch Spotify config:', error);
    }
  }, []);

  useEffect(() => {
    fetchHotkeys();
    fetchTheme();
    fetchSpotifyIds();
    fetchSpotifyConfig();
  }, [fetchHotkeys, fetchTheme, fetchSpotifyIds, fetchSpotifyConfig]);

  const saveHotkeys = async () => {
    if (!hotkeys) return;
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/api/hotkeys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(hotkeys),
      });
      const data = await response.json();
      if (data.success) {
        setMessage('Hotkeys saved successfully!');
      } else {
        setMessage('Failed to save hotkeys');
      }
    } catch (error) {
      setMessage('Error saving hotkeys');
      console.error(error);
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const saveTheme = async () => {
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/api/theme`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: themeName }),
      });
      const data = await response.json();
      if (data.theme) {
        // Update local theme immediately
        if (themes[data.theme]) {
          setTheme(themes[data.theme]);
        }
        setMessage('Theme saved successfully!');
      } else {
        setMessage('Failed to save theme');
      }
    } catch (error) {
      setMessage('Error saving theme');
      console.error(error);
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 3000);
    }
  };

  // Update theme when themeName changes
  useEffect(() => {
    if (themes[themeName]) {
      setTheme(themes[themeName]);
    }
  }, [themeName]);

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

  const saveSpotifyConfig = async () => {
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/api/spotify/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spotifyConfig),
      });
      const data = await response.json();
      if (data.success) {
        setMessage('Spotify config saved successfully!');
        // Refresh IDs to get updated metadata
        fetchSpotifyIds();
      } else {
        setMessage('Failed to save Spotify config');
      }
    } catch (error) {
      setMessage('Error saving Spotify config');
      console.error(error);
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 3000);
    }
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
          {/* Theme Configuration */}
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Theme</h2>
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
            <button
              onClick={saveTheme}
              disabled={saving}
              style={{
                ...styles.button,
                width: '100%',
                ...(saving ? styles.buttonDisabled : {}),
              }}
            >
              {saving ? 'Saving...' : 'Save Theme'}
            </button>
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

        {/* Spotify Configuration */}
        <div style={{ ...styles.card, marginBottom: '40px' }}>
          <h2 style={styles.cardTitle}>Spotify Configuration</h2>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ ...styles.label, marginBottom: '5px' }}>
              Client ID:
            </label>
            <input
              type="text"
              value={spotifyConfig.clientId}
              onChange={(e) => setSpotifyConfig({ ...spotifyConfig, clientId: e.target.value })}
              style={styles.input}
              placeholder="Spotify Client ID"
            />
          </div>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ ...styles.label, marginBottom: '5px' }}>
              Client Secret:
            </label>
            <input
              type="password"
              value={spotifyConfig.clientSecret}
              onChange={(e) => setSpotifyConfig({ ...spotifyConfig, clientSecret: e.target.value })}
              style={styles.input}
              placeholder="Spotify Client Secret"
            />
          </div>
          <button
            onClick={saveSpotifyConfig}
            disabled={saving}
            style={{
              ...styles.button,
              width: '100%',
              ...(saving ? styles.buttonDisabled : {}),
            }}
          >
            {saving ? 'Saving...' : 'Save Spotify Config'}
          </button>
        </div>

        {/* Saved Spotify IDs */}
        <div style={{ ...styles.card, marginBottom: '40px' }}>
          <h2 style={styles.cardTitle}>Saved Spotify IDs</h2>
          {spotifyIds.length === 0 ? (
            <p style={styles.helpText}>No Spotify IDs saved. Use search below to add some.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
        </div>

        {/* Spotify Search */}
        <div style={{ ...styles.card, marginBottom: '40px' }}>
          <h2 style={styles.cardTitle}>Search Spotify</h2>
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
              {searchResults.tracks?.items && searchResults.tracks.items.length > 0 && (
                <div style={{ marginBottom: '30px' }}>
                  <h3 style={{ ...styles.cardTitle, fontSize: '1.3rem', marginBottom: '15px' }}>Tracks</h3>
                  {searchResults.tracks.items.map((track: any) => (
                    <div key={track.id} style={styles.actionRow}>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: theme.colors.text, fontWeight: 'bold', fontFamily: theme.fonts.primary }}>
                          {track.name}
                        </div>
                        <div style={{ color: theme.colors.textSecondary, fontSize: '0.9rem', fontFamily: theme.fonts.primary }}>
                          {track.artists?.map((a: any) => a.name).join(', ')} • {track.album?.name}
                        </div>
                      </div>
                      <button
                        onClick={() => addSpotifyId(track.uri)}
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
              )}

              {searchResults.albums?.items && searchResults.albums.items.length > 0 && (
                <div style={{ marginBottom: '30px' }}>
                  <h3 style={{ ...styles.cardTitle, fontSize: '1.3rem', marginBottom: '15px' }}>Albums</h3>
                  {searchResults.albums.items.map((album: any) => (
                    <div key={album.id} style={styles.actionRow}>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: theme.colors.text, fontWeight: 'bold', fontFamily: theme.fonts.primary }}>
                          {album.name}
                        </div>
                        <div style={{ color: theme.colors.textSecondary, fontSize: '0.9rem', fontFamily: theme.fonts.primary }}>
                          {album.artists?.map((a: any) => a.name).join(', ')}
                        </div>
                      </div>
                      <button
                        onClick={() => addSpotifyId(album.uri)}
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
              )}

              {searchResults.playlists?.items && searchResults.playlists.items.length > 0 && (
                <div style={{ marginBottom: '30px' }}>
                  <h3 style={{ ...styles.cardTitle, fontSize: '1.3rem', marginBottom: '15px' }}>Playlists</h3>
                  {searchResults.playlists.items.map((playlist: any) => (
                    <div key={playlist.id} style={styles.actionRow}>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: theme.colors.text, fontWeight: 'bold', fontFamily: theme.fonts.primary }}>
                          {playlist.name}
                        </div>
                        <div style={{ color: theme.colors.textSecondary, fontSize: '0.9rem', fontFamily: theme.fonts.primary }}>
                          by {playlist.owner?.display_name || 'Unknown'}
                        </div>
                      </div>
                      <button
                        onClick={() => addSpotifyId(playlist.uri)}
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
              )}

              {searchResults.artists?.items && searchResults.artists.items.length > 0 && (
                <div style={{ marginBottom: '30px' }}>
                  <h3 style={{ ...styles.cardTitle, fontSize: '1.3rem', marginBottom: '15px' }}>Artists</h3>
                  {searchResults.artists.items.map((artist: any) => (
                    <div key={artist.id} style={styles.actionRow}>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: theme.colors.text, fontWeight: 'bold', fontFamily: theme.fonts.primary }}>
                          {artist.name}
                        </div>
                        <div style={{ color: theme.colors.textSecondary, fontSize: '0.9rem', fontFamily: theme.fonts.primary }}>
                          Artist
                        </div>
                      </div>
                      <button
                        onClick={() => addSpotifyId(artist.uri)}
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
              )}
            </div>
          )}
        </div>

        {/* Save Button */}
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={saveHotkeys}
            disabled={saving || !hotkeys}
            style={{
              ...styles.button,
              padding: '15px 40px',
              fontSize: '1.2rem',
              ...(saving || !hotkeys ? styles.buttonDisabled : {}),
            }}
          >
            {saving ? 'Saving...' : 'Save All Hotkeys'}
          </button>
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
