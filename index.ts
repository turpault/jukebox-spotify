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

function isDevMode(): boolean {
  // Check for NODE_ENV or if running with --watch flag
  return process.env.NODE_ENV === 'development' || 
         process.env.NODE_ENV !== 'production' ||
         process.argv.includes('--watch');
}

async function main() {
  try {
    const devMode = isDevMode();
    if (devMode) {
      console.log('Running in DEV mode - authentication window will be visible');
    }

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

    // Initialize app browser first (fullscreen) and navigate to show wait state
    console.log('Initializing app browser...');
    await renderer.initializeAppBrowser();
    await renderer.navigateToApp();
    console.log('App browser opened in fullscreen. Waiting state displayed.');

    // Check if we already have a valid token
    const existingToken = await renderer.getBearerToken();
    const needsAuth = !existingToken;

    if (needsAuth) {
      const authMode = devMode ? 'visible' : 'headless';
      console.log(`No valid token found. Starting authentication in ${authMode} browser...`);
      
      // Initialize auth browser (visible in dev mode, headless in production)
      await renderer.initializeAuthBrowser(devMode);
      
      // Perform authentication in headless browser
      const tokenData = await renderer.authenticateSpotify();
      
      if (!tokenData) {
        console.error('Authentication failed');
        await renderer.close();
        process.exit(1);
      }

      // Save token to file
      await renderer.saveTokens();
      
      // Close auth browser (no longer needed)
      if (renderer.getAuthPage()) {
        const authBrowser = (renderer as any).authBrowser;
        if (authBrowser) {
          await authBrowser.close();
          (renderer as any).authBrowser = null;
          (renderer as any).authPage = null;
        }
      }
      
      console.log('Authentication complete. App will automatically detect token.');
    } else {
      console.log('Valid token found. Skipping authentication.');
    }

    // Get and display bearer token
    const bearerToken = await renderer.getBearerToken();
    if (bearerToken) {
      console.log('\n=== Bearer Token Retrieved ===');
      console.log(`Token: ${bearerToken.substring(0, 20)}...${bearerToken.substring(bearerToken.length - 10)}`);
      console.log('==============================\n');
    } else {
      console.log('Warning: Could not retrieve bearer token');
    }

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
