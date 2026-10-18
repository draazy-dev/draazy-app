UPDATE identity_verifications SET qa_sampled_at = NULL
 WHERE qa_sampled_at IS NOT NULL AND qa_reviewed_at IS NULL;
