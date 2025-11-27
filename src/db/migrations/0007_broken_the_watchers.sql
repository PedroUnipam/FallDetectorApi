ALTER TABLE `users` ADD `device` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_device_unique` ON `users` (`device`);