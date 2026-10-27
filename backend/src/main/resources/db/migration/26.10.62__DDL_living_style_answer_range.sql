ALTER TABLE user_living_style ADD CONSTRAINT user_living_style_answers_range_check
    CHECK (NOT jsonb_path_exists(answers, '$.* ? (@.type() != "number" || @ < 0 || @ > 2 || @ != @.floor())'));