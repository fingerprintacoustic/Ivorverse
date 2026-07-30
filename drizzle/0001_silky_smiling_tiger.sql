CREATE TABLE `appProjects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`userId` int NOT NULL,
	`appType` enum('website','mobile','saas') NOT NULL,
	`requirements` text,
	`design` text,
	`databaseSchema` text,
	`apiStructure` text,
	`sourceCode` text,
	`sourceCodeUrl` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `appProjects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `auditLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`adminId` int,
	`action` varchar(255) NOT NULL,
	`targetUserId` int,
	`details` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `characters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`faceImageUrl` varchar(512),
	`faceImageKey` varchar(255),
	`voiceUrl` varchar(512),
	`voiceKey` varchar(255),
	`personality` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `characters_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chatMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('user','assistant') NOT NULL,
	`content` text NOT NULL,
	`fileUrls` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chatMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectId` int,
	`filename` varchar(255) NOT NULL,
	`fileKey` varchar(255) NOT NULL,
	`url` varchar(512) NOT NULL,
	`mimeType` varchar(100),
	`size` int,
	`fileType` enum('document','image','audio','video','code','other'),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `musicProjects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`userId` int NOT NULL,
	`lyrics` text,
	`structure` json,
	`productionPrompt` text,
	`audioUrl` varchar(512),
	`audioKey` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `musicProjects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`type` enum('chat','research','app','music','image','voice','video') NOT NULL,
	`content` json,
	`isPublic` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `researchReports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`content` text NOT NULL,
	`sources` json,
	`citations` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `researchReports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`tier` enum('free','pro','business') NOT NULL DEFAULT 'free',
	`stripeCustomerId` varchar(255),
	`stripeSubscriptionId` varchar(255),
	`status` enum('active','canceled','expired','past_due') NOT NULL DEFAULT 'active',
	`currentPeriodStart` timestamp,
	`currentPeriodEnd` timestamp,
	`canceledAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `subscriptions_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `teamMembers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`memberId` int NOT NULL,
	`role` enum('owner','editor','viewer') DEFAULT 'editor',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `teamMembers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `usage` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`feature` enum('chat','research','app','music','image','voice','video') NOT NULL,
	`count` int NOT NULL DEFAULT 0,
	`month` int NOT NULL,
	`year` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `usage_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `videoProjects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`userId` int NOT NULL,
	`musicProjectId` int,
	`scenes` json,
	`imageUrls` json,
	`videoUrl` varchar(512),
	`videoKey` varchar(255),
	`subtitles` text,
	`status` enum('pending','processing','completed','failed') DEFAULT 'pending',
	`progress` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `videoProjects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `subscriptionTier` enum('free','pro','business') DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `profileImageUrl` varchar(512);