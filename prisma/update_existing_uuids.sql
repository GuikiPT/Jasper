-- Generate UUIDs for existing reminders
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
	`uuid` IS NULL
	OR `uuid` = '';