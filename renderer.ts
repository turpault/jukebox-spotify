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
  tokens?: {
    refreshToken?: string;
    accessToken?: string;
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
  private browser: Browser | null = null;
  private page: Page | null = null;
  private tokenData: TokenData | null = null;

  async initialize(): Promise<void> {
    await loadConfig();
    
    console.log('Launching browser...');
    this.browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: [
        '--start-maximized',
        '--disable-infobars',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    const pages = await this.browser.pages();
    this.page = pages[0] || await this.browser.newPage();
    
    // Get screen dimensions and set viewport to full screen
    const viewport = await this.page.evaluate(() => ({
      width: window.screen.width,
      height: window.screen.height
    }));
    await this.page.setViewport({ width: viewport.width, height: viewport.height });
    
    // Listen for console messages
    this.page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      if (type === 'error') {
        console.error(`[Browser] ${text}`);
      } else {
        console.log(`[Browser] ${text}`);
      }
    });

    // Listen for page errors
    this.page.on('pageerror', error => {
      console.error(`[Page Error] ${error.message}`);
    });
  }

  async authenticateSpotify(): Promise<TokenData | null> {
    if (!this.page) {
      throw new Error('Page not initialized. Call initialize() first.');
    }

    console.log('Starting Spotify 3LO authentication...');

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
    await this.page.goto(authUrl, { waitUntil: 'networkidle2' });

    // Wait for the login form to appear
    console.log('Waiting for login form...');
    let loginFormFound = false;
    try {
      await this.page.waitForSelector('input[type="text"], input[type="email"], input[id*="username"], input[name*="username"], input[type="password"]', { timeout: 10000 });
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
            const usernameInput = await this.page.$(selector);
            if (usernameInput) {
              await usernameInput.click({ clickCount: 3 }); // Select all existing text
              await usernameInput.type(config.spotify.username, { delay: 50 });
              usernameFilled = true;
              break;
            }
          } catch (e) {
            // Try next selector
          }
        }

        if (!usernameFilled) {
          console.log('Warning: Could not find username field. Please enter manually.');
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
            const passwordInput = await this.page.$(selector);
            if (passwordInput) {
              await passwordInput.click({ clickCount: 3 });
              await passwordInput.type(config.spotify.password, { delay: 50 });
              passwordFilled = true;
              break;
            }
          } catch (e) {
            // Try next selector
          }
        }

        if (!passwordFilled) {
          console.log('Warning: Could not find password field. Please enter manually.');
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
              const submitButton = await this.page.$(selector);
              if (submitButton) {
                await submitButton.click();
                formSubmitted = true;
                await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
                break;
              }
            } catch (e) {
              // Try next selector
            }
          }

          // If no submit button found, try pressing Enter
          if (!formSubmitted) {
            await this.page.keyboard.press('Enter');
            await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
          }

          console.log('Login form submitted. Waiting for next step...');
          
          // Wait a bit for navigation
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Check if we're on a consent/authorization screen
          const currentUrl = this.page.url();
          if (currentUrl.includes('accounts.spotify.com')) {
            // Might be on consent screen - try to find and click "Agree" or "Authorize" button
            try {
              await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for page to settle
              
              // Try to find buttons and check their text
              const buttons = await this.page.$$('button');
              for (const button of buttons) {
                try {
                  const text = await this.page.evaluate(el => el.textContent?.trim(), button);
                  if (text && (text.toLowerCase().includes('agree') || text.toLowerCase().includes('authorize') || text.toLowerCase().includes('ok'))) {
                    console.log(`Found consent button: "${text}", clicking...`);
                    await button.click();
                    await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
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
        console.log('Please complete login manually in the browser...');
      }
    } else if (loginFormFound) {
      console.log('No credentials provided in config. Please complete the authentication manually in the browser...');
    } else {
      console.log('Already logged in or authentication page structure changed.');
    }

    // Wait for user to complete authentication (or continue if automated)
    console.log('Waiting for redirect to callback URL...');

    // Wait for the callback URL
    const callbackUrl = new URL(config.spotify.redirectUri);
    const callbackPath = callbackUrl.pathname;

    try {
      // Wait for navigation to callback URL
      // Check if current URL matches the callback path
      await this.page.waitForFunction(
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

      const currentUrl = this.page.url();
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
    if (!this.page) {
      throw new Error('Page not initialized. Call initialize() first.');
    }

    console.log('Navigating to application...');
    await this.page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  }

  async getBearerToken(): Promise<string | null> {
    if (this.tokenData) {
      return this.tokenData.access_token;
    }
    
    // If we have a refresh token in config, try to get token from API
    if (config.tokens?.refreshToken) {
      try {
        const response = await fetch('http://localhost:3000/api/token');
        if (response.ok) {
          const data = await response.json();
          if (data.token) {
            return data.token;
          }
        }
      } catch (error) {
        console.error('Error fetching token from API:', error);
      }
    }
    
    return null;
  }

  async saveTokens(): Promise<void> {
    if (!this.tokenData) {
      return;
    }

    const { writeFile } = await import('fs/promises');
    config.tokens = config.tokens || {};
    config.tokens.refreshToken = this.tokenData.refresh_token;
    config.tokens.accessToken = this.tokenData.access_token;
    
    await writeFile('config.json', JSON.stringify(config, null, 4));
    console.log('Tokens saved to config.json');
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  getPage(): Page | null {
    return this.page;
  }
}

