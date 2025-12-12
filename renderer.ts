import puppeteer, { Browser, Page } from 'puppeteer';
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

let config: Config;
async function loadConfig() {
  try {
    const configText = await readFile('config.json', 'utf-8');
    config = JSON.parse(configText);
  } catch (e) {
    console.error('Failed to load config.json.');
    process.exit(1);
  }
}

interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export class PuppeteerRenderer {
  private authBrowser: Browser | null = null;
  private authPage: Page | null = null;
  private appBrowser: Browser | null = null;
  private appPage: Page | null = null;
  private tokenData: TokenData | null = null;

  async initializeAppBrowser(): Promise<void> {
    await loadConfig();
    
    console.log('Launching app browser in fullscreen...');
    this.appBrowser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: [
        '--start-fullscreen',
        '--start-maximized',
        '--disable-infobars',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    const pages = await this.appBrowser.pages();
    this.appPage = pages[0] || await this.appBrowser.newPage();
    
    // Get screen dimensions and set viewport to full screen
    const viewport = await this.appPage.evaluate(() => ({
      width: window.screen.width,
      height: window.screen.height
    }));
    await this.appPage.setViewport({ width: viewport.width, height: viewport.height });
    
    // Listen for console messages
    this.appPage.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      if (type === 'error') {
        console.error(`[App Browser] ${text}`);
      } else {
        console.log(`[App Browser] ${text}`);
      }
    });

    // Listen for page errors
    this.appPage.on('pageerror', error => {
      console.error(`[App Page Error] ${error.message}`);
    });
  }

  async initializeAuthBrowser(): Promise<void> {
    await loadConfig();
    
    console.log('Launching headless authentication browser...');
    this.authBrowser = await puppeteer.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled'
      ]
    });

    this.authPage = await this.authBrowser.newPage();
    
    // Listen for console messages
    this.authPage.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      if (type === 'error') {
        console.error(`[Auth Browser] ${text}`);
      } else {
        console.log(`[Auth Browser] ${text}`);
      }
    });
  }

  async authenticateSpotify(): Promise<TokenData | null> {
    if (!this.authPage) {
      throw new Error('Auth page not initialized. Call initializeAuthBrowser() first.');
    }

    console.log('Starting Spotify 3LO authentication in headless browser...');

    // Build the authorization URL
    const scope = 'streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state';
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.spotify.clientId,
      scope: scope,
      redirect_uri: config.spotify.redirectUri,
    });
    const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;

    console.log(`Navigating to Spotify authorization page...`);
    await this.authPage.goto(authUrl, { waitUntil: 'networkidle2' });

    // Wait for the login form to appear
    console.log('Waiting for login form...');
    let loginFormFound = false;
    try {
      await this.authPage.waitForSelector('input[type="text"], input[type="email"], input[id*="username"], input[name*="username"], input[type="password"]', { timeout: 10000 });
      loginFormFound = true;
    } catch (error) {
      console.log('Login form not found. User may already be logged in or page structure changed.');
    }

    // Automate login if credentials are provided
    if (loginFormFound && config.spotify.username && config.spotify.password) {
      console.log('Automating login with provided credentials...');
      try {
        // Find and fill username field
        const usernameSelectors = [
          'input[type="text"][id*="username"]',
          'input[type="email"][id*="username"]',
          'input[type="text"][name*="username"]',
          'input[type="email"][name*="username"]',
          'input[type="text"]',
          'input[type="email"]'
        ];
        
        let usernameFilled = false;
        for (const selector of usernameSelectors) {
          try {
            const usernameInput = await this.authPage.$(selector);
            if (usernameInput) {
              await usernameInput.click({ clickCount: 3 });
              await usernameInput.type(config.spotify.username!, { delay: 50 });
              usernameFilled = true;
              break;
            }
          } catch (e) {
            // Try next selector
          }
        }

        if (!usernameFilled) {
          console.log('Warning: Could not find username field.');
          return null;
        }

        // Find and fill password field
        const passwordSelectors = [
          'input[type="password"][id*="password"]',
          'input[type="password"][name*="password"]',
          'input[type="password"]'
        ];

        let passwordFilled = false;
        for (const selector of passwordSelectors) {
          try {
            const passwordInput = await this.authPage.$(selector);
            if (passwordInput) {
              await passwordInput.click({ clickCount: 3 });
              await passwordInput.type(config.spotify.password!, { delay: 50 });
              passwordFilled = true;
              break;
            }
          } catch (e) {
            // Try next selector
          }
        }

        if (!passwordFilled) {
          console.log('Warning: Could not find password field.');
          return null;
        }

        // Submit the form
        if (usernameFilled && passwordFilled) {
          console.log('Submitting login form...');
          // Try to find and click submit button
          const submitSelectors = [
            'button[type="submit"]',
            'button[id*="login"]',
            'button[type="button"]',
            'input[type="submit"]'
          ];

          let formSubmitted = false;
          for (const selector of submitSelectors) {
            try {
              const submitButton = await this.authPage.$(selector);
              if (submitButton) {
                await submitButton.click();
                formSubmitted = true;
                await this.authPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
                break;
              }
            } catch (e) {
              // Try next selector
            }
          }

          // If no submit button found, try pressing Enter
          if (!formSubmitted) {
            await this.authPage.keyboard.press('Enter');
            await this.authPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
          }

          console.log('Login form submitted. Waiting for next step...');
          
          // Wait a bit for navigation
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Check if we're on a consent/authorization screen
          const currentUrl = this.authPage.url();
          if (currentUrl.includes('accounts.spotify.com')) {
            // Might be on consent screen - try to find and click "Agree" or "Authorize" button
            try {
              await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for page to settle
              
              // Try to find buttons and check their text
              const buttons = await this.authPage.$$('button');
              for (const button of buttons) {
                try {
                  const text = await this.authPage.evaluate(el => el.textContent?.trim(), button);
                  if (text && (text.toLowerCase().includes('agree') || text.toLowerCase().includes('authorize') || text.toLowerCase().includes('ok'))) {
                    console.log(`Found consent button: "${text}", clicking...`);
                    await button.click();
                    await this.authPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
                    break;
                  }
                } catch (e) {
                  // Continue to next button
                }
              }
            } catch (e) {
              // Consent screen handling failed, continue
            }
          }
        }
      } catch (error) {
        console.error('Error during automated login:', error);
        return null;
      }
    } else if (loginFormFound) {
      console.error('No credentials provided in config. Cannot authenticate in headless mode.');
      return null;
    } else {
      console.log('Already logged in or authentication page structure changed.');
    }

    // Wait for redirect to callback URL
    console.log('Waiting for redirect to callback URL...');

    // Wait for the callback URL
    const callbackUrl = new URL(config.spotify.redirectUri);
    const callbackPath = callbackUrl.pathname;

    try {
      // Wait for navigation to callback URL
      await this.authPage.waitForFunction(
        (expectedPath) => {
          try {
            const url = new URL(window.location.href);
            return url.pathname === expectedPath;
          } catch {
            return false;
          }
        },
        { timeout: 300000 }, // 5 minute timeout
        callbackPath
      );

      const currentUrl = this.authPage.url();
      const url = new URL(currentUrl);
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        console.error(`Authentication error: ${error}`);
        return null;
      }

      if (!code) {
        console.error('No authorization code received');
        return null;
      }

      console.log('Authorization code received. Exchanging for token...');
      
      // Exchange code for token
      const tokenData = await this.exchangeCodeForToken(code);
      
      if (tokenData) {
        this.tokenData = tokenData;
        console.log('Authentication successful! Bearer token retrieved.');
        return tokenData;
      }

      return null;
    } catch (error) {
      console.error('Error during authentication:', error);
      return null;
    }
  }

  private async exchangeCodeForToken(code: string): Promise<TokenData | null> {
    const auth = Buffer.from(`${config.spotify.clientId}:${config.spotify.clientSecret}`).toString('base64');

    try {
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: config.spotify.redirectUri
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Token exchange error: ${response.status} - ${errorText}`);
        return null;
      }

      const data = await response.json();
      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in
      };
    } catch (error) {
      console.error('Error exchanging code for token:', error);
      return null;
    }
  }

  async navigateToApp(): Promise<void> {
    if (!this.appPage) {
      throw new Error('App page not initialized. Call initializeAppBrowser() first.');
    }

    console.log('Navigating to application...');
    await this.appPage.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  }

  async getBearerToken(): Promise<string | null> {
    if (this.tokenData) {
      return this.tokenData.access_token;
    }
    
    // Try to read from token file
    try {
      const { readFile } = await import('fs/promises');
      const tokenFileText = await readFile('.spotify_token.json', 'utf-8');
      const tokenFile = JSON.parse(tokenFileText);
      if (tokenFile.access_token && tokenFile.expires_at && Date.now() < tokenFile.expires_at) {
        return tokenFile.access_token;
      }
    } catch (error) {
      // Token file doesn't exist or is invalid
    }
    
    return null;
  }

  async saveTokens(): Promise<void> {
    if (!this.tokenData) {
      return;
    }

    const { writeFile } = await import('fs/promises');
    
    // Write token to file for server to read
    const tokenFile = {
      access_token: this.tokenData.access_token,
      expires_at: Date.now() + (this.tokenData.expires_in * 1000)
    };
    
    await writeFile('.spotify_token.json', JSON.stringify(tokenFile, null, 2));
    console.log('Access token saved to .spotify_token.json');
  }

  async close(): Promise<void> {
    if (this.authBrowser) {
      await this.authBrowser.close();
      this.authBrowser = null;
      this.authPage = null;
    }
    if (this.appBrowser) {
      await this.appBrowser.close();
      this.appBrowser = null;
      this.appPage = null;
    }
  }

  getAppPage(): Page | null {
    return this.appPage;
  }

  getAuthPage(): Page | null {
    return this.authPage;
  }
}
