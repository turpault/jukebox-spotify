import { readFile, writeFile } from "fs/promises";
import { createHash } from "crypto";

// Configuration file
export const CONFIG_FILE = "config.json";

export interface Config {
  theme?: string;
  view?: string;
  hotkeys?: {
    keyboard?: {
      playPause?: string;
      next?: string;
      previous?: string;
      volumeUp?: string;
      volumeDown?: string;
      seekForward?: string;
      seekBackward?: string;
      shuffle?: string;
      repeat?: string;
    };
    gamepad?: {
      playPause?: number;
      next?: number;
      previous?: number;
      volumeUp?: number;
      volumeDown?: number;
      shuffle?: number;
      repeat?: number;
    };
    volumeStep?: number;
    seekStep?: number;
  };
  spotify?: {
    clientId?: string;
    clientSecret?: string;
    configuredSpotifyIds?: string[];
    recentlyPlayedArtists?: string[];
    recentArtistsLimit?: number;
  };
}

// Get configuration version hash
export async function getConfigVersion(): Promise<string> {
  try {
    const hash = createHash('md5');
    
    // Hash config file (which now contains theme, hotkeys, and spotify config)
    try {
      const configData = await readFile(CONFIG_FILE, "utf-8");
      hash.update(configData);
    } catch {
      // File doesn't exist, use default
      hash.update('{}');
    }
    
    return hash.digest('hex');
  } catch (error) {
    // Fallback to timestamp if hashing fails
    return Date.now().toString();
  }
}

export async function getConfig(): Promise<Config> {
  try {
    const data = await readFile(CONFIG_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

export async function setConfig(config: Config): Promise<void> {
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

