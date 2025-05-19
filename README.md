# Spotify Playlist Creator

A Node.js script that creates a Spotify playlist from a JSON file containing track entries.  
Tracks can be specified either as Spotify track URLs or as search strings. The script uses the Spotify Web API with OAuth Authorization Code Flow to authenticate and manage playlists.

---

## Features

- OAuth 2.0 Authorization Code Flow with automatic browser login and token refresh
- Reads Spotify credentials from a separate `config.json` file (not included in repo)
- Accepts a JSON file specifying playlist name and tracks (URLs or search queries)
- Searches Spotify for tracks when URLs are not provided
- Creates a private playlist in the authenticated user's account
- Adds all identified tracks to the new playlist

---

## Prerequisites

- Node.js 16 or later
- Spotify Developer account and registered app with:
  - Client ID
  - Client Secret
  - Redirect URI (e.g., `http://localhost:3000/callback`)
- [GitHub CLI](https://cli.github.com/) (optional, for repo creation)

---

## Setup

1. Clone the repository:
   git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   cd YOUR_REPO_NAME

2. Install dependencies:
npm install


3. Create a config.json file in the project root with your Spotify app credentials:

{
  "clientId": "YOUR_CLIENT_ID",
  "clientSecret": "YOUR_CLIENT_SECRET",
  "redirectUri": "http://localhost:8888/callback"
}

4. Prepare a playlist JSON file (e.g., playlist.json) with this format:
{
  "playlistName": "My Playlist",
  "tracks": [
    "https://open.spotify.com/track/3ZOEW8dLZk7fRZ9kJ0z7qE",
    "Blind Guardian Mirror Mirror",
    "Helloween Eagle Fly Free"
  ]
}

5. Usage

Run the script with the playlist JSON file as an argument:

node index.js playlist.json

The script will:

    Open your browser for Spotify login and consent (first run)
    Create a new private playlist with the specified name
    Add all tracks (URLs or search results) to the playlist

Notes

    config.json is excluded from the repository for security.
    Tokens are saved in spotify_tokens.json for reuse and automatic refresh.
    The playlist is created as private by default.
    Spotify API rate limits and search results may affect behavior.