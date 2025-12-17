import { traceWebSocket, traceWebSocketConnection } from "./tracing";

// go-librespot WebSocket URL
const LIBRESPOT_WS_URL = "ws://localhost:3678/events";
// go-librespot REST API URL
const LIBRESPOT_API_URL = "http://localhost:3678";

// Current state from go-librespot
interface PlayerState {
  isPaused?: boolean;
  isActive?: boolean;
  currentTrack?: {
    context_uri?: string;
    uri?: string;
    name?: string;
    artist_names?: string[];
    album_name?: string;
    album_cover_url?: string;
    duration?: number;
  } | null;
  position?: number;
  volume?: number;
  volumeMax?: number;
  repeatContext?: boolean;
  repeatTrack?: boolean;
  shuffleContext?: boolean;
}

// Singleton service to manage go-librespot WebSocket connection
class LibrespotStateService {
  private librespotWs: WebSocket | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private keepaliveInterval: ReturnType<typeof setInterval> | null = null;
  private positionInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts: number = 0;
  private currentState: PlayerState = {};
  private stateVersion: number = 0; // Increment on each state change
  private pendingPollers: Set<{
    resolve: (value: { state: PlayerState; version: number }) => void;
    lastVersion: number;
  }> = new Set();
  private maxReconnectDelay: number = 30000; // 30 seconds max delay
  private initialReconnectDelay: number = 1000; // Start with 1 second
  private keepaliveIntervalMs: number = 30000; // Check connection every 30 seconds
  private positionIntervalMs: number = 100; // Increment position every 100ms

  constructor() {
    this.connect();
    this.startKeepalive();
    // Start position increment interval (runs continuously, checks state internally)
    this.startPositionIncrement();
    // Query initial state from REST API
    this.queryInitialState();
  }

  private connect() {
    // Clear any existing reconnection timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Close existing connection if any
    if (this.librespotWs) {
      try {
        this.librespotWs.onclose = null;
        this.librespotWs.onerror = null;
        this.librespotWs.onmessage = null;
        this.librespotWs.onopen = null;
        if (
          this.librespotWs.readyState === WebSocket.OPEN ||
          this.librespotWs.readyState === WebSocket.CONNECTING
        ) {
          this.librespotWs.close();
        }
      } catch (e) {
        // Ignore errors when closing
      }
      this.librespotWs = null;
    }

    try {
      traceWebSocket("Connecting to go-librespot", "outbound", {
        url: LIBRESPOT_WS_URL,
        attempt: this.reconnectAttempts + 1,
      });
      const librespotWs = new WebSocket(LIBRESPOT_WS_URL);
      this.librespotWs = librespotWs;

      librespotWs.onopen = () => {
        traceWebSocketConnection("open", "outbound", {
          librespotConnected: true,
        });
        console.log("Connected to go-librespot WebSocket");
        this.reconnectAttempts = 0; // Reset on successful connection
      };

      // Handle messages from go-librespot
      librespotWs.onmessage = (event: MessageEvent) => {
        try {
          const message = JSON.parse(event.data);
          traceWebSocket("Message from go-librespot", "inbound", message);
          this.handleMessage(message);
        } catch (error) {
          traceWebSocket(
            "Error parsing message from go-librespot",
            "inbound",
            null,
            error
          );
          console.error("Error parsing message from go-librespot:", error);
        }
      };

      // Handle errors - try to reconnect
      librespotWs.onerror = (error: Event) => {
        traceWebSocket("go-librespot WebSocket error", "outbound", null, error);
        console.error("go-librespot WebSocket error:", error);
      };

      librespotWs.onclose = (event: CloseEvent) => {
        traceWebSocketConnection("close", "outbound", {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        });
        console.log("Disconnected from go-librespot WebSocket, will reconnect...");
        this.stopKeepalive();
        this.stopPositionIncrement();

        // Try to reconnect
        const delay = Math.min(
          this.initialReconnectDelay * Math.pow(2, this.reconnectAttempts),
          this.maxReconnectDelay
        );
        this.reconnectAttempts++;

        traceWebSocket("Scheduling reconnect to go-librespot", "outbound", {
          delayMs: delay,
          attempt: this.reconnectAttempts,
        });

        this.reconnectTimeout = setTimeout(() => {
          this.connect();
        }, delay);
      };
    } catch (error) {
      traceWebSocket(
        "Failed to create go-librespot WebSocket connection",
        "outbound",
        null,
        error
      );
      console.error("Failed to create go-librespot WebSocket connection:", error);

      // Schedule reconnect
      const delay = Math.min(
        this.initialReconnectDelay * Math.pow(2, this.reconnectAttempts),
        this.maxReconnectDelay
      );
      this.reconnectAttempts++;

      this.reconnectTimeout = setTimeout(() => {
        this.connect();
      }, delay);
    }
  }

  private handleMessage(message: any) {
    // Handle nested structure: { type: "...", data: {...} }
    const eventData = message.type && message.data
      ? { ...message.data, type: message.type }
      : message;

    const type = eventData.type;
    if (!type) return;

    // Update state based on event type
    switch (type) {
      case "active":
        this.currentState.isActive = true;
        this.notifyStateChange();
        break;
      case "inactive":
        this.currentState.isActive = false;
        this.notifyStateChange();
        break;
      case "metadata":
        this.currentState.currentTrack = {
          context_uri: eventData.context_uri,
          uri: eventData.uri,
          name: eventData.name,
          artist_names: eventData.artist_names,
          album_name: eventData.album_name,
          album_cover_url: eventData.album_cover_url,
          duration: eventData.duration,
        };
        this.notifyStateChange();
        break;
      case "will_play":
        this.currentState.position = 0;
        this.notifyStateChange();
        break;
      case "playing":
        this.currentState.isPaused = false;
        this.currentState.isActive = true;
        // Ensure position is initialized
        if (this.currentState.position === undefined) {
          this.currentState.position = 0;
        }
        this.notifyStateChange();
        break;
      case "paused":
        this.currentState.isPaused = true;
        this.notifyStateChange();
        break;
      case "not_playing":
        this.currentState.isPaused = true;
        this.currentState.isActive = false;
        this.currentState.position = 0;
        this.notifyStateChange();
        break;
      case "stopped":
        this.currentState.isActive = false;
        this.currentState.currentTrack = null;
        this.currentState.position = 0;
        this.notifyStateChange();
        break;
      case "seek":
        // Only update position on seek events (when user seeks or position changes)
        if (eventData.position !== undefined) {
          this.currentState.position = eventData.position;
          // If currently playing, the interval will continue incrementing from the new position
          // If paused/stopped, position is set but interval won't run
          this.notifyStateChange();
        }
        break;
      case "volume":
        this.currentState.volume = eventData.value || 0;
        this.currentState.volumeMax = eventData.max || this.currentState.volumeMax;
        this.notifyStateChange();
        break;
      case "repeat_context":
        this.currentState.repeatContext = eventData.value === true;
        this.notifyStateChange();
        break;
      case "repeat_track":
        this.currentState.repeatTrack = eventData.value === true;
        this.notifyStateChange();
        break;
      case "shuffle_context":
        this.currentState.shuffleContext = eventData.value === true;
        this.notifyStateChange();
        break;
    }
  }

  private notifyStateChange() {
    this.stateVersion++;
    // Resolve all pending pollers
    const pollers = Array.from(this.pendingPollers);
    this.pendingPollers.clear();

    // Only include position in state if it's been set (from seek event)
    // Don't send stale position values
    const stateToSend: PlayerState = { ...this.currentState };

    for (const poller of pollers) {
      poller.resolve({
        state: stateToSend,
        version: this.stateVersion,
      });
    }
    if (this.currentState.position === undefined) {
      delete this.currentState.position;
    }
  }

  // Get current state (immediate)
  getState(): { state: PlayerState; version: number } {
    // Only include position if it's been set (from seek event)
    // Duration is track info and should always be included if set
    const stateToSend: PlayerState = { ...this.currentState };
    if (stateToSend.position === undefined) {
      delete stateToSend.position;
    }
    return {
      state: stateToSend,
      version: this.stateVersion,
    };
  }

  // Long polling: wait for state change or timeout
  async pollState(
    lastVersion: number,
    timeout: number = 30000
  ): Promise<{ state: PlayerState; version: number }> {
    // If state has changed since lastVersion, return immediately
    if (this.stateVersion > lastVersion) {
      return {
        state: { ...this.currentState },
        version: this.stateVersion,
      };
    }

    // Otherwise, wait for state change
    return new Promise((resolve) => {
      const poller = {
        resolve,
        lastVersion,
      };
      this.pendingPollers.add(poller);

      // Timeout after specified time
      setTimeout(() => {
        if (this.pendingPollers.has(poller)) {
          this.pendingPollers.delete(poller);
          resolve({
            state: { ...this.currentState },
            version: this.stateVersion,
          });
        }
      }, timeout);
    });
  }

  // Check if connected to go-librespot
  isConnected(): boolean {
    return (
      this.librespotWs !== null &&
      this.librespotWs.readyState === WebSocket.OPEN
    );
  }

  // Ensure connection is established (reconnect if not connected)
  ensureConnected(): void {
    if (!this.isConnected()) {
      console.log("Connection to go-librespot lost, reconnecting...");
      this.connect();
    }
  }

  // Start keepalive mechanism to ensure connection stays alive
  private startKeepalive(): void {
    this.stopKeepalive(); // Clear any existing interval

    this.keepaliveInterval = setInterval(() => {
      if (!this.isConnected()) {
        console.log("Keepalive check: Connection lost, reconnecting...");
        this.connect();
      }
    }, this.keepaliveIntervalMs);
  }

  // Stop keepalive mechanism
  private stopKeepalive(): void {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = null;
    }
  }

  // Start position increment interval (runs continuously, checks playback state internally)
  private startPositionIncrement(): void {
    // Only start if not already running
    if (this.positionInterval !== null) {
      return;
    }

    this.positionInterval = setInterval(() => {
      // Only increment if currently playing (not paused and active)
      if (
        this.currentState.isPaused === false &&
        this.currentState.isActive === true &&
        this.currentState.position !== undefined
      ) {
        this.currentState.position = this.currentState.position + this.positionIntervalMs;
        // Notify state change to update any waiting pollers
        this.notifyStateChange();
      }
      // If not playing, simply don't increment (timer keeps running)
    }, this.positionIntervalMs);
  }

  // Stop position increment interval
  private stopPositionIncrement(): void {
    if (this.positionInterval) {
      clearInterval(this.positionInterval);
      this.positionInterval = null;
    }
  }

  // Query initial state from go-librespot REST API
  private async queryInitialState(): Promise<void> {
    try {
      const response = await fetch(`${LIBRESPOT_API_URL}/status`);
      if (!response.ok) {
        console.log("Failed to fetch initial state from go-librespot:", response.status);
        return;
      }

      const status = await response.json();

      // Map REST API response to PlayerState format
      if (status.track) {
        this.currentState.currentTrack = {
          context_uri: status.track.context_uri,
          uri: status.track.uri,
          name: status.track.name,
          artist_names: status.track.artist_names || [],
          album_name: status.track.album_name,
          album_cover_url: status.track.album_cover_url,
          duration: status.track.duration,
        };
      } else {
        this.currentState.currentTrack = null;
      }

      this.currentState.isPaused = status.paused === true;
      this.currentState.isActive = !status.stopped && status.track !== null && status.track !== undefined;

      // Only set position if it's provided and non-zero (from seek event)
      if (status.position !== undefined && status.position > 0) {
        this.currentState.position = status.position;
      }

      if (status.volume !== undefined) {
        this.currentState.volume = status.volume;
      }
      if (status.volume_steps !== undefined) {
        this.currentState.volumeMax = status.volume_steps;
      }
      if (status.repeat_context !== undefined) {
        this.currentState.repeatContext = status.repeat_context === true;
      }
      if (status.repeat_track !== undefined) {
        this.currentState.repeatTrack = status.repeat_track === true;
      }
      if (status.shuffle_context !== undefined) {
        this.currentState.shuffleContext = status.shuffle_context === true;
      }

      // Ensure position is initialized if playing
      if (
        this.currentState.isPaused === false &&
        this.currentState.isActive === true &&
        this.currentState.position === undefined
      ) {
        this.currentState.position = 0;
      }

      // Notify state change to update any waiting pollers
      this.notifyStateChange();
      console.log("Initial state loaded from go-librespot REST API");
    } catch (error) {
      console.log("Failed to query initial state from go-librespot:", error);
      // Don't throw - this is best effort, WebSocket will provide updates
    }
  }
}

// Export singleton instance
export const librespotStateService = new LibrespotStateService();

