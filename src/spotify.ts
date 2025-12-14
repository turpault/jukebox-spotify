import { getConfig, setConfig } from "./config";
import { readFile, writeFile, mkdir, stat, unlink, readdir } from "fs/promises";
import { join } from "path";
import { createHash } from "crypto";
import { traceApiStart, traceApiEnd } from "./tracing";

const CACHE_DIR = "cache";
const CACHE_DURATION = 60 * 60 * 1000 * 24 * 30; // 30 days in milliseconds

let spotifyTokenCache: { token: string; expiresAt: number } | null = null;

// Ensure cache directory exists
async function ensureCacheDir() {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
  } catch (error) {
    // Directory might already exist, ignore error
  }
}

// Get cache file path for a Spotify ID
function getCacheFilePath(spotifyId: string, suffix: string = 'json'): string {
  const hash = createHash('md5').update(spotifyId).digest('hex');
  return join(CACHE_DIR, `${hash}.${suffix}`);
}

// Get cache file path for artwork
function getArtworkCachePath(spotifyId: string, imageUrl: string): string {
  const urlHash = createHash('md5').update(imageUrl).digest('hex');
  const idHash = createHash('md5').update(spotifyId).digest('hex');
  const ext = imageUrl.split('.').pop()?.split('?')[0] || 'jpg';
  return join(CACHE_DIR, `artwork_${idHash}_${urlHash}.${ext}`);
}

// Read from disk cache
async function readFromCache<T>(cacheKey: string): Promise<T | null> {
  try {
    await ensureCacheDir();
    const cachePath = getCacheFilePath(cacheKey);
    const stats = await stat(cachePath);
    
    // Check if cache is expired
    const age = Date.now() - stats.mtimeMs;
    if (age > CACHE_DURATION) {
      // Delete expired cache file
      try {
        await unlink(cachePath);
        console.log(`Deleted expired cache for ${cacheKey}`);
      } catch (error) {
        console.error(`Failed to delete expired cache for ${cacheKey}:`, error);
      }
      return null; // Cache expired
    }
    
    const data = await readFile(cachePath, 'utf-8');
    return JSON.parse(data) as T;
  } catch (error) {
    // Cache file doesn't exist or is invalid
    return null;
  }
}

// Write to disk cache
async function writeToCache<T>(cacheKey: string, data: T): Promise<void> {
  try {
    await ensureCacheDir();
    const cachePath = getCacheFilePath(cacheKey);
    await writeFile(cachePath, JSON.stringify(data), 'utf-8');
  } catch (error) {
    console.error(`Failed to write cache for ${cacheKey}:`, error);
  }
}

// Cache artwork image
async function cacheArtwork(spotifyId: string, imageUrl: string): Promise<string | null> {
  if (!imageUrl) return null;
  
  try {
    await ensureCacheDir();
    const cachePath = getArtworkCachePath(spotifyId, imageUrl);
    
    // Check if already cached
    try {
      await stat(cachePath);
      // File exists, return relative path
      return `/cache/${cachePath.split('/').pop()}`;
    } catch {
      // File doesn't exist, fetch and cache it
    }
    
    const response = await fetch(imageUrl);
    if (!response.ok) {
      return null;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await writeFile(cachePath, buffer);
    
    return `/cache/${cachePath.split('/').pop()}`;
  } catch (error) {
    console.error(`Failed to cache artwork for ${spotifyId}:`, error);
    return null;
  }
}

// Get cached artwork or return original URL
async function getCachedArtworkUrl(spotifyId: string, imageUrl: string): Promise<string> {
  if (!imageUrl) return '';
  
  const cached = await cacheArtwork(spotifyId, imageUrl);
  return cached || imageUrl;
}

// Clean up expired cache files
async function cleanupExpiredCache(): Promise<void> {
  try {
    await ensureCacheDir();
    const files = await readdir(CACHE_DIR);
    const now = Date.now();
    
    for (const file of files) {
      // Only process JSON cache files (metadata), not artwork files
      if (!file.endsWith('.json')) continue;
      
      try {
        const filePath = join(CACHE_DIR, file);
        const stats = await stat(filePath);
        const age = now - stats.mtimeMs;
        
        if (age > CACHE_DURATION) {
          await unlink(filePath);
          console.log(`Cleaned up expired cache file: ${file}`);
        }
      } catch (error) {
        // Ignore errors for individual files
        console.error(`Error checking cache file ${file}:`, error);
      }
    }
  } catch (error) {
    console.error('Error during cache cleanup:', error);
  }
}

// Run cache cleanup every 30 minutes
setInterval(() => {
  cleanupExpiredCache().catch(console.error);
}, 30 * 60 * 1000);

// Run initial cleanup on startup
cleanupExpiredCache().catch(console.error);

// Helper function to fetch with exponential backoff retry
async function fetchWithRetry(
  url: string,
  headers: HeadersInit,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<Response> {
  let delay = initialDelay;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, { headers });
    
    if (response.status === 429) {
      // Rate limited - check for Retry-After header
      const retryAfter = response.headers.get('Retry-After');
      if (retryAfter) {
        const retrySeconds = parseInt(retryAfter, 10);
        if (!isNaN(retrySeconds) && retrySeconds > 0) {
          delay = retrySeconds * 1000;
          console.warn(`Spotify API rate limited. Retrying after ${retrySeconds} seconds (attempt ${attempt + 1}/${maxRetries + 1})`);
        } else {
          // Exponential backoff if no Retry-After header
          delay = initialDelay * Math.pow(2, attempt);
          console.warn(`Spotify API rate limited. Retrying after ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
        }
      } else {
        // Exponential backoff if no Retry-After header
        delay = initialDelay * Math.pow(2, attempt);
        console.warn(`Spotify API rate limited. Retrying after ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
      }
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      } else {
        console.error(`Spotify API rate limited. Max retries (${maxRetries + 1}) exceeded.`);
        throw new Error(`Rate limit exceeded after ${maxRetries + 1} attempts`);
      }
    }
    
    // Not a rate limit error, return the response
    return response;
  }
  
  // Should never reach here, but TypeScript needs it
  throw new Error('Unexpected error in fetchWithRetry');
}

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

// Fetch metadata for a single Spotify ID with disk caching
async function fetchSpotifyMetadata(id: string, token: string | null): Promise<{ id: string; name: string; type: string; imageUrl: string }> {
  if (!token) {
    return { id, name: 'Unknown', type: 'unknown', imageUrl: '' };
  }

  try {
    const parts = id.split(':');
    if (parts.length < 3 || parts[0] !== 'spotify') {
      return { id, name: 'Invalid URI', type: 'unknown', imageUrl: '' };
    }

    // Check disk cache first
    const cached = await readFromCache<{ id: string; name: string; type: string; imageUrl: string }>(id);
    if (cached) {
      console.log(`Using cached metadata for ${id}`);
      // Get cached artwork URL if available
      if (cached.imageUrl) {
        const cachedArtworkUrl = await getCachedArtworkUrl(id, cached.imageUrl);
        return { ...cached, imageUrl: cachedArtworkUrl };
      }
      return cached;
    }

    const type = parts[1];
    const spotifyId = parts[2];

    // Fetch with retry logic for rate limiting
    const response = await fetchWithRetry(
      `https://api.spotify.com/v1/${type}s/${spotifyId}`,
      {
        'Authorization': `Bearer ${token}`,
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error(`Spotify API error for ${id}: ${response.status} ${response.statusText}`, errorText);
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

    // Cache artwork if available
    let cachedImageUrl = imageUrl;
    if (imageUrl) {
      const cached = await cacheArtwork(id, imageUrl);
      if (cached) {
        cachedImageUrl = cached;
      }
    }

    const result = { id, name: displayName, type, imageUrl: cachedImageUrl };
    
    // Cache the metadata to disk
    await writeToCache(id, result);
    
    return result;
  } catch (error) {
    console.error(`Error fetching metadata for ${id}:`, error);
    
    // If it's a rate limit error, try to return cached data even if expired
    if (error instanceof Error && error.message.includes('Rate limit')) {
      const cached = await readFromCache<{ id: string; name: string; type: string; imageUrl: string }>(id);
      if (cached) {
        console.log(`Rate limited, using expired cache for ${id}`);
        return cached;
      }
    }
    
    const parts = id.split(':');
    return { id, name: 'Unknown', type: parts[1] || 'unknown', imageUrl: '' };
  }
}

// Export handlers for dynamic Spotify API routes
export async function handleTrackRequest(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  if (!url.pathname.startsWith('/api/spotify/tracks/')) {
    return null;
  }
  
  const trackId = decodeURIComponent(url.pathname.replace('/api/spotify/tracks/', ''));
  if (!trackId) {
    return Response.json({ error: "Missing track ID" }, { status: 400 });
  }
  
  const traceContext = traceApiStart('GET', `/api/spotify/tracks/${trackId}`, 'inbound', { trackId });
  try {
    const token = await getSpotifyToken();
    if (!token) {
      traceApiEnd(traceContext, 401, { error: "Failed to get Spotify token" });
      return Response.json({ error: "Failed to get Spotify token" }, { status: 401 });
    }

    const spotifyTraceContext = traceApiStart('GET', `https://api.spotify.com/v1/tracks/${trackId}`, 'outbound');
    const response = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      traceApiEnd(spotifyTraceContext, response.status, null);
      traceApiEnd(traceContext, response.status, { error: "Spotify API error" });
      return Response.json({ error: "Spotify API error" }, { status: response.status });
    }

    const data = await response.json();
    traceApiEnd(spotifyTraceContext, response.status, { trackName: data.name });
    traceApiEnd(traceContext, 200, { trackName: data.name });
    return Response.json(data);
  } catch (error) {
    traceApiEnd(traceContext, 500, null, error);
    return Response.json({ error: "Failed to fetch track" }, { status: 500 });
  }
}

export async function handleAlbumTracksRequest(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const match = url.pathname.match(/^\/api\/spotify\/albums\/([^\/]+)\/tracks$/);
  if (!match) {
    return null;
  }
  
  const albumId = decodeURIComponent(match[1]);
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const traceContext = traceApiStart('GET', `/api/spotify/albums/${albumId}/tracks`, 'inbound', { albumId, limit, offset });
  try {
    const token = await getSpotifyToken();
    if (!token) {
      traceApiEnd(traceContext, 401, { error: "Failed to get Spotify token" });
      return Response.json({ error: "Failed to get Spotify token" }, { status: 401 });
    }

    const spotifyTraceContext = traceApiStart('GET', `https://api.spotify.com/v1/albums/${albumId}/tracks`, 'outbound', { limit, offset });
    const response = await fetch(`https://api.spotify.com/v1/albums/${albumId}/tracks?limit=${limit}&offset=${offset}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      traceApiEnd(spotifyTraceContext, response.status, null);
      traceApiEnd(traceContext, response.status, { error: "Spotify API error" });
      return Response.json({ error: "Spotify API error" }, { status: response.status });
    }

    const data = await response.json();
    traceApiEnd(spotifyTraceContext, response.status, { tracksCount: data.items?.length || 0, hasNext: !!data.next });
    traceApiEnd(traceContext, 200, { tracksCount: data.items?.length || 0, hasNext: !!data.next });
    return Response.json(data);
  } catch (error) {
    traceApiEnd(traceContext, 500, null, error);
    return Response.json({ error: "Failed to fetch album tracks" }, { status: 500 });
  }
}

export async function handlePlaylistTracksRequest(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const match = url.pathname.match(/^\/api\/spotify\/playlists\/([^\/]+)\/tracks$/);
  if (!match) {
    return null;
  }
  
  const playlistId = decodeURIComponent(match[1]);
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const traceContext = traceApiStart('GET', `/api/spotify/playlists/${playlistId}/tracks`, 'inbound', { playlistId, limit, offset });
  try {
    const token = await getSpotifyToken();
    if (!token) {
      traceApiEnd(traceContext, 401, { error: "Failed to get Spotify token" });
      return Response.json({ error: "Failed to get Spotify token" }, { status: 401 });
    }

    const spotifyTraceContext = traceApiStart('GET', `https://api.spotify.com/v1/playlists/${playlistId}/tracks`, 'outbound', { limit, offset });
    const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      traceApiEnd(spotifyTraceContext, response.status, null);
      traceApiEnd(traceContext, response.status, { error: "Spotify API error" });
      return Response.json({ error: "Spotify API error" }, { status: response.status });
    }

    const data = await response.json();
    traceApiEnd(spotifyTraceContext, response.status, { tracksCount: data.items?.length || 0, hasNext: !!data.next });
    traceApiEnd(traceContext, 200, { tracksCount: data.items?.length || 0, hasNext: !!data.next });
    return Response.json(data);
  } catch (error) {
    traceApiEnd(traceContext, 500, null, error);
    return Response.json({ error: "Failed to fetch playlist tracks" }, { status: 500 });
  }
}

export async function handleArtistTopTracksRequest(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const match = url.pathname.match(/^\/api\/spotify\/artists\/([^\/]+)\/top-tracks$/);
  if (!match) {
    return null;
  }
  
  const artistId = decodeURIComponent(match[1]);
  const market = url.searchParams.get('market') || 'US';
  const traceContext = traceApiStart('GET', `/api/spotify/artists/${artistId}/top-tracks`, 'inbound', { artistId, market });
  try {
    const token = await getSpotifyToken();
    if (!token) {
      traceApiEnd(traceContext, 401, { error: "Failed to get Spotify token" });
      return Response.json({ error: "Failed to get Spotify token" }, { status: 401 });
    }

    const spotifyTraceContext = traceApiStart('GET', `https://api.spotify.com/v1/artists/${artistId}/top-tracks`, 'outbound', { market });
    const response = await fetch(`https://api.spotify.com/v1/artists/${artistId}/top-tracks?market=${market}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      traceApiEnd(spotifyTraceContext, response.status, null);
      traceApiEnd(traceContext, response.status, { error: "Spotify API error" });
      return Response.json({ error: "Spotify API error" }, { status: response.status });
    }

    const data = await response.json();
    traceApiEnd(spotifyTraceContext, response.status, { tracksCount: data.tracks?.length || 0 });
    traceApiEnd(traceContext, 200, { tracksCount: data.tracks?.length || 0 });
    return Response.json(data);
  } catch (error) {
    traceApiEnd(traceContext, 500, null, error);
    return Response.json({ error: "Failed to fetch artist top tracks" }, { status: 500 });
  }
}

// Export metadata handler for use in routes
export async function handleMetadataRequest(req: Request): Promise<Response> {
  // Extract id from req.params (Bun route syntax) or from URL as fallback
  let id: string;
  if ((req as any).params?.id) {
    id = decodeURIComponent((req as any).params.id);
  } else {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/spotify/metadata/')) {
      console.error('[handleMetadataRequest] Called with invalid path:', url.pathname);
      return Response.json({ error: "Invalid metadata request path" }, { status: 400 });
    }
    id = decodeURIComponent(url.pathname.replace('/api/spotify/metadata/', ''));
  }
  
  if (!id) {
    console.error('[handleMetadataRequest] No ID found');
    return Response.json({ error: "Missing metadata ID" }, { status: 400 });
  }
  
  const traceContext = traceApiStart('GET', `/api/spotify/metadata/${id}`, 'inbound', { id });
  try {
    const token = await getSpotifyToken();
    if (!token) {
      traceApiEnd(traceContext, 401, { error: "Failed to get Spotify token" });
      return Response.json({ error: "Failed to get Spotify token" }, { status: 401 });
    }
    
    // This is where fetchSpotifyMetadata should be called
    console.log('[handleMetadataRequest] Calling fetchSpotifyMetadata for id:', id);
    const metadata = await fetchSpotifyMetadata(id, token);
    traceApiEnd(traceContext, 200, { id: metadata.id, type: metadata.type, hasImage: !!metadata.imageUrl });
    return Response.json(metadata);
  } catch (error) {
    console.error('[handleMetadataRequest] Error:', error);
    traceApiEnd(traceContext, 500, null, error);
    return Response.json({ error: "Failed to fetch metadata" }, { status: 500 });
  }
}

export function createSpotifyRoutes() {
  return {
    // Spotify metadata API - dynamic route with :id parameter
    // Note: /api/spotify/token endpoint removed - clients no longer need it
    // All Spotify API calls go through server endpoints which automatically inject the token
    "/api/spotify/metadata/:id": {
      GET: async (req: Request) => {
        return handleMetadataRequest(req);
      },
    },
    // Configured Spotify IDs API - returns just the list of IDs
    "/api/spotify/ids": {
      GET: async () => {
        const traceContext = traceApiStart('GET', '/api/spotify/ids', 'inbound');
        try {
          const config = await getConfig();
          const spotifyIds = config.spotify?.configuredSpotifyIds || [];
          traceApiEnd(traceContext, 200, { idsCount: spotifyIds.length });
          return Response.json({ ids: spotifyIds });
        } catch (error) {
          traceApiEnd(traceContext, 500, null, error);
          return Response.json({ error: "Failed to get Spotify IDs" }, { status: 500 });
        }
      },
      POST: async (req: Request) => {
        const body = await req.json() as { ids?: string[] };
        const traceContext = traceApiStart('POST', '/api/spotify/ids', 'inbound', { idsCount: body.ids?.length || 0 });
        try {
          const ids = body.ids || [];
          
          const config = await getConfig();
          if (!config.spotify) {
            config.spotify = {};
          }
          config.spotify.configuredSpotifyIds = ids;
          await setConfig(config);
          
          traceApiEnd(traceContext, 200, { success: true });
          return Response.json({ success: true });
        } catch (error) {
          traceApiEnd(traceContext, 500, null, error);
          return Response.json({ error: "Failed to set Spotify IDs" }, { status: 500 });
        }
      },
    },
    // Recently played artists API - returns just the list of IDs
    "/api/spotify/recent-artists": {
      GET: async () => {
        const traceContext = traceApiStart('GET', '/api/spotify/recent-artists', 'inbound');
        try {
          const config = await getConfig();
          const artistIds = config.spotify?.recentlyPlayedArtists || [];
          traceApiEnd(traceContext, 200, { idsCount: artistIds.length });
          return Response.json({ ids: artistIds });
        } catch (error) {
          traceApiEnd(traceContext, 500, null, error);
          return Response.json({ error: "Failed to get recent artists" }, { status: 500 });
        }
      },
      POST: async (req: Request) => {
        const body = await req.json() as { artistId?: string };
        const traceContext = traceApiStart('POST', '/api/spotify/recent-artists', 'inbound', { artistId: body.artistId });
        try {
          if (!body.artistId) {
            traceApiEnd(traceContext, 400, { error: "Artist ID is required" });
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
          
          traceApiEnd(traceContext, 200, { success: true });
          return Response.json({ success: true });
        } catch (error) {
          traceApiEnd(traceContext, 500, null, error);
          return Response.json({ error: "Failed to add recent artist" }, { status: 500 });
        }
      },
      DELETE: async () => {
        const traceContext = traceApiStart('DELETE', '/api/spotify/recent-artists', 'inbound');
        try {
          const config = await getConfig();
          if (config.spotify) {
            config.spotify.recentlyPlayedArtists = [];
            await setConfig(config);
          }
          traceApiEnd(traceContext, 200, { success: true });
          return Response.json({ success: true });
        } catch (error) {
          traceApiEnd(traceContext, 500, null, error);
          return Response.json({ error: "Failed to clear recent artists" }, { status: 500 });
        }
      },
    },
    // Spotify search API
    "/api/spotify/search": {
      GET: async (req: Request) => {
        const url = new URL(req.url);
        const query = url.searchParams.get('q');
        const type = url.searchParams.get('type') || 'track,album,playlist,artist';
        const traceContext = traceApiStart('GET', '/api/spotify/search', 'inbound', { query, type });
        try {
          if (!query) {
            traceApiEnd(traceContext, 400, { error: "Query parameter 'q' is required" });
            return Response.json({ error: "Query parameter 'q' is required" }, { status: 400 });
          }

          const token = await getSpotifyToken();
          if (!token) {
            traceApiEnd(traceContext, 401, { error: "Failed to get Spotify token" });
            return Response.json({ error: "Failed to get Spotify token" }, { status: 401 });
          }

          const spotifyTraceContext = traceApiStart('GET', 'https://api.spotify.com/v1/search', 'outbound', { query, type });
          const response = await fetch(
            `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=${type}&limit=20`,
            {
              headers: {
                'Authorization': `Bearer ${token}`,
              },
            }
          );

          if (!response.ok) {
            traceApiEnd(spotifyTraceContext, response.status, null);
            traceApiEnd(traceContext, response.status, { error: "Spotify API error" });
            return Response.json({ error: "Spotify API error" }, { status: response.status });
          }

          const data = await response.json();
          traceApiEnd(spotifyTraceContext, response.status, { resultsCount: Object.keys(data).length });
          traceApiEnd(traceContext, 200, { resultsCount: Object.keys(data).length });
          return Response.json(data);
        } catch (error) {
          traceApiEnd(traceContext, 500, null, error);
          return Response.json({ error: "Failed to search Spotify" }, { status: 500 });
        }
      },
    },
    // Spotify config API (POST only - credentials should never be exposed via GET)
    "/api/spotify/config": {
      POST: async (req: Request) => {
        const body = await req.json() as { clientId?: string; clientSecret?: string };
        const traceContext = traceApiStart('POST', '/api/spotify/config', 'inbound', { 
          hasClientId: !!body.clientId, 
          hasClientSecret: !!body.clientSecret 
        });
        try {
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
          traceApiEnd(traceContext, 200, { success: true });
          return Response.json({ success: true });
        } catch (error) {
          traceApiEnd(traceContext, 500, null, error);
          return Response.json({ error: "Failed to set Spotify config" }, { status: 500 });
        }
      },
    },
    // Note: Dynamic routes (tracks/:id, albums/:id/tracks, etc.) are handled in index.ts fetch handler
    // since Bun routes don't support :id syntax
    // Recent artists limit API
    "/api/spotify/recent-artists-limit": {
      GET: async () => {
        const traceContext = traceApiStart('GET', '/api/spotify/recent-artists-limit', 'inbound');
        try {
          const config = await getConfig();
          const limit = config.spotify?.recentArtistsLimit || 20;
          traceApiEnd(traceContext, 200, { limit });
          return Response.json({ limit });
        } catch (error) {
          traceApiEnd(traceContext, 500, null, error);
          return Response.json({ error: "Failed to get recent artists limit" }, { status: 500 });
        }
      },
      POST: async (req: Request) => {
        const body = await req.json() as { limit?: number };
        const traceContext = traceApiStart('POST', '/api/spotify/recent-artists-limit', 'inbound', { limit: body.limit });
        try {
          const limit = body.limit;
          
          if (limit === undefined || limit < 1) {
            traceApiEnd(traceContext, 400, { error: "Limit must be a positive number" });
            return Response.json({ error: "Limit must be a positive number" }, { status: 400 });
          }
          
          const config = await getConfig();
          if (!config.spotify) {
            config.spotify = {};
          }
          config.spotify.recentArtistsLimit = limit;
          await setConfig(config);
          
          traceApiEnd(traceContext, 200, { success: true, limit });
          return Response.json({ success: true, limit });
        } catch (error) {
          traceApiEnd(traceContext, 500, null, error);
          return Response.json({ error: "Failed to set recent artists limit" }, { status: 500 });
        }
      },
    },
  };
}

