CREATE TABLE task_categories (
    task_id      NUMBER NOT NULL,
    category_id  NUMBER NOT NULL,
    CONSTRAINT pk_task_categories PRIMARY KEY (task_id, category_id),
    CONSTRAINT fk_task_categories_task FOREIGN KEY (task_id)
        REFERENCES tasks(task_id) ON DELETE CASCADE,
    CONSTRAINT fk_task_categories_category FOREIGN KEY (category_id)
        REFERENCES categories(category_id) ON DELETE CASCADE
);

CREATE INDEX idx_task_categories_category_id ON task_categories(category_id);

INSERT INTO task_categories (task_id, category_id)
SELECT task_id, category_id FROM tasks WHERE category_id IS NOT NULL;

ALTER TABLE tasks DROP COLUMN category_id;
