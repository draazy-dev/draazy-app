UPDATE users u SET gender = p.gender
  FROM flatmate_seeker_posts p
 WHERE p.user_id = u.id AND p.archived = false
   AND p.gender IN ('male', 'female') AND u.gender IS NULL;
