-- AlterTable
-- Add uuid column with temporary nullable constraint
ALTER TABLE `Reminder`
ADD COLUMN `uuid` VARCHAR(8) NULL;

-- Generate UUIDs for existing reminders
-- This is a simple approach that generates random 5-character strings
UPDATE `Reminder`
SET
	`uuid` = CONCAT (
		SUBSTRING(
			'123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz',
			FLOOR(1 + RAND () * 57),
			1
		),
		SUBSTRING(
			'123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz',
			FLOOR(1 + RAND () * 57),
			1
		),
		SUBSTRING(
			'123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz',
			FLOOR(1 + RAND () * 57),
			1
		),
		SUBSTRING(
			'123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz',
			FLOOR(1 + RAND () * 57),
			1
		),
		SUBSTRING(
			'123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz',
			FLOOR(1 + RAND () * 57),
			1
		)
	)
WHERE
	`uuid` IS NULL;

-- Make uuid NOT NULL after populating existing rows
ALTER TABLE `Reminder` MODIFY COLUMN `uuid` VARCHAR(8) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Reminder_uuid_key` ON `Reminder` (`uuid`);