ALTER TABLE conversations
    ADD COLUMN flatmate_kind      text,
    ADD COLUMN flatmate_target_id uuid,
    ADD CONSTRAINT ck_conversations_flatmate_kind
        CHECK (flatmate_kind IS NULL OR flatmate_kind IN ('room', 'group', 'post')),
    ADD CONSTRAINT ck_conversations_flatmate_target
        CHECK ((flatmate_kind IS NULL) = (flatmate_target_id IS NULL));

COMMENT ON COLUMN conversations.flatmate_target_id IS
    'The flatmate room, group or seeker post the pair chat was last opened from via an accepted request, so the '
    'thread header can show it. No FK: the target table depends on flatmate_kind.';
