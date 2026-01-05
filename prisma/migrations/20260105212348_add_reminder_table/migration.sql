-- CreateTable
CREATE TABLE `Reminder` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` VARCHAR(191) NOT NULL,
    `guildId` VARCHAR(191) NULL,
    `channelId` VARCHAR(191) NOT NULL,
    `message` TEXT NOT NULL,
    `remindAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Reminder_remindAt_idx`(`remindAt`),
    INDEX `Reminder_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
