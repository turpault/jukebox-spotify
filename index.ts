import { PuppeteerRenderer } from './renderer';
import { spawn } from 'child_process';
import { readFile } from 'fs/promises';

interface Config {
  spotify: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    connectDeviceName: string;
    username?: string;
    password?: string;
  };
  tokens?: {
    refreshToken?: string;
    accessToken?: string;
  };
}

async function checkServerReady(maxAttempts = 30): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch('http://localhost:3000');
      if (response.ok) {
        return true;
      }
    } catch (error) {
      // Server not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return false;
}

async function startServer(): Promise<void> {
  console.log('Starting server...');
  const serverProcess = spawn('bun', ['server.ts'], {
    stdio: 'pipe',
    detached: false
  });

  // Pipe server output
  serverProcess.stdout?.on('data', (data) => {
    process.stdout.write(`[Server] ${data}`);
  });
  serverProcess.stderr?.on('data', (data) => {
    process.stderr.write(`[Server] ${data}`);
  });

  serverProcess.on('error', (error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });

  // Wait for server to be ready
  const ready = await checkServerReady();
  if (!ready) {
    console.error('Server failed to start within timeout');
    serverProcess.kill();
    process.exit(1);
  }
  console.log('Server is ready');
}

async function main() {
  try {
    // Load config to check if we need authentication
    let config: Config;
    try {
      const configText = await readFile('config.json', 'utf-8');
      config = JSON.parse(configText);
    } catch (e) {
      console.error('Failed to load config.json.');
      process.exit(1);
    }

    // Start the server
    await startServer();

    // Initialize Puppeteer renderer
    const renderer = new PuppeteerRenderer();
    await renderer.initialize();

    // Check if we already have a refresh token
    const needsAuth = !config.tokens?.refreshToken;

    if (needsAuth) {
      console.log('No refresh token found. Starting authentication flow...');
      const tokenData = await renderer.authenticateSpotify();
      
      if (!tokenData) {
        console.error('Authentication failed');
        await renderer.close();
        process.exit(1);
      }

      // Save tokens to config
      await renderer.saveTokens();
    } else {
      console.log('Refresh token found. Skipping authentication.');
      console.log('Bearer token will be retrieved via refresh token API.');
    }

    // Get and display bearer token
    const bearerToken = await renderer.getBearerToken();
    if (bearerToken) {
      console.log('\n=== Bearer Token Retrieved ===');
      console.log(`Token: ${bearerToken.substring(0, 20)}...${bearerToken.substring(bearerToken.length - 10)}`);
      console.log(`Full Token: ${bearerToken}`);
      console.log('==============================\n');
    } else {
      console.log('Warning: Could not retrieve bearer token');
    }

    // Navigate to the application
    await renderer.navigateToApp();

    console.log('Application is running. Browser window is open.');
    console.log('Press Ctrl+C to exit.');

    // Keep the process alive
    process.on('SIGINT', async () => {
      console.log('\nShutting down...');
      await renderer.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\nShutting down...');
      await renderer.close();
      process.exit(0);
    });

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
