# Configuration Sample

Create a file named `config.json` in the root of the project with the following structure:

```json
{
    "spotify": {
        "clientId": "YOUR_SPOTIFY_CLIENT_ID",
        "clientSecret": "YOUR_SPOTIFY_CLIENT_SECRET",
        "redirectUri": "http://localhost:3000/auth/callback",
        "connectDeviceName": "Jukebox",
        "username": "YOUR_SPOTIFY_USERNAME",
        "password": "YOUR_SPOTIFY_PASSWORD"
    },
    "tokens": {
        "refreshToken": ""
    }
}
```

## Fields

- **spotify.clientId**: Your Spotify App Client ID (from Developer Dashboard).
- **spotify.clientSecret**: Your Spotify App Client Secret.
- **spotify.redirectUri**: The callback URL for OAuth flow. Must match what is set in the Spotify Dashboard. Default is `http://localhost:3000/auth/callback`.
- **spotify.connectDeviceName**: The name this device will broadcast as via Spotify Connect.
- **spotify.username**: (Optional) Your Spotify username or email. If provided, the authentication process will automatically fill in the login form.
- **spotify.password**: (Optional) Your Spotify password. If provided along with username, the authentication process will automatically fill in and submit the login form.
- **tokens.refreshToken**: Initially leave empty string `""`. This will be automatically populated after the first login.

**Security Note**: The username and password are stored in plain text in the config file. Ensure `config.json` is in your `.gitignore` and not committed to version control.

