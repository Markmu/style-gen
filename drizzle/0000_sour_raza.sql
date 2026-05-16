CREATE TABLE "analysis_tasks" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"source_asset_id" varchar(26) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"recipe" jsonb,
	"prompt_text" text,
	"negative_prompt_text" text,
	"raw_response" text,
	"error_message" text,
	"error_stage" varchar(10),
	"provider" varchar(20) DEFAULT 'gemini' NOT NULL,
	"external_id" varchar(255),
	"model_name" varchar(100),
	"user_id" varchar(26),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analysis_tasks_status_check" CHECK ("analysis_tasks"."status" IN ('pending', 'processing', 'completed', 'failed')),
	CONSTRAINT "analysis_tasks_error_stage_check" CHECK ("analysis_tasks"."error_stage" IN ('vision', 'llm')),
	CONSTRAINT "analysis_tasks_provider_check" CHECK ("analysis_tasks"."provider" IN ('replicate', 'gemini'))
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"type" varchar(20) NOT NULL,
	"file_url" text NOT NULL,
	"thumbnail_url" text,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"mime_type" varchar(50) NOT NULL,
	"user_id" varchar(26),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_type_check" CHECK ("assets"."type" IN ('reference', 'generated')),
	CONSTRAINT "assets_mime_type_check" CHECK ("assets"."mime_type" IN ('image/jpeg', 'image/png', 'image/webp'))
);
--> statement-breakpoint
CREATE TABLE "generation_tasks" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"analysis_task_id" varchar(26) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"prompt_snapshot" text NOT NULL,
	"negative_prompt_snapshot" text NOT NULL,
	"params" jsonb NOT NULL,
	"model_name" varchar(100) NOT NULL,
	"provider" varchar(20) DEFAULT 'fal' NOT NULL,
	"external_id" varchar(255),
	"result_asset_id" varchar(26),
	"error_message" text,
	"user_id" varchar(26),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generation_tasks_status_check" CHECK ("generation_tasks"."status" IN ('pending', 'processing', 'completed', 'failed')),
	CONSTRAINT "generation_tasks_provider_check" CHECK ("generation_tasks"."provider" IN ('replicate', 'fal'))
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL,
	"content" text NOT NULL,
	"variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"user_id" varchar(26) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"google_id" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analysis_tasks" ADD CONSTRAINT "analysis_tasks_source_asset_id_assets_id_fk" FOREIGN KEY ("source_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_tasks" ADD CONSTRAINT "analysis_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD CONSTRAINT "generation_tasks_analysis_task_id_analysis_tasks_id_fk" FOREIGN KEY ("analysis_task_id") REFERENCES "public"."analysis_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD CONSTRAINT "generation_tasks_result_asset_id_assets_id_fk" FOREIGN KEY ("result_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD CONSTRAINT "generation_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_analysis_tasks_source_asset" ON "analysis_tasks" USING btree ("source_asset_id");--> statement-breakpoint
CREATE INDEX "idx_analysis_tasks_status" ON "analysis_tasks" USING btree ("status") WHERE status IN ('pending', 'processing');--> statement-breakpoint
CREATE INDEX "idx_generation_tasks_analysis_task" ON "generation_tasks" USING btree ("analysis_task_id");--> statement-breakpoint
CREATE INDEX "idx_generation_tasks_status" ON "generation_tasks" USING btree ("status") WHERE status IN ('pending', 'processing');--> statement-breakpoint
CREATE INDEX "idx_templates_user_id" ON "templates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_templates_user_name" ON "templates" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "users_google_id_unique" ON "users" USING btree ("google_id");
