-- Mixed owner, seeker and flatmate leads so the Leads CRM has something to call; most sit in the common pool.
WITH seed (mobile, name, lead_type, intent, property_types, bhk, localities, budget, lead_source, source_detail,
           stage, owner_mobile, interests, contacted_days_ago, follow_up_days, note) AS (
    VALUES
    ('7400100001', 'Rohit Kale', 'owner', 'rent-out', '{flat}', '{2}', 'Baner', 32000, 'walk-in', 'Baner office',
     'new', NULL, '{rent-agreement,listing}', NULL, NULL, 'Wants a tenant by next month'),
    ('7400100002', 'Snehal Patil', 'owner', 'sell', '{flat}', '{3}', 'Kothrud', 14500000, 'referral', 'Referred by Rohit Kale',
     'new', NULL, '{valuation,legal}', NULL, NULL, NULL),
    ('7400100003', 'Amit Gokhale', 'owner', 'sell', '{independent}', '{4}', 'Aundh', 32000000, 'facebook', 'Pune Property Owners group',
     'contacted', '9000000000', '{valuation}', 2, 1, 'Call back after his son is home'),
    ('7400100004', 'Farida Shaikh', 'owner', 'rent-out', '{commercial}', '{}', 'Hinjewadi Phase 1', 85000, 'inbound-call', NULL,
     'new', NULL, '{listing}', NULL, NULL, NULL),
    ('7400100005', 'Prakash More', 'owner', 'sell', '{farmland}', '{}', 'Mulshi', 6000000, 'flyer', 'Mulshi road banner',
     'new', NULL, '{legal,valuation}', NULL, NULL, NULL),
    ('7400100006', 'Kavya Nair', 'seeker', 'rent', '{flat}', '{1,2}', 'Wakad, Hinjewadi', 25000, 'instagram', 'Reel on 2BHK rents',
     'new', NULL, '{home-search,packers}', NULL, NULL, 'Moving from Bengaluru in March'),
    ('7400100007', 'Sanjay Deshmukh', 'seeker', 'buy', '{flat,villa}', '{3}', 'Baner, Balewadi', 15000000, 'whatsapp', NULL,
     'interested', '9000000000', '{home-search,loans}', 1, 3, 'Pre-approved loan, wants site visits'),
    ('7400100008', 'Neelam Joshi', 'seeker', 'rent', '{flat}', '{2}', 'Kharadi, Viman Nagar', 30000, 'portal', 'Called from a 99acres ad',
     'new', NULL, '{home-search,rent-agreement}', NULL, NULL, NULL),
    ('7400100009', 'Vikram Rathod', 'seeker', 'buy', '{openplot}', '{}', 'Talegaon', 4000000, 'referral', 'Friend of Prakash More',
     'not-reachable', NULL, '{legal}', 5, NULL, NULL),
    ('7400100010', 'Meghna Iyer', 'seeker', 'buy', '{flat}', '{2,3}', 'Hadapsar, Magarpatta', 9000000, 'draazy', 'Saved 6 listings',
     'new', '9812733640', '{loans,home-search}', NULL, NULL, NULL),
    ('7400100011', 'Arjun Mehta', 'flatmate', 'needs-room', '{}', '{}', 'Hinjewadi, Wakad', 12000, 'instagram', NULL,
     'new', NULL, '{home-search,packers}', NULL, NULL, 'Software engineer, non-smoker'),
    ('7400100012', 'Pooja Kulkarni', 'flatmate', 'has-room', '{}', '{2}', 'Viman Nagar', 14000, 'facebook', 'Flatmates Pune group',
     'new', NULL, '{rent-agreement}', NULL, NULL, NULL),
    ('7400100013', 'Rahul Verma', 'flatmate', 'needs-room', '{}', '{}', 'Kothrud', 9000, 'flyer', 'MIT college notice board',
     'contacted', '9812733640', '{home-search}', 1, 2, 'Starts college in June'),
    ('7400100014', 'Ishita Sen', 'flatmate', 'has-room', '{}', '{3}', 'Baner', 16000, 'walk-in', NULL,
     'lost', NULL, '{rent-agreement}', 7, NULL, 'Found a flatmate on her own'),
    ('7400100015', 'Dev Malhotra', 'seeker', 'rent', '{independent}', '{3,4}', 'Koregaon Park', 90000, 'other', 'Met at a society AGM',
     'new', NULL, '{home-search,interior}', NULL, NULL, NULL)
), leads AS (
    INSERT INTO public.crm_leads (mobile, name, lead_type, intent, property_types, bhk, localities, budget, lead_source,
                                  source_detail, stage, owner_id, claimed_at, interests, last_contact_at, last_activity_at,
                                  next_follow_up_at, last_signal_at)
    SELECT s.mobile, s.name, lead_type, intent, property_types::text[], bhk::text[], localities, budget, lead_source,
           source_detail, stage, u.id,
           CASE WHEN u.id IS NOT NULL THEN now() - interval '1 day' END,
           interests::text[],
           now() - make_interval(days => contacted_days_ago),
           now() - make_interval(days => coalesce(contacted_days_ago, 0)),
           now() + make_interval(days => follow_up_days),
           now() - interval '3 days'
    FROM seed s
    LEFT JOIN public.users u ON u.mobile = s.owner_mobile
    ON CONFLICT (mobile) DO NOTHING
    RETURNING id, mobile, owner_id
), signals AS (
    INSERT INTO public.crm_lead_signals (lead_id, source, source_ref, summary)
    SELECT l.id, 'manual', 'seed:' || l.mobile, 'Added manually'
    FROM leads l
    ON CONFLICT (source, source_ref) DO NOTHING
)
INSERT INTO public.crm_lead_activities (lead_id, actor_id, kind, outcome, body, created_at)
SELECT l.id, l.owner_id, a.kind, a.outcome, a.body, a.at
FROM leads l
JOIN seed s ON s.mobile = l.mobile
CROSS JOIN LATERAL (VALUES
    ('note', NULL, s.note, now() - interval '3 days'),
    ('call', CASE s.stage WHEN 'not-reachable' THEN 'switched-off' ELSE 'connected' END, NULL,
     now() - make_interval(days => s.contacted_days_ago))
) AS a (kind, outcome, body, at)
WHERE (a.kind = 'note' AND s.note IS NOT NULL) OR (a.kind = 'call' AND s.contacted_days_ago IS NOT NULL);
