import express from 'express';
import open from 'open';
import fetch from 'node-fetch';
import { readFile, writeFile } from 'fs/promises';
import { URL } from 'url';

// === Load config from JSON file ===
const CONFIG_PATH = './config.json';

let CLIENT_ID;
let CLIENT_SECRET;
let REDIRECT_URI;

async function loadConfig() {
  const configData = await readFile(CONFIG_PATH, 'utf-8');
  const config = JSON.parse(configData);
  CLIENT_ID = config.clientId;
  CLIENT_SECRET = config.clientSecret;
  REDIRECT_URI = config.redirectUri;
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    throw new Error('Missing clientId, clientSecret, or redirectUri in config.json');
  }
}

// === Spotify API base URL ===
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

// === OAuth scopes needed ===
const SCOPES = [
  'playlist-modify-private',
  'playlist-modify-public',
  'user-read-private'
].join(' ');

// === Token storage file ===
const TOKEN_PATH = './spotify_tokens.json';

// === Utility functions ===

async function saveTokens(tokens) {
  await writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2), 'utf-8');
}

async function loadTokens() {
  try {
    const data = await readFile(TOKEN_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function getTokensFromCode(code) {
  const url = 'https://accounts.spotify.com/api/token';
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(`Failed to get tokens: ${JSON.stringify(error)}`);
  }

  return res.json();
}

async function refreshAccessToken(refreshToken) {
  const url = 'https://accounts.spotify.com/api/token';
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(`Failed to refresh token: ${JSON.stringify(error)}`);
  }

  return res.json();
}

async function loadJson(filePath) {
  const data = await readFile(filePath, 'utf-8');
  return JSON.parse(data);
}

function extractTrackId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'open.spotify.com') return null;
    const parts = parsed.pathname.split('/');
    if (parts.length >= 3 && parts[1] === 'track') {
      return parts[2].split('?')[0];
    }
    return null;
  } catch {
    return null;
  }
}

async function searchTrack(query, accessToken) {
  const url = new URL(`${SPOTIFY_API_BASE}/search`);
  url.searchParams.set('q', query);
  url.searchParams.set('type', 'track');
  url.searchParams.set('limit', '1');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(`Spotify search failed: ${JSON.stringify(error)}`);
  }

  const data = await res.json();
  if (data.tracks.items.length === 0) {
    console.warn(`No results found for search query: "${query}"`);
    return null;
  }

  return data.tracks.items[0].id;
}

async function createPlaylist(userId, playlistName, accessToken) {
  const url = `${SPOTIFY_API_BASE}/users/${userId}/playlists`;
  const body = {
    name: playlistName,
    description: 'Created via API',
    public: false
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(`Failed to create playlist: ${JSON.stringify(error)}`);
  }

  const data = await res.json();
  return data.id;
}

async function addTracksToPlaylist(playlistId, trackIds, accessToken) {
  const url = `${SPOTIFY_API_BASE}/playlists/${playlistId}/tracks`;
  const chunkSize = 100;

  for (let i = 0; i < trackIds.length; i += chunkSize) {
    const chunk = trackIds.slice(i, i + chunkSize);
    const uris = chunk.map(id => `spotify:track:${id}`);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ uris })
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(`Failed to add tracks: ${JSON.stringify(error)}`);
    }
  }
}

async function getCurrentUserId(accessToken) {
  const url = `${SPOTIFY_API_BASE}/me`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(`Failed to get user profile: ${JSON.stringify(error)}`);
  }

  const data = await res.json();
  return data.id;
}

async function getAuthorizationCode() {
  return new Promise((resolve, reject) => {
    const app = express();

    const server = app.listen(new URL(REDIRECT_URI).port || 8888, () => {
      console.log(`Listening on ${REDIRECT_URI} for Spotify authorization...`);
    });

    app.get(new URL(REDIRECT_URI).pathname, async (req, res) => {
      const error = req.query.error;
      const code = req.query.code;

      if (error) {
        res.send('Authorization failed: ' + error);
        server.close();
        return reject(new Error('Authorization failed: ' + error));
      }

      if (!code) {
        res.send('No code found in query');
        server.close();
        return reject(new Error('No code found in query'));
      }

      res.send('Authorization successful! You can close this tab.');
      server.close();
      resolve(code);
    });

    // Construct authorization URL
    const authUrl = new URL('https://accounts.spotify.com/authorize');
    authUrl.searchParams.set('client_id', CLIENT_ID);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('scope', SCOPES);
    authUrl.searchParams.set('show_dialog', 'true');

    open(authUrl.toString()).catch(() => {
      console.log('Please open this URL manually in your browser:', authUrl.toString());
    });
  });
}

async function authorize() {
  let tokens = await loadTokens();

  if (tokens) {
    if (Date.now() > tokens.expires_at) {
      console.log('Access token expired, refreshing...');
      const refreshed = await refreshAccessToken(tokens.refresh_token);
      tokens.access_token = refreshed.access_token;
      if (refreshed.refresh_token) tokens.refresh_token = refreshed.refresh_token;
      tokens.expires_at = Date.now() + (refreshed.expires_in * 1000);
      await saveTokens(tokens);
    }
    return tokens;
  }

  const code = await getAuthorizationCode();
  const tokenResponse = await getTokensFromCode(code);
  tokens = {
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token,
    expires_at: Date.now() + (tokenResponse.expires_in * 1000)
  };
  await saveTokens(tokens);
  return tokens;
}

async function main() {
  try {
    await loadConfig();

    const jsonFilePath = process.argv[2];
    if (!jsonFilePath) {
      console.error('Usage: node index.js <playlist-json-file>');
      process.exit(1);
    }

    const playlistData = await loadJson(jsonFilePath);
    const { playlistName, tracks } = playlistData;

    if (!playlistName || !Array.isArray(tracks)) {
      throw new Error('Invalid JSON format: must contain playlistName and tracks array');
    }

    const tokens = await authorize();

    // Process tracks: for each entry, determine if URL or search string
    const trackIds = [];
    for (const entry of tracks) {
      const idFromUrl = extractTrackId(entry);
      if (idFromUrl) {
        trackIds.push(idFromUrl);
      } else {
        // Search Spotify for the string
        const foundId = await searchTrack(entry, tokens.access_token);
        if (foundId) {
          trackIds.push(foundId);
        } else {
          console.warn(`Skipping track: "${entry}" (no search results)`);
        }
      }
    }

    if (trackIds.length === 0) {
      throw new Error('No valid tracks found to add to playlist');
    }

    const userId = await getCurrentUserId(tokens.access_token);
    const playlistId = await createPlaylist(userId, playlistName, tokens.access_token);
    console.log(`Created playlist "${playlistName}" with ID: ${playlistId}`);

    await addTracksToPlaylist(playlistId, trackIds, tokens.access_token);
    console.log(`Added ${trackIds.length} tracks to playlist.`);

  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();