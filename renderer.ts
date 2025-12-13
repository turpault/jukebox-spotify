import puppeteer, { Browser, Page } from 'puppeteer';

export class PuppeteerRenderer {
  private appBrowser: Browser | null = null;
  private appPage: Page | null = null;

  async initializeAppBrowser(): Promise<void> {
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
    const viewport = await this.appPage.evaluate(() => {
      const w = (globalThis as any).window || (globalThis as any);
      return {
        width: w.screen?.width || 1920,
        height: w.screen?.height || 1080
      };
    });
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

  async navigateToApp(): Promise<void> {
    if (!this.appPage) {
      throw new Error('App page not initialized. Call initializeAppBrowser() first.');
    }

    console.log('Navigating to application...');
    await this.appPage.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  }

  async close(): Promise<void> {
    if (this.appBrowser) {
      await this.appBrowser.close();
      this.appBrowser = null;
      this.appPage = null;
    }
  }

  getAppPage(): Page | null {
    return this.appPage;
  }
}
