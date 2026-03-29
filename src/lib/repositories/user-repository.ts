import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { generateId } from "@/lib/ulid";
import type { User } from "@/types/models";

type UserRow = typeof users.$inferSelect;

/** 数据库行 → User 领域对象 */
function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    googleId: row.googleId,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatarUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** 按 google_id 查找或创建用户（UPSERT） */
export async function findOrCreateUser(googleUser: {
  googleId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}): Promise<User> {
  const id = generateId();
  const [row] = await db
    .insert(users)
    .values({
      id,
      googleId: googleUser.googleId,
      email: googleUser.email,
      name: googleUser.name,
      avatarUrl: googleUser.avatarUrl,
    })
    .onConflictDoUpdate({
      target: users.googleId,
      set: {
        name: googleUser.name,
        avatarUrl: googleUser.avatarUrl,
        updatedAt: sql`NOW()`,
      },
    })
    .returning();
  return rowToUser(row);
}

/** 按 ID 查询用户 */
export async function findUserById(id: string): Promise<User | null> {
  const rows = await db.select().from(users).where(eq(users.id, id));
  if (rows.length === 0) return null;
  return rowToUser(rows[0]);
}
