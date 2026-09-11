CREATE TABLE "workspace_directions" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"user_id" varchar(26) NOT NULL,
	"title" text NOT NULL,
	"creation_request_key" varchar(200) NOT NULL,
	"draft_revision" integer DEFAULT 0 NOT NULL,
	"analysis_task_id" varchar(26),
	"source_asset_id" varchar(26),
	"source_template_id" varchar(26),
	"source_iteration_id" varchar(26),
	"preferred_iteration_id" varchar(26),
	"draft" jsonb NOT NULL,
	"quick_authorization_id" varchar(200),
	"quick_state" varchar(20) DEFAULT 'none' NOT NULL,
	"quick_settings_hash" varchar(64),
	"quick_snapshot" jsonb,
	"quick_activation_id" varchar(200),
	"authorization_epoch" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_direction_revision_check" CHECK ("workspace_directions"."draft_revision" >= 0 AND "workspace_directions"."authorization_epoch" >= 0),
	CONSTRAINT "workspace_quick_state_check" CHECK ("workspace_directions"."quick_state" IN ('none','armed','consumed'))
);
--> statement-breakpoint
CREATE TABLE "workspace_events" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"direction_id" varchar(26) NOT NULL,
	"user_id" varchar(26) NOT NULL,
	"sequence" integer NOT NULL,
	"request_key" varchar(200) NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"kind" varchar(20) NOT NULL,
	"state" varchar(20) DEFAULT 'completed' NOT NULL,
	"base_revision" integer,
	"resulting_revision" integer,
	"input_text" text,
	"reply_text" text,
	"response_kind" varchar(20),
	"references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"inverse_changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"choices" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"proposal_state" varchar(20) DEFAULT 'none' NOT NULL,
	"generation_task_id" varchar(26),
	"memory_id" varchar(26),
	"related_event_id" varchar(26),
	"deadline_at" timestamp with time zone,
	"reserved_cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_event_sequence_check" CHECK ("workspace_events"."sequence" > 0),
	CONSTRAINT "workspace_event_kind_check" CHECK ("workspace_events"."kind" IN ('turn','restored','draft_change','generation','memory','authorization')),
	CONSTRAINT "workspace_event_state_check" CHECK ("workspace_events"."state" IN ('processing','completed','failed')),
	CONSTRAINT "workspace_event_response_check" CHECK ("workspace_events"."response_kind" IS NULL OR "workspace_events"."response_kind" IN ('answer','clarify','proposal','render_request','unsupported')),
	CONSTRAINT "workspace_event_proposal_check" CHECK ("workspace_events"."proposal_state" IN ('none','pending','applied','discarded','stale'))
);
--> statement-breakpoint
ALTER TABLE "analysis_tasks" ADD COLUMN "direction_id" varchar(26);--> statement-breakpoint
ALTER TABLE "analysis_tasks" ADD COLUMN "request_key" varchar(200);--> statement-breakpoint
ALTER TABLE "analysis_tasks" ADD COLUMN "reserved_cost_usd" numeric(12, 6);--> statement-breakpoint
ALTER TABLE "analysis_tasks" ADD COLUMN "deadline_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "analysis_tasks" ADD COLUMN "last_reconciled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "source_generation_task_id" varchar(26);--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "direction_id" varchar(26);--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "request_key" varchar(200);--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "reserved_cost_usd" numeric(12, 6);--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "deadline_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "last_reconciled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "request_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "draft_revision" integer;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "dispatch_state" varchar(20);--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "attempted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "retry_of" varchar(26);--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "output_url" text;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "output_object_key" text;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "output_mime_type" varchar(50);--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "output_width" integer;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "output_height" integer;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "reserved_result_asset_id" varchar(26);--> statement-breakpoint
ALTER TABLE "workspace_directions" ADD CONSTRAINT "workspace_directions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_directions" ADD CONSTRAINT "workspace_directions_analysis_task_id_analysis_tasks_id_fk" FOREIGN KEY ("analysis_task_id") REFERENCES "public"."analysis_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_directions" ADD CONSTRAINT "workspace_directions_source_asset_id_assets_id_fk" FOREIGN KEY ("source_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_directions" ADD CONSTRAINT "workspace_directions_source_template_id_templates_id_fk" FOREIGN KEY ("source_template_id") REFERENCES "public"."templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_directions" ADD CONSTRAINT "workspace_directions_source_iteration_id_generation_tasks_id_fk" FOREIGN KEY ("source_iteration_id") REFERENCES "public"."generation_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_directions" ADD CONSTRAINT "workspace_directions_preferred_iteration_id_generation_tasks_id_fk" FOREIGN KEY ("preferred_iteration_id") REFERENCES "public"."generation_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_events" ADD CONSTRAINT "workspace_events_direction_id_workspace_directions_id_fk" FOREIGN KEY ("direction_id") REFERENCES "public"."workspace_directions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_events" ADD CONSTRAINT "workspace_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_events" ADD CONSTRAINT "workspace_events_generation_task_id_generation_tasks_id_fk" FOREIGN KEY ("generation_task_id") REFERENCES "public"."generation_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_events" ADD CONSTRAINT "workspace_events_memory_id_templates_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_events" ADD CONSTRAINT "workspace_events_related_event_id_workspace_events_id_fk" FOREIGN KEY ("related_event_id") REFERENCES "public"."workspace_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_direction_creation_unique" ON "workspace_directions" USING btree ("user_id","creation_request_key");--> statement-breakpoint
CREATE INDEX "workspace_direction_user_updated" ON "workspace_directions" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_event_request_unique" ON "workspace_events" USING btree ("user_id","request_key");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_event_sequence_unique" ON "workspace_events" USING btree ("direction_id","sequence");--> statement-breakpoint
ALTER TABLE "analysis_tasks" ADD CONSTRAINT "analysis_tasks_direction_id_workspace_directions_id_fk" FOREIGN KEY ("direction_id") REFERENCES "public"."workspace_directions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_source_generation_task_id_generation_tasks_id_fk" FOREIGN KEY ("source_generation_task_id") REFERENCES "public"."generation_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD CONSTRAINT "generation_tasks_direction_id_workspace_directions_id_fk" FOREIGN KEY ("direction_id") REFERENCES "public"."workspace_directions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD CONSTRAINT "generation_tasks_retry_of_generation_tasks_id_fk" FOREIGN KEY ("retry_of") REFERENCES "public"."generation_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_tasks_request_unique" ON "analysis_tasks" USING btree ("user_id","request_key") WHERE "analysis_tasks"."request_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "assets_source_generation_unique" ON "assets" USING btree ("source_generation_task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_tasks_request_unique" ON "generation_tasks" USING btree ("user_id","request_key") WHERE "generation_tasks"."request_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "generation_direction_active_unique" ON "generation_tasks" USING btree ("direction_id") WHERE "generation_tasks"."direction_id" IS NOT NULL AND ("generation_tasks"."status" IN ('pending', 'processing') OR "generation_tasks"."dispatch_state" = 'unknown');--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD CONSTRAINT "generation_dispatch_state_check" CHECK ("generation_tasks"."dispatch_state" IS NULL OR "generation_tasks"."dispatch_state" IN ('prepared', 'submitting', 'submitted', 'unknown', 'outputStored', 'terminal'));