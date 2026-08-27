ALTER TABLE "generation_tasks" DROP CONSTRAINT "generation_tasks_source_template_id_templates_id_fk";
--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "retained_rules" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "negative_constraints" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "style_tokens" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "enhancement_hints" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "verification_status" varchar(20) DEFAULT 'pending_verification' NOT NULL;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "representative_generation_task_id" varchar(26);--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD CONSTRAINT "generation_tasks_source_template_id_templates_id_fk" FOREIGN KEY ("source_template_id") REFERENCES "public"."templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_representative_generation_task_id_generation_tasks_id_fk" FOREIGN KEY ("representative_generation_task_id") REFERENCES "public"."generation_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_generation_tasks_source_template" ON "generation_tasks" USING btree ("source_template_id");--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_verification_status_check" CHECK ("templates"."verification_status" IN ('user_verified', 'pending_verification'));