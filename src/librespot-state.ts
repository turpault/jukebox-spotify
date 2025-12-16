import { traceWebSocket, traceWebSocketConnection } from "./tracing";

// go-librespot WebSocket URL
const LIBRESPOT_WS_URL = "ws://localhost:3678/events";

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
    position?: number;
    duration?: number;
  } | null;
  position?: number;
  duration?: number;
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

  constructor() {
    this.connect();
    this.startKeepalive();
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
        this.startKeepalive(); // Ensure keepalive is running
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
          position: eventData.position,
          duration: eventData.duration,
        };
        this.currentState.position = eventData.position || 0;
        this.currentState.duration = eventData.duration || 0;
        this.notifyStateChange();
        break;
      case "playing":
        this.currentState.isPaused = false;
        this.currentState.isActive = true;
        this.notifyStateChange();
        break;
      case "paused":
        this.currentState.isPaused = true;
        this.notifyStateChange();
        break;
      case "not_playing":
        this.currentState.isPaused = true;
        this.currentState.isActive = false;
        this.notifyStateChange();
        break;
      case "stopped":
        this.currentState.isActive = false;
        this.currentState.currentTrack = null;
        this.notifyStateChange();
        break;
      case "seek":
        this.currentState.position = eventData.position || 0;
        this.currentState.duration = eventData.duration || 0;
        this.notifyStateChange();
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
    for (const poller of pollers) {
      poller.resolve({
        state: { ...this.currentState },
        version: this.stateVersion,
      });
    }
  }

  // Get current state (immediate)
  getState(): { state: PlayerState; version: number } {
    return {
      state: { ...this.currentState },
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
}

// Export singleton instance
export const librespotStateService = new LibrespotStateService();

