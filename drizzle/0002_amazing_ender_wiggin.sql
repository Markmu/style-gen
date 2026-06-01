ALTER TABLE "templates" ADD COLUMN "source_asset_id" varchar(26);--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "source_image_url" text;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_source_asset_id_assets_id_fk" FOREIGN KEY ("source_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_templates_source_asset" ON "templates" USING btree ("source_asset_id");