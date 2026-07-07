CREATE INDEX idx_tasks_user_due_status ON tasks(user_id, due_date, status);
CREATE INDEX idx_tasks_category_id     ON tasks(category_id);
CREATE INDEX idx_categories_user_id    ON categories(user_id);
