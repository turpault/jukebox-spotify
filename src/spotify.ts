import { getConfig, setConfig } from "./config";

let spotifyTokenCache: { token: string; expiresAt: number } | null = null;

// Get Spotify access token using client credentials flow
export async function getSpotifyToken(): Promise<string | null> {
  // Check cache first
  if (spotifyTokenCache && spotifyTokenCache.expiresAt > Date.now()) {
    return spotifyTokenCache.token;
  }

  const config = await getConfig();
  const clientId = config.spotify?.clientId;
  const clientSecret = config.spotify?.clientSecret;

  if (!clientId || !clientSecret) {
    return null;
  }

  try {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const token = data.access_token;
    const expiresIn = data.expires_in || 3600;
    
    // Cache token (expire 1 minute before actual expiry)
    spotifyTokenCache = {
      token,
      expiresAt: Date.now() + (expiresIn - 60) * 1000,
    };

    return token;
  } catch (error) {
    console.error('Failed to get Spotify token:', error);
    return null;
  }
}

// Clear token cache (useful when credentials change)
export function clearSpotifyTokenCache() {
  spotifyTokenCache = null;
}

// Helper function to fetch metadata for Spotify IDs
export async function fetchSpotifyIdsMetadata(ids: string[], token: string | null) {
  if (!token) {
    return ids.map(id => ({ id, name: 'Unknown', type: 'unknown', imageUrl: '' }));
  }

  return Promise.all(
    ids.map(async (id: string) => {
      try {
        const parts = id.split(':');
        if (parts.length < 3 || parts[0] !== 'spotify') {
          return { id, name: 'Invalid URI', type: 'unknown', imageUrl: '' };
        }

        const type = parts[1];
        const spotifyId = parts[2];

        const response = await fetch(`https://api.spotify.com/v1/${type}s/${spotifyId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          return { id, name: 'Unknown', type, imageUrl: '' };
        }

        const data = await response.json();
        const name = data.name || 'Unknown';
        let displayName = name;
        let imageUrl = '';

        if (type === 'track') {
          const artist = data.artists?.[0]?.name || '';
          displayName = artist ? `${name} - ${artist}` : name;
          imageUrl = data.album?.images?.[0]?.url || data.album?.images?.[1]?.url || '';
        } else if (type === 'album') {
          const artist = data.artists?.[0]?.name || '';
          displayName = artist ? `${name} - ${artist}` : name;
          imageUrl = data.images?.[0]?.url || data.images?.[1]?.url || '';
        } else if (type === 'playlist') {
          const owner = data.owner?.display_name || data.owner?.id || '';
          displayName = owner ? `${name} (by ${owner})` : name;
          imageUrl = data.images?.[0]?.url || data.images?.[1]?.url || '';
        } else if (type === 'artist') {
          imageUrl = data.images?.[0]?.url || data.images?.[1]?.url || '';
        }

        return { id, name: displayName, type, imageUrl };
      } catch (error) {
        const parts = id.split(':');
        return { id, name: 'Unknown', type: parts[1] || 'unknown', imageUrl: '' };
      }
    })
  );
}

export function createSpotifyRoutes() {
  return {
    // Spotify token API
    "/api/spotify/token": {
      GET: async () => {
        try {
          const token = await getSpotifyToken();
          if (!token) {
            return Response.json({ error: "Failed to get Spotify token. Check client ID and secret." }, { status: 401 });
          }
          return Response.json({ token });
        } catch (error) {
          return Response.json({ error: "Failed to get Spotify token" }, { status: 500 });
        }
      },
    },
    // Configured Spotify IDs API
    "/api/spotify/ids": {
      GET: async () => {
        try {
          const config = await getConfig();
          const spotifyIds = config.spotify?.configuredSpotifyIds || [];
          const token = await getSpotifyToken();
          const idsWithMetadata = await fetchSpotifyIdsMetadata(spotifyIds, token);
          return Response.json({ ids: idsWithMetadata });
        } catch (error) {
          return Response.json({ error: "Failed to get Spotify IDs" }, { status: 500 });
        }
      },
      POST: async (req) => {
        try {
          const body = await req.json() as { ids?: string[] };
          const ids = body.ids || [];
          
          const config = await getConfig();
          if (!config.spotify) {
            config.spotify = {};
          }
          config.spotify.configuredSpotifyIds = ids;
          await setConfig(config);
          
          return Response.json({ success: true });
        } catch (error) {
          return Response.json({ error: "Failed to set Spotify IDs" }, { status: 500 });
        }
      },
    },
    // Recently played artists API
    "/api/spotify/recent-artists": {
      GET: async () => {
        try {
          const config = await getConfig();
          const artistIds = config.spotify?.recentlyPlayedArtists || [];
          const token = await getSpotifyToken();
          const idsWithMetadata = await fetchSpotifyIdsMetadata(artistIds, token);
          return Response.json({ ids: idsWithMetadata });
        } catch (error) {
          return Response.json({ error: "Failed to get recent artists" }, { status: 500 });
        }
      },
      POST: async (req) => {
        try {
          const body = await req.json() as { artistId?: string };
          if (!body.artistId) {
            return Response.json({ error: "Artist ID is required" }, { status: 400 });
          }
          
          const config = await getConfig();
          if (!config.spotify) {
            config.spotify = {};
          }
          if (!config.spotify.recentlyPlayedArtists) {
            config.spotify.recentlyPlayedArtists = [];
          }
          
          // Add to beginning if not already present
          const artistIds = config.spotify.recentlyPlayedArtists;
          if (!artistIds.includes(body.artistId)) {
            artistIds.unshift(body.artistId);
            // Limit to configured limit (default 20)
            const limit = config.spotify.recentArtistsLimit || 20;
            if (artistIds.length > limit) {
              artistIds.splice(limit);
            }
            config.spotify.recentlyPlayedArtists = artistIds;
            await setConfig(config);
          }
          
          return Response.json({ success: true });
        } catch (error) {
          return Response.json({ error: "Failed to add recent artist" }, { status: 500 });
        }
      },
      DELETE: async () => {
        try {
          const config = await getConfig();
          if (config.spotify) {
            config.spotify.recentlyPlayedArtists = [];
            await setConfig(config);
          }
          return Response.json({ success: true });
        } catch (error) {
          return Response.json({ error: "Failed to clear recent artists" }, { status: 500 });
        }
      },
    },
    // Spotify search API
    "/api/spotify/search": {
      GET: async (req) => {
        try {
          const url = new URL(req.url);
          const query = url.searchParams.get('q');
          const type = url.searchParams.get('type') || 'track,album,playlist,artist';

          if (!query) {
            return Response.json({ error: "Query parameter 'q' is required" }, { status: 400 });
          }

          const token = await getSpotifyToken();
          if (!token) {
            return Response.json({ error: "Failed to get Spotify token" }, { status: 401 });
          }

          const response = await fetch(
            `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=${type}&limit=20`,
            {
              headers: {
                'Authorization': `Bearer ${token}`,
              },
            }
          );

          if (!response.ok) {
            return Response.json({ error: "Spotify API error" }, { status: response.status });
          }

          const data = await response.json();
          return Response.json(data);
        } catch (error) {
          return Response.json({ error: "Failed to search Spotify" }, { status: 500 });
        }
      },
    },
    // Spotify config API (POST only - credentials should never be exposed via GET)
    "/api/spotify/config": {
      POST: async (req) => {
        try {
          const body = await req.json() as { clientId?: string; clientSecret?: string };
          const config = await getConfig();
          
          if (!config.spotify) {
            config.spotify = {};
          }
          
          if (body.clientId !== undefined) {
            config.spotify.clientId = body.clientId;
          }
          if (body.clientSecret !== undefined) {
            config.spotify.clientSecret = body.clientSecret;
          }
          
          // Clear token cache when credentials change
          clearSpotifyTokenCache();
          
          await setConfig(config);
          return Response.json({ success: true });
        } catch (error) {
          return Response.json({ error: "Failed to set Spotify config" }, { status: 500 });
        }
      },
    },
    // Recent artists limit API
    "/api/spotify/recent-artists-limit": {
      GET: async () => {
        try {
          const config = await getConfig();
          const limit = config.spotify?.recentArtistsLimit || 20;
          return Response.json({ limit });
        } catch (error) {
          return Response.json({ error: "Failed to get recent artists limit" }, { status: 500 });
        }
      },
      POST: async (req) => {
        try {
          const body = await req.json() as { limit?: number };
          const limit = body.limit;
          
          if (limit === undefined || limit < 1) {
            return Response.json({ error: "Limit must be a positive number" }, { status: 400 });
          }
          
          const config = await getConfig();
          if (!config.spotify) {
            config.spotify = {};
          }
          config.spotify.recentArtistsLimit = limit;
          await setConfig(config);
          
          return Response.json({ success: true, limit });
        } catch (error) {
          return Response.json({ error: "Failed to set recent artists limit" }, { status: 500 });
        }
      },
    },
  };
}

