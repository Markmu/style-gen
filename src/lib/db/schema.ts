import {
  pgTable,
  varchar,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  check,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { VisualRecipe, GenerationParams } from "@/types/models";

/** users 表 */
export const users = pgTable(
  "users",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    googleId: varchar("google_id", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    avatarUrl: text("avatar_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("users_google_id_unique").on(table.googleId)]
);

/** assets 表 */
export const assets = pgTable(
  "assets",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    type: varchar("type", { length: 20 }).notNull(),
    fileUrl: text("file_url").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    mimeType: varchar("mime_type", { length: 50 }).notNull(),
    userId: varchar("user_id", { length: 26 }).references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "assets_type_check",
      sql`${table.type} IN ('reference', 'generated')`
    ),
    check(
      "assets_mime_type_check",
      sql`${table.mimeType} IN ('image/jpeg', 'image/png', 'image/webp')`
    ),
  ]
);

/** analysis_tasks 表 */
export const analysisTasks = pgTable(
  "analysis_tasks",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    sourceAssetId: varchar("source_asset_id", { length: 26 })
      .notNull()
      .references(() => assets.id),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    recipe: jsonb("recipe").$type<VisualRecipe | null>(),
    promptText: text("prompt_text"),
    negativePromptText: text("negative_prompt_text"),
    rawResponse: text("raw_response"),
    errorMessage: text("error_message"),
    errorStage: varchar("error_stage", { length: 10 }),
    provider: varchar("provider", { length: 20 }).notNull().default("gemini"),
    externalId: varchar("external_id", { length: 255 }),
    modelName: varchar("model_name", { length: 100 }),
    userId: varchar("user_id", { length: 26 }).references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "analysis_tasks_status_check",
      sql`${table.status} IN ('pending', 'processing', 'completed', 'failed')`
    ),
    check(
      "analysis_tasks_error_stage_check",
      sql`${table.errorStage} IN ('vision', 'llm')`
    ),
    check(
      "analysis_tasks_provider_check",
      sql`${table.provider} IN ('replicate', 'gemini')`
    ),
    index("idx_analysis_tasks_source_asset").on(table.sourceAssetId),
    index("idx_analysis_tasks_status")
      .on(table.status)
      .where(sql`status IN ('pending', 'processing')`),
  ]
);

/** generation_tasks 表 */
export const generationTasks = pgTable(
  "generation_tasks",
  {
    id: varchar("id", { length: 26 }).primaryKey(),
    analysisTaskId: varchar("analysis_task_id", { length: 26 })
      .notNull()
      .references(() => analysisTasks.id),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    promptSnapshot: text("prompt_snapshot").notNull(),
    negativePromptSnapshot: text("negative_prompt_snapshot").notNull(),
    params: jsonb("params").notNull().$type<GenerationParams>(),
    modelName: varchar("model_name", { length: 100 }).notNull(),
    provider: varchar("provider", { length: 20 }).notNull().default("fal"),
    externalId: varchar("external_id", { length: 255 }),
    resultAssetId: varchar("result_asset_id", { length: 26 }).references(
      () => assets.id
    ),
    errorMessage: text("error_message"),
    userId: varchar("user_id", { length: 26 }).references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "generation_tasks_status_check",
      sql`${table.status} IN ('pending', 'processing', 'completed', 'failed')`
    ),
    check(
      "generation_tasks_provider_check",
      sql`${table.provider} IN ('replicate', 'fal')`
    ),
    index("idx_generation_tasks_analysis_task").on(table.analysisTaskId),
    index("idx_generation_tasks_status")
      .on(table.status)
      .where(sql`status IN ('pending', 'processing')`),
  ]
);
