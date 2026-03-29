import { Pool } from "pg";
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

let _pool: Pool | null = null;

function getPool(): Pool {
  if (!_pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error("Missing required environment variable: DATABASE_URL");
    }
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
    });
  }
  return _pool;
}

let _db: NodePgDatabase<typeof schema> | null = null;

/** 获取 Drizzle ORM 实例（懒初始化） */
export function getDb(): NodePgDatabase<typeof schema> {
  if (!_db) {
    _db = drizzle(getPool(), { schema });
  }
  return _db;
}

/** Drizzle ORM 实例代理（懒初始化，等价于 getDb()） */
export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_, prop) {
    return Reflect.get(getDb(), prop);
  },
});
