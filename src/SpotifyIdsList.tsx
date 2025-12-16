import React from 'react';
import { useJukeboxState } from './JukeboxStateProvider';
import { SpotifyIdWithArtwork } from './ConfigStateProvider';

// Helper function to convert image URL to cached endpoint
function getCachedImageUrl(imageUrl: string): string {
  if (!imageUrl) return '';
  if (imageUrl.startsWith('/api/image/')) return imageUrl;
  const base64Url = btoa(unescape(encodeURIComponent(imageUrl)));
  return `/api/image/${base64Url}`;
}

interface SpotifyIdsListProps {
  items: SpotifyIdWithArtwork[];
  title: string;
  sidebarStyle: 'left' | 'right';
  theme: any;
  styles: any;
  isMobile: boolean;
}

export function SpotifyIdsList({ items, title, sidebarStyle, theme, styles, isMobile }: SpotifyIdsListProps) {
  const { addToQueue, loadingSpotifyId } = useJukeboxState();

  if (items.length === 0) {
    return null;
  }

  const sidebarStyleObj = sidebarStyle === 'left' ? styles.spotifyIdsSidebarLeft : styles.spotifyIdsSidebarRight;

  return (
    <div style={sidebarStyleObj}>
      <div style={styles.spotifyIdsSidebarTitle}>{title}</div>
      <div style={styles.spotifyIdsSidebarScroll}>
        {items.map((item) => (
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
  );
}

