CREATE TABLE `championshipState` (
	`id` int NOT NULL,
	`payload` json NOT NULL,
	`revision` int NOT NULL DEFAULT 1,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `championshipState_id` PRIMARY KEY(`id`)
);
