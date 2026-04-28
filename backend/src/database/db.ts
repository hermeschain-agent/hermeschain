import { Pool } from 'pg';
import Redis from 'ioredis';
import * as dotenv from 'dotenv';
import { recordQuery, recordQueryError } from './queryMetrics';

dotenv.config();

// Slow-query threshold (TASK-321). Queries above this log a [PG SLOW] warning.
const PG_SLOW_QUERY_MS = Math.max(1, Number(process.env.PG_SLOW_QUERY_MS || '1000'));

// PostgreSQL connection - uses Railway's DATABASE_URL
const DATABASE_URL = process.env.DATABASE_URL;

let pool: Pool | null = null;
let redis: Redis | null = null;

// Initialize PostgreSQL — tunable via env so dev (small) and prod (large)
// can size differently without a code change.
const POOL_MAX = Math.max(1, Number(process.env.PG_POOL_MAX || '20'));
const POOL_IDLE_MS = Math.max(1000, Number(process.env.PG_POOL_IDLE_MS || '30000'));
const POOL_CONNECT_MS = Math.max(500, Number(process.env.PG_POOL_CONNECT_MS || '2000'));

if (DATABASE_URL) {
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: POOL_MAX,
    idleTimeoutMillis: POOL_IDLE_MS,
    connectionTimeoutMillis: POOL_CONNECT_MS,
  });
  console.log(`[DB] PostgreSQL pool created (max=${POOL_MAX}, idle=${POOL_IDLE_MS}ms, connect=${POOL_CONNECT_MS}ms)`);
} else {
  console.warn('[DB] DATABASE_URL not set - using in-memory fallback');
}

// Initialize Redis - uses Railway's REDIS_URL
const REDIS_URL = process.env.REDIS_URL;

if (REDIS_URL) {
  redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 100, 3000),
  });
  
  redis.on('connect', () => {
    console.log('[REDIS] Connected');
  });
  
  redis.on('error', (err) => {
    console.error('[REDIS] Error:', err);
  });
} else {
  console.warn('[REDIS] REDIS_URL not set - caching disabled');
}

// In-memory fallback storage
const memoryStore: Record<string, any[]> = {
  blocks: [],
  transactions: [],
  accounts: [],
  validators: [],
  cips: [],
  cip_votes: [],
  debate_messages: [],
  chat_logs: [],
  consensus_events: [],
};

export const db = {
  // Execute schema creation (multiple statements)
  exec: async (sql: string): Promise<void> => {
    if (!pool) {
      console.log('Using in-memory storage (no DATABASE_URL)');
      return;
    }

    const startedAt = Date.now();
    try {
      // Split by semicolon and execute each statement
      const statements = sql.split(';').filter(s => s.trim().length > 0);
      for (const statement of statements) {
        await pool.query(statement);
      }
      const duration = Date.now() - startedAt;
      recordQuery(duration);
      if (duration > PG_SLOW_QUERY_MS) {
        console.warn(`[PG SLOW] exec ${duration}ms (${sql.length} chars, ${sql.split(';').length} stmts)`);
      }
    } catch (error) {
      recordQueryError();
      console.error('Database exec error:', error);
      throw error;
    }
  },

  // Execute single query with parameters
  query: async (text: string, params: any[] = []): Promise<{ rows: any[]; rowCount?: number }> => {
    if (!pool) {
      // Fallback to memory
      return { rows: [], rowCount: 0 };
    }

    const startedAt = Date.now();
    try {
      const result = await pool.query(text, params);
      const duration = Date.now() - startedAt;
      recordQuery(duration);
      if (duration > PG_SLOW_QUERY_MS) {
        // Truncate SQL to 200 chars; never log param VALUES (PII), only count.
        const sqlPreview = text.length > 200 ? text.slice(0, 200) + '…' : text;
        console.warn(`[PG SLOW] query ${duration}ms params=${params.length} sql=${JSON.stringify(sqlPreview)}`);
      }
      return { rows: result.rows, rowCount: result.rowCount || 0 };
    } catch (error) {
      recordQueryError();
      console.error('Database query error:', error);
      throw error;
    }
  },
  
  // Pool capacity snapshot for /api/metrics + /health/ready.
  // Returns zeros when running in-memory (no pool).
  poolStats: (): { total: number; idle: number; waiting: number; max: number } => {
    if (!pool) return { total: 0, idle: 0, waiting: 0, max: POOL_MAX };
    return {
      total: (pool as any).totalCount ?? 0,
      idle: (pool as any).idleCount ?? 0,
      waiting: (pool as any).waitingCount ?? 0,
      max: POOL_MAX,
    };
  },

  // Test connection
  connect: async (): Promise<boolean> => {
    if (!pool) {
      console.log('[DB] Using in-memory storage');
      return true;
    }
    
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      console.log('[DB] PostgreSQL connected');
      return true;
    } catch (error) {
      console.error('[DB] PostgreSQL connection failed:', error);
      return false;
    }
  },
  
  // Close connections
  end: async (): Promise<void> => {
    if (pool) await pool.end();
    if (redis) redis.disconnect();
  }
};

// Redis cache helper
export const cache = {
  // Get cached value
  get: async (key: string): Promise<string | null> => {
    if (!redis) return null;
    try {
      return await redis.get(key);
    } catch (error) {
      console.error('Redis get error:', error);
      return null;
    }
  },
  
  // Set cached value with optional TTL (seconds)
  set: async (key: string, value: string, ttl?: number): Promise<void> => {
    if (!redis) return;
    try {
      if (ttl) {
        await redis.setex(key, ttl, value);
      } else {
        await redis.set(key, value);
      }
    } catch (error) {
      console.error('Redis set error:', error);
    }
  },
  
  // Delete cached value
  del: async (key: string): Promise<void> => {
    if (!redis) return;
    try {
      await redis.del(key);
    } catch (error) {
      console.error('Redis del error:', error);
    }
  },
  
  // Get JSON object
  getJSON: async <T>(key: string): Promise<T | null> => {
    const value = await cache.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  },
  
  // Set JSON object
  setJSON: async (key: string, value: any, ttl?: number): Promise<void> => {
    await cache.set(key, JSON.stringify(value), ttl);
  },
  
  // Increment counter
  incr: async (key: string): Promise<number> => {
    if (!redis) return 0;
    try {
      return await redis.incr(key);
    } catch (error) {
      console.error('Redis incr error:', error);
      return 0;
    }
  },
  
  // Get hash field
  hget: async (key: string, field: string): Promise<string | null> => {
    if (!redis) return null;
    try {
      return await redis.hget(key, field);
    } catch (error) {
      console.error('Redis hget error:', error);
      return null;
    }
  },
  
  // Set hash field
  hset: async (key: string, field: string, value: string): Promise<void> => {
    if (!redis) return;
    try {
      await redis.hset(key, field, value);
    } catch (error) {
      console.error('Redis hset error:', error);
    }
  },
  
  // Get all hash fields
  hgetall: async (key: string): Promise<Record<string, string> | null> => {
    if (!redis) return null;
    try {
      return await redis.hgetall(key);
    } catch (error) {
      console.error('Redis hgetall error:', error);
      return null;
    }
  },
  
  // Check if connected
  isConnected: (): boolean => {
    return redis !== null && redis.status === 'ready';
  }
};

// Chain state persistence helpers
export const chainState = {
  // Save the latest block height
  saveBlockHeight: async (height: number): Promise<void> => {
    await cache.set('chain:block_height', height.toString());
  },
  
  // Get the latest block height
  getBlockHeight: async (): Promise<number> => {
    const height = await cache.get('chain:block_height');
    return height ? parseInt(height, 10) : 0;
  },
  
  // Save chain start time
  saveChainStartTime: async (timestamp: number): Promise<void> => {
    await cache.set('chain:start_time', timestamp.toString());
  },
  
  // Get chain start time
  getChainStartTime: async (): Promise<number> => {
    const time = await cache.get('chain:start_time');
    return time ? parseInt(time, 10) : Date.now();
  },
  
  // Save total transactions count
  saveTotalTransactions: async (count: number): Promise<void> => {
    await cache.set('chain:total_transactions', count.toString());
  },
  
  // Get total transactions count
  getTotalTransactions: async (): Promise<number> => {
    const count = await cache.get('chain:total_transactions');
    return count ? parseInt(count, 10) : 0;
  },
  
  // Increment block height atomically
  incrementBlockHeight: async (): Promise<number> => {
    return await cache.incr('chain:block_height');
  },
  
  // Save a block to cache (for quick retrieval)
  saveBlock: async (block: any): Promise<void> => {
    await cache.setJSON(`block:${block.height}`, block);
    await cache.set(`block:hash:${block.hash}`, block.height.toString());
  },
  
  // Get block by height from cache
  getBlock: async (height: number): Promise<any | null> => {
    return await cache.getJSON(`block:${height}`);
  },
  
  // Get block height by hash
  getBlockHeightByHash: async (hash: string): Promise<number | null> => {
    const height = await cache.get(`block:hash:${hash}`);
    return height ? parseInt(height, 10) : null;
  }
};
