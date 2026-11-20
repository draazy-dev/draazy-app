-- CMS content: FAQs, unified polymorphic reviews and help-article feedback.

-- translations is {lang: {question, answer, category}} in wire names; one jsonb avoids per-language columns.
-- No inner CHECK: Postgres cannot validate the keys or leaves, so the typed Map in Java is the real gate.

-- faqs is deliberately unindexed: a few dozen editor-curated rows, read whole on every call.
CREATE TABLE faqs (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question       text NOT NULL,
    answer         text,
    category       text,
    archived       boolean NOT NULL DEFAULT false,
    archived_at    timestamptz,
    archive_reason text,
    translations   jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

-- context is server-derived (never client-set) and stored, so a review keeps its badge after a tenancy ends.
-- No archived column: takedown sets status = 'rejected', which every read and the rating aggregate already filter on.
CREATE TABLE reviews (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type text NOT NULL CHECK (target_type IN ('property','locality','society','owner')),
    target_id   text NOT NULL,
    author_id   uuid REFERENCES users(id),
    rating      integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title       text,
    body        text,
    status      text NOT NULL DEFAULT 'published' CHECK (status IN ('pending','published','rejected')),
    context     text CHECK (context IN ('visit', 'tenant')),
    categories  jsonb NOT NULL DEFAULT '{}'::jsonb,
    recommend   boolean,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT reviews_title_len_check CHECK (title IS NULL OR length(title) <= 160),  -- mirrors @Size(max=160)
    CONSTRAINT reviews_body_len_check  CHECK (body  IS NULL OR length(body)  <= 4000)  -- mirrors @Size(max=4000)
);

COMMENT ON COLUMN reviews.context IS
    'Server-derived reviewer standing: tenant | visit. Never accepted from the client (S26).';

COMMENT ON COLUMN reviews.categories IS
    'Sparse per-aspect sub-ratings 1-5. Closed key set: locality, condition, value, owner, accuracy.';

COMMENT ON COLUMN reviews.recommend IS
    'Would recommend. NULL means not answered, which is not the same as false.';

-- One review per author per target, enforced here because the service check alone is racy.
-- Partial: author_id is nullable (seeded rows) and NULLs would not collide anyway.
CREATE UNIQUE INDEX idx_reviews_author_target
    ON reviews (author_id, target_type, target_id)
    WHERE author_id IS NOT NULL;

-- Extends (target_type, target_id) with created_at DESC so the paged newest-first read is index-backed.
CREATE INDEX idx_reviews_target_created
    ON reviews (target_type, target_id, created_at DESC);

CREATE TABLE help_article_feedback (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug       text NOT NULL,
    lang       text NOT NULL,
    helpful    boolean NOT NULL,
    comment    text,
    user_id    uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    ip_hash    text,
    voter_key  text,
    CONSTRAINT help_article_feedback_lang_check CHECK (lang IN ('en', 'hi', 'mr')),
    CONSTRAINT help_article_feedback_slug_check CHECK (slug ~ '^[a-z0-9-]{1,120}$'),
    CONSTRAINT help_article_feedback_comment_len CHECK (comment IS NULL OR length(comment) <= 500)
);

COMMENT ON TABLE help_article_feedback IS
    'One reader''s current verdict on one help article. A reader is the account when signed in, else '
    'the browser''s anonymous voter id, else the hashed caller IP; voting again replaces the verdict '
    '(and comment) instead of adding a row, so one reader counts once. Erasure removes the row outright.';

COMMENT ON COLUMN help_article_feedback.slug IS
    'The article, by the slug its Markdown file declares. No foreign key is possible -- help content '
    'is compiled into the frontend bundle at build time and has no table here -- so the database '
    'cannot tell a real slug from a typo, and the writer does not pretend to either. Renaming an '
    'article orphans its old rows on purpose: the votes were cast on the article under that name, '
    'and silently carrying them across a rename would attribute one article''s reputation to another. '
    'Shape-constrained even so: this is the key a back-office screen will group and link on, and a '
    'slug that may contain a slash or a quote is one that arrives somewhere as a path or a fragment '
    'of markup later.';

COMMENT ON COLUMN help_article_feedback.lang IS
    'Which translation was on screen. Recorded because an article can be clear in English and '
    'confusing in Marathi, and a single helpful-rate would average those two into a number that '
    'describes neither -- pointing a writer at the English prose when the English prose is fine.';

COMMENT ON COLUMN help_article_feedback.comment IS
    'Optional free text, and the only free text on this table. Null is the common case: the widget '
    'asks for a reason only after a no, and most people who click no do not give one. Never rendered '
    'to another reader -- it is a note to the person who maintains the article, not a public review, '
    'and nothing on the platform reads it back to the public. Stored verbatim, minus the control '
    'characters that break a consumer whatever it is (C0, C1 and the Unicode line separators), '
    'characters: sanitising a reader''s words at write time destroys the evidence, so WHOEVER BUILDS '
    'THE ADMIN SCREEN owns the escaping -- and in particular a CSV or XLSX export must neutralise a '
    'leading =, +, - or @, which is formula injection and is not something React escaping covers. '
    'The reason this row is deleted outright on erasure rather than merely unlinked: these are the '
    'reader''s own words, and the question collects phone numbers from people who could not sign in.';

COMMENT ON COLUMN help_article_feedback.user_id IS
    'Null for signed-out readers, which is most of them -- the help centre is the surface people '
    'reach before they have an account. No foreign key, deliberately: a cascade would tie the row''s '
    'fate to account closure, which is not the same event as an erasure request. ErasureService '
    'deletes these rows outright, unlike page_views, which it only unlinks -- a view is one of '
    'millions and already inside an aggregate naming nobody, whereas a verdict carries the reader''s '
    'own sentence and nothing has been computed from it yet.';

COMMENT ON COLUMN help_article_feedback.created_at IS
    'When the verdict was cast, and load-bearing rather than decorative: an article rewritten in '
    'March is a different article, so a helpful-rate that ignores time describes prose nobody has '
    'read for a year. No retention sweep, unlike page_views -- and that is a decision, not an '
    'oversight. A view is one of millions and worth nothing individually after 90 days; a verdict is '
    'one of a few hundred and is the entire dataset, so expiring it would leave the table empty and '
    'the question unanswerable again. The part that genuinely ages out is the free text, and erasure '
    'already clears that for anyone who asks.';

COMMENT ON COLUMN help_article_feedback.ip_hash IS
    'SHA-256 hash of the caller IP, salted by purpose, used only to enforce the per-article daily feedback cap without storing the address itself.';

COMMENT ON COLUMN help_article_feedback.voter_key IS
    'Who cast the verdict: the user id, or ''b:'' plus the browser''s random voter id, or the ip_hash '
    'fallback. Null only on rows older than this column that had no user or ip_hash.';

CREATE INDEX help_article_feedback_slug_idx ON help_article_feedback (slug, created_at DESC);

CREATE INDEX help_article_feedback_slug_ip_day_idx
    ON help_article_feedback (slug, ip_hash, created_at DESC)
    WHERE ip_hash IS NOT NULL;

CREATE UNIQUE INDEX help_article_feedback_one_vote_idx
    ON help_article_feedback (slug, lang, voter_key);

SELECT install_updated_at_triggers();
