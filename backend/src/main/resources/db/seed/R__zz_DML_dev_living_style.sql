-- Living-style answers for seeded flatmate authors and e2e consumers, so a signed-in user sees match scores.
-- 9700000035 answers only two, to show the "too few in common" case.
INSERT INTO public.user_living_style (user_id, answers)
SELECT v.user_id::uuid, v.answers::jsonb
FROM (VALUES
    -- viewers
    ('c06d8be2-459c-4f9e-b4da-48266130be42', '{"tidy":0,"food":1,"sleep":0,"wfh":2,"guests":1,"visitors":1,"smoking":0,"drinks":1,"pets":2,"bills":0,"family":1,"quiet":1}'),
    ('654410e5-02db-49cb-a9b8-9c7807ed69b9', '{"tidy":1,"food":2,"sleep":1,"wfh":1,"guests":2,"visitors":2,"smoking":1,"drinks":2,"pets":1,"bills":1}'),
    ('f1c70000-0000-4000-8000-000000000001', '{"tidy":0,"sleep":0,"guests":0,"smoking":0,"quiet":0,"bills":0}'),
    ('f1c70000-0000-4000-8000-000000000002', '{"tidy":1,"food":1,"sleep":1,"wfh":2,"drinks":1}'),
    ('f1c70000-0000-4000-8000-000000000003', '{"tidy":2,"food":2,"sleep":2,"wfh":0,"guests":2,"visitors":2,"smoking":2,"drinks":2}'),
    -- room hosts
    ('3ad0171b-3206-53e2-b6dc-732bf4e1b44c', '{"tidy":0,"food":1,"sleep":0,"wfh":2,"guests":1,"visitors":1,"smoking":0,"drinks":1,"pets":2,"bills":0,"family":1,"quiet":1}'),
    ('f619aa88-84ed-50ce-9a07-abb7712afa9d', '{"tidy":1,"food":1,"sleep":1,"wfh":1,"guests":1,"visitors":1,"smoking":0,"drinks":1,"pets":1,"bills":1,"family":1,"quiet":1}'),
    ('f1c70000-0000-4000-8000-000000000010', '{"tidy":0,"food":0,"sleep":0,"wfh":1,"guests":0,"visitors":1,"smoking":0,"drinks":0,"pets":1,"bills":0,"family":0,"quiet":0}'),
    ('f1c70000-0000-4000-8000-000000000031', '{"tidy":2,"food":2,"sleep":2,"wfh":0,"guests":2,"visitors":2,"smoking":2,"drinks":2,"pets":0,"bills":2,"family":2,"quiet":2}'),
    ('f1c70000-0000-4000-8000-000000000032', '{"tidy":1,"food":2,"sleep":0,"wfh":2,"guests":1,"visitors":0,"smoking":0,"drinks":1,"pets":2,"bills":1}'),
    ('f1c70000-0000-4000-8000-000000000033', '{"tidy":0,"food":1,"sleep":1,"wfh":2,"guests":0,"visitors":1,"smoking":0,"drinks":0,"pets":2,"bills":0,"quiet":1}'),
    ('f1c70000-0000-4000-8000-000000000034', '{"tidy":1,"food":0,"sleep":2,"wfh":1,"guests":2,"visitors":2,"smoking":1,"drinks":2,"pets":1,"bills":2,"family":1,"quiet":2}'),
    ('f1c70000-0000-4000-8000-000000000035', '{"tidy":1,"food":2}'),
    ('f1c70000-0000-4000-8000-000000000036', '{"tidy":0,"food":0,"sleep":0,"wfh":0,"guests":0,"visitors":0,"smoking":0,"drinks":0,"pets":0,"bills":0,"family":0,"quiet":0}'),
    -- seeker-post authors
    ('f1c70000-0000-4000-8000-000000000021', '{"tidy":0,"food":1,"sleep":1,"wfh":2,"guests":1,"smoking":0,"drinks":1,"pets":2}'),
    ('f1c70000-0000-4000-8000-000000000022', '{"tidy":2,"food":1,"sleep":2,"wfh":1,"guests":2,"visitors":1,"smoking":1,"drinks":2,"quiet":2}'),
    ('f1c70000-0000-4000-8000-000000000023', '{"tidy":1,"food":2,"sleep":0,"wfh":2,"guests":1,"visitors":1,"smoking":0,"drinks":1,"pets":1,"bills":1}'),
    ('f1c70000-0000-4000-8000-000000000024', '{"tidy":2,"sleep":2,"guests":2,"drinks":2,"quiet":2}'),
    ('f1c70000-0000-4000-8000-000000000025', '{"tidy":0,"food":0,"sleep":0,"wfh":1,"guests":0,"smoking":0,"drinks":0,"bills":0,"family":1}'),
    ('f1c70000-0000-4000-8000-000000000037', '{"tidy":1,"food":1,"sleep":1,"wfh":2,"guests":1,"visitors":1,"smoking":0,"drinks":1,"pets":2,"bills":1,"family":1,"quiet":1}'),
    ('f1c70000-0000-4000-8000-000000000038', '{"tidy":0,"food":2,"sleep":1,"wfh":0,"guests":1,"visitors":0,"smoking":0,"drinks":1,"pets":0,"bills":0,"family":2,"quiet":0}')
) AS v(user_id, answers)
JOIN public.users u ON u.id = v.user_id::uuid
ON CONFLICT (user_id) DO NOTHING;