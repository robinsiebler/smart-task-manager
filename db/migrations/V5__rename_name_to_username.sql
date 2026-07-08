ALTER TABLE users RENAME COLUMN name TO username;
ALTER TABLE users ADD CONSTRAINT uq_users_username UNIQUE (username);
