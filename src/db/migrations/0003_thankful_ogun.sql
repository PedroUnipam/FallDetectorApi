ALTER TABLE `users` ADD `cpf` text NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `name` text NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `did_agree_to_lgpd` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `cellphone` text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `users_cpf_unique` ON `users` (`cpf`);