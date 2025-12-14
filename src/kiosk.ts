// Bun is a global object, no need to import

export const isKioskMode = process.env.KIOSK === "1" || process.env.KIOSK === "true";

// Function to check if Chrome is already running
export async function isChromeRunning(): Promise<boolean> {
  const platform = process.platform;
  
  try {
    if (platform === "darwin") {
      // macOS: Check for Chrome processes
      const proc = Bun.spawn(["pgrep", "-f", "Google Chrome"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const exitCode = await proc.exited;
      return exitCode === 0;
    } else if (platform === "win32") {
      // Windows: Check for chrome.exe processes
      const proc = Bun.spawn(["tasklist", "/FI", "IMAGENAME eq chrome.exe"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const exitCode = await proc.exited;
      if (exitCode !== 0) return false;
      const output = await new Response(proc.stdout).text();
      return output.includes("chrome.exe");
    } else {
      // Linux: Check for chrome/chromium processes
      const proc = Bun.spawn(["pgrep", "-f", "chrome|chromium"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const exitCode = await proc.exited;
      return exitCode === 0;
    }
  } catch (error) {
    // If check fails, assume Chrome is not running to be safe
    return false;
  }
}

// Function to launch Chrome in kiosk mode
export async function launchChromeKiosk() {
  // Check if Chrome is already running
  const chromeRunning = await isChromeRunning();
  if (chromeRunning) {
    console.log("Chrome is already running, skipping launch");
    return;
  }

  const url = "http://localhost:3000";
  const platform = process.platform;
  
  // Chrome kiosk mode flags
  const chromeFlags = [
    "--kiosk",
    `--app=${url}`,
    "--disable-infobars",
    "--no-first-run",
    "--disable-session-crashed-bubble",
    "--disable-restore-session-state",
    "--disable-features=TranslateUI",
    "--disable-pinch",
    "--overscroll-history-navigation=0",
    "--disable-extensions",
    "--disable-default-apps",
  ];

  try {
    let command: string;
    let args: string[];

    if (platform === "darwin") {
      // macOS
      command = "open";
      args = ["-a", "Google Chrome", "--args", ...chromeFlags];
    } else if (platform === "win32") {
      // Windows
      const chromePaths = [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        (process.env.LOCALAPPDATA || "") + "\\Google\\Chrome\\Application\\chrome.exe",
      ];
      
      // Try to find Chrome by checking if file exists
      let chromePath: string | undefined;
      for (const path of chromePaths) {
        try {
          const file = Bun.file(path);
          if (await file.exists()) {
            chromePath = path;
            break;
          }
        } catch {
          continue;
        }
      }

      if (!chromePath) {
        // Fallback: try to find Chrome in PATH
        command = "chrome";
        args = chromeFlags;
      } else {
        command = chromePath;
        args = chromeFlags;
      }
    } else {
      // Linux - try common Chrome/Chromium commands
      command = "google-chrome"; // Default
      args = chromeFlags;
      
      // Common Linux Chrome/Chromium paths (will try in order when spawning)
      const chromePaths = [
        "google-chrome",
        "chromium-browser",
        "chromium",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium-browser",
        "/usr/bin/chromium",
      ];
      
      // Use first available (spawn will fail if not found, which is handled)
      command = chromePaths[0];
    }

    console.log(`Launching Chrome in kiosk mode: ${command} ${args.join(" ")}`);
    
    const child = Bun.spawn([command, ...args], {
      detached: true,
      stdio: ["ignore", "ignore", "ignore"],
    });
    
    child.unref(); // Allow parent process to exit independently
    
    // Give Chrome a moment to start
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log("Chrome launched in kiosk mode");
  } catch (error) {
    console.error("Failed to launch Chrome:", error);
    console.log("Please manually open Chrome and navigate to:", url);
  }
}

