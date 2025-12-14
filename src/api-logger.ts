// SQLite database module for API logging

import { Database } from "bun:sqlite";

interface ApiLogEntry {
  id?: number;
  timestamp: string;
  traceId: string;
  level: 'info' | 'error' | 'warn';
  message: string;
  method?: string;
  path?: string;
  direction?: 'inbound' | 'outbound';
  type?: 'api' | 'websocket';
  durationMs?: number;
  statusCode?: number;
  error?: string;
  requestBody?: string;
  responseBody?: string;
  data?: string;
}

let db: Database | null = null;

// Initialize the database
function initDatabase(): Database {
  if (db) {
    return db;
  }

  db = new Database("api_logs.db");
  
  // Create the api_logs table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      traceId TEXT NOT NULL,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      method TEXT,
      path TEXT,
      direction TEXT,
      type TEXT,
      durationMs INTEGER,
      statusCode INTEGER,
      error TEXT,
      requestBody TEXT,
      responseBody TEXT,
      data TEXT
    )
  `);

  // Create indexes for better query performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_timestamp ON api_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_traceId ON api_logs(traceId);
    CREATE INDEX IF NOT EXISTS idx_path ON api_logs(path);
    CREATE INDEX IF NOT EXISTS idx_level ON api_logs(level);
    CREATE INDEX IF NOT EXISTS idx_type ON api_logs(type);
  `);

  return db;
}

// Log an API call to the database
export function logApiCall(entry: ApiLogEntry): void {
  try {
    const database = initDatabase();
    
    const stmt = database.prepare(`
      INSERT INTO api_logs (
        timestamp, traceId, level, message, method, path, direction, type,
        durationMs, statusCode, error, requestBody, responseBody, data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      entry.timestamp,
      entry.traceId,
      entry.level,
      entry.message,
      entry.method || null,
      entry.path || null,
      entry.direction || null,
      entry.type || null,
      entry.durationMs || null,
      entry.statusCode || null,
      entry.error || null,
      entry.requestBody || null,
      entry.responseBody || null,
      entry.data ? (typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data)) : null
    );
  } catch (error) {
    // Silently fail - don't break the application if logging fails
    // Only log to console if LOG_API is set (to avoid circular logging)
    if (process.env.LOG_API) {
      console.error('Failed to log API call to database:', error);
    }
  }
}

// Get API statistics
export interface ApiStats {
  totalCalls: number;
  totalErrors: number;
  averageDuration: number;
  callsByMethod: Record<string, number>;
  callsByPath: Record<string, number>;
  callsByStatus: Record<number, number>;
  recentErrors: ApiLogEntry[];
  callsLast24h: number;
  callsLastHour: number;
}

export function getApiStats(): ApiStats {
  try {
    const database = initDatabase();
    
    // Total calls
    const totalCalls = database.prepare('SELECT COUNT(*) as count FROM api_logs').get() as { count: number };
    
    // Total errors
    const totalErrors = database.prepare("SELECT COUNT(*) as count FROM api_logs WHERE level = 'error'").get() as { count: number };
    
    // Average duration
    const avgDuration = database.prepare('SELECT AVG(durationMs) as avg FROM api_logs WHERE durationMs IS NOT NULL').get() as { avg: number | null };
    
    // Calls by method
    const callsByMethodRows = database.prepare(`
      SELECT method, COUNT(*) as count 
      FROM api_logs 
      WHERE method IS NOT NULL 
      GROUP BY method 
      ORDER BY count DESC
    `).all() as Array<{ method: string; count: number }>;
    const callsByMethod: Record<string, number> = {};
    callsByMethodRows.forEach(row => {
      callsByMethod[row.method] = row.count;
    });
    
    // Calls by path (top 20)
    const callsByPathRows = database.prepare(`
      SELECT path, COUNT(*) as count 
      FROM api_logs 
      WHERE path IS NOT NULL 
      GROUP BY path 
      ORDER BY count DESC 
      LIMIT 20
    `).all() as Array<{ path: string; count: number }>;
    const callsByPath: Record<string, number> = {};
    callsByPathRows.forEach(row => {
      callsByPath[row.path] = row.count;
    });
    
    // Calls by status code
    const callsByStatusRows = database.prepare(`
      SELECT statusCode, COUNT(*) as count 
      FROM api_logs 
      WHERE statusCode IS NOT NULL 
      GROUP BY statusCode 
      ORDER BY count DESC
    `).all() as Array<{ statusCode: number; count: number }>;
    const callsByStatus: Record<number, number> = {};
    callsByStatusRows.forEach(row => {
      callsByStatus[row.statusCode] = row.count;
    });
    
    // Recent errors (last 10)
    const recentErrorsRows = database.prepare(`
      SELECT * FROM api_logs 
      WHERE level = 'error' 
      ORDER BY timestamp DESC 
      LIMIT 10
    `).all() as ApiLogEntry[];
    
    // Calls in last 24 hours
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const callsLast24h = database.prepare(`
      SELECT COUNT(*) as count 
      FROM api_logs 
      WHERE timestamp >= ?
    `).get(last24h) as { count: number };
    
    // Calls in last hour
    const lastHour = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const callsLastHour = database.prepare(`
      SELECT COUNT(*) as count 
      FROM api_logs 
      WHERE timestamp >= ?
    `).get(lastHour) as { count: number };
    
    return {
      totalCalls: totalCalls.count,
      totalErrors: totalErrors.count,
      averageDuration: avgDuration.avg ? Math.round(avgDuration.avg) : 0,
      callsByMethod,
      callsByPath,
      callsByStatus,
      recentErrors: recentErrorsRows,
      callsLast24h: callsLast24h.count,
      callsLastHour: callsLastHour.count,
    };
  } catch (error) {
    console.error('Failed to get API stats:', error);
    return {
      totalCalls: 0,
      totalErrors: 0,
      averageDuration: 0,
      callsByMethod: {},
      callsByPath: {},
      callsByStatus: {},
      recentErrors: [],
      callsLast24h: 0,
      callsLastHour: 0,
    };
  }
}

// Clean up old logs (older than 30 days)
export function cleanupOldLogs(): void {
  try {
    const database = initDatabase();
    const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    database.prepare('DELETE FROM api_logs WHERE timestamp < ?').run(cutoffDate);
  } catch (error) {
    if (process.env.LOG_API) {
      console.error('Failed to cleanup old logs:', error);
    }
  }
}

// Run cleanup on startup and then every 24 hours
if (typeof Bun !== 'undefined') {
  cleanupOldLogs();
  setInterval(cleanupOldLogs, 24 * 60 * 60 * 1000);
}

