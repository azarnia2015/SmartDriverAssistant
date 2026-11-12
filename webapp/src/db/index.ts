import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

let pool: Pool | null = null;

/** اتصال تنبل (lazy) تا نبودِ دیتابیس هم اجرای برنامه را خراب نکند. */
export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!pool) pool = new Pool({ connectionString: url, max: 3 });
  return drizzle(pool, { schema });
}
