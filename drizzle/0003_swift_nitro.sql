ALTER TABLE "generation_tasks" ADD COLUMN "recipe_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "variables_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "source_template_id" varchar(26);--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "source_generation_task_id" varchar(26);--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD CONSTRAINT "generation_tasks_source_template_id_templates_id_fk" FOREIGN KEY ("source_template_id") REFERENCES "public"."templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_source_generation_task_id_generation_tasks_id_fk" FOREIGN KEY ("source_generation_task_id") REFERENCES "public"."generation_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_generation_tasks_user_created" ON "generation_tasks" USING btree ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_templates_source_generation" ON "templates" USING btree ("source_generation_task_id");