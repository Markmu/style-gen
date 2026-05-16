ALTER TABLE "analysis_tasks" ADD COLUMN "analysis_template_content" text;--> statement-breakpoint
ALTER TABLE "analysis_tasks" ADD COLUMN "analysis_template_variables" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "analysis_tasks" ADD COLUMN "analysis_template_status" varchar(20);--> statement-breakpoint
ALTER TABLE "analysis_tasks" ADD COLUMN "analysis_template_reason" text;--> statement-breakpoint
ALTER TABLE "analysis_tasks" ADD CONSTRAINT "analysis_tasks_template_status_check" CHECK ("analysis_tasks"."analysis_template_status" IS NULL OR "analysis_tasks"."analysis_template_status" IN ('ready', 'partial', 'fallback'));