package com.draazy.api.common.web;

public final class Routes {
    private Routes() {
    }

    public static final class Auth {
        private Auth() {
        }

        public static final String LOGIN = "/auth/login";

        public static final String STAFF_LOGIN = "/auth/staff-login";

        public static final String STAFF_LOGIN_VERIFY = STAFF_LOGIN + "/verify";

        public static final String STAFF_LOGIN_ENROL = STAFF_LOGIN + "/enrol";

        public static final String STAFF_LOGIN_ENROL_CONFIRM = STAFF_LOGIN_ENROL + "/confirm";

        public static final String REFRESH = "/auth/refresh";

        public static final String STAFF_INVITE_REDEEM = "/auth/staff-invite/redeem";

        public static final String LOGOUT = "/auth/logout";

        public static final String ME = "/auth/me";
    }

    public static final class Properties {
        private Properties() {
        }

        public static final String BASE = "/properties";

        public static final String FEATURED = BASE + "/featured";

        public static final String CARDS = BASE + "/cards";

        public static final String SEARCH_INDEX = BASE + "/search-index";

        public static final String COMPARE = BASE + "/compare";

        public static final String REELS = BASE + "/reels";

        public static final String SIMILAR = BASE + "/similar";

        public static final String BY_ID = BASE + "/{id}";

        public static final String ANY_SINGLE = BASE + "/*";

        public static final String ARCHIVE = BY_ID + "/archive";

        public static final String RESTORE = BY_ID + "/restore";

        public static final String SPLIT = BY_ID + "/split";
    }

    public static final class Owners {
        private Owners() {
        }

        public static final String BY_ID = "/owners/{id}";

        // Single-segment on purpose: ** would make a future deeper owner route
        // public before anyone decided it should be.
        public static final String ANY_SINGLE = "/owners/*";
    }

    public static final class Cities {
        private Cities() {
        }

        public static final String WAITLIST = "/cities/waitlist";
    }

    public static final class Localities {
        private Localities() {
        }

        public static final String BASE = "/localities";

        public static final String ADMIN = "/admin/localities";

        public static final String ADMIN_RETIRE = ADMIN + "/{slug}/retire";

        public static final String ADMIN_RESTORE = ADMIN + "/{slug}/restore";

        public static final String RESOLVE = BASE + "/resolve";

        public static final String SEARCH = BASE + "/search";

        public static final String BY_SLUG = BASE + "/{slug}";

        public static final String ANY_SINGLE = BASE + "/*";
    }

    public static final class Societies {
        private Societies() {
        }

        public static final String BASE = "/societies";

        public static final String RESOLVE = BASE + "/resolve";

        public static final String TOP = BASE + "/top";

        public static final String BY_SLUG = BASE + "/{slug}";

        public static final String BRIEF = BY_SLUG + "/brief";

        public static final String ANY_SINGLE = BASE + "/*";

        public static final String ANY_BRIEF = BASE + "/*/brief";
    }

    public static final class SocietyCandidates {
        private SocietyCandidates() {
        }

        public static final String BASE = "/admin/society-candidates";

        public static final String DUPLICATES_BATCH = BASE + "/duplicates";

        public static final String DUPLICATES = BASE + "/{slug}/duplicates";
    }

    public static final class SocietyMerges {
        private SocietyMerges() {
        }

        public static final String BASE = "/admin/society-merges";

        public static final String BY_SLUG = BASE + "/{slug}";
    }

    public static final class AdminSocieties {
        private AdminSocieties() {
        }

        public static final String BASE = "/admin/societies";

        public static final String SUMMARY = BASE + "/summary";

        public static final String BY_SLUG = "/admin/societies/{slug}";
    }

    public static final class Fees {
        private Fees() {
        }

        public static final String BASE = "/fees";
    }

    public static final class Bootstrap {
        private Bootstrap() {
        }

        public static final String BASE = "/bootstrap";

        public static final String ME = "/me/bootstrap";

        public static final String ME_DASHBOARD = "/me/dashboard";
    }

    public static final class MeListings {
        private MeListings() {
        }

        public static final String BASE = "/me/listings";

        public static final String BY_ID = BASE + "/{id}";

        public static final String CARD = BY_ID + "/card";

        public static final String CONFIRM_AVAILABLE = BY_ID + "/confirm-available";

        public static final String PAUSE = BY_ID + "/pause";

        public static final String RESUME = BY_ID + "/resume";

        public static final String DUPLICATE_CHECK = BASE + "/duplicate-check";

        public static final String QUOTA = BASE + "/quota";
    }

    public static final class MeManagedProperties {
        private MeManagedProperties() {
        }

        public static final String BASE = "/me/managed-properties";

        public static final String BY_ID = BASE + "/{id}";

        public static final String PUBLISH = BASE + "/{id}/publish";

        public static final String LISTING = BASE + "/{id}/listing";

        public static final String RENT_RECEIPTS = BY_ID + "/rent-receipts";

        public static final String RENT_TRACKING = BY_ID + "/rent-tracking";

        public static final String RENT_CLAIM = BY_ID + "/rent-claims/{month}";

        public static final String TRACKED_RENT = "/me/tracked-rent";

        public static final String TRACKED_RENT_PAID = TRACKED_RENT + "/{id}/paid";
    }

    public static final class MePhotos {
        private MePhotos() {
        }

        public static final String BASE = "/me/photos";

        public static final long MAX_FILE_BYTES = 1_000_000L;
    }

    public static final class PropertyPhotoRequests {
        private PropertyPhotoRequests() {
        }

        public static final String BASE = Properties.BY_ID + "/photo-requests";
    }

    public static final class MePhotoRequests {
        private MePhotoRequests() {
        }

        public static final String BASE = "/me/photo-requests";

        public static final String BY_ID = BASE + "/{reqId}";
    }

    public static final class MeLeadNotes {
        private MeLeadNotes() {
        }

        public static final String BASE = "/me/lead-notes";

        public static final String BY_KEY = BASE + "/{leadKey}";
    }

    public static final class Contacts {
        private Contacts() {
        }

        private static final String BASE = "/contacts";

        public static final String STATUS = BASE + "/status";

        public static final String REQUEST = BASE + "/request";
    }

    public static final class MeRequests {
        private MeRequests() {
        }

        public static final String BASE = "/me/requests";

        public static final String PENDING_COUNT = BASE + "/pending-count";

        public static final String BY_ID = BASE + "/{kind}/{id}";

        public static final String REMINDERS = BY_ID + "/reminders";
    }

    public static final class MeContactRequests {
        private MeContactRequests() {
        }

        public static final String BASE = "/me/contact-requests";

        public static final String BY_ID = BASE + "/{reqId}";
    }

    public static final class Conversations {
        private Conversations() {
        }

        public static final String BASE = "/messages";

        public static final String UNREAD_COUNT = BASE + "/unread-count";

        public static final String STREAM = BASE + "/stream";

        public static final String BY_ID = BASE + "/{id}";

        public static final String REPLY = BY_ID + "/reply";

        public static final String PHOTOS = BY_ID + "/photos";

        public static final String READ = BY_ID + "/read";

        public static final String TYPING = BY_ID + "/typing";

        public static final String STATE = BY_ID + "/state";

        public static final String ITEM = BY_ID + "/items/{messageId}";

        public static final String BLOCK = BY_ID + "/block";

        public static final String FLATMATE_GROUP = BASE + "/flatmate-groups/{groupId}";

        public static final String FLATMATE_REQUEST = BASE + "/flatmate-requests/{requestId}";

        public static final String LEAD_REQUEST = BASE + "/requests/{kind}/{requestId}";
    }

    public static final class SupportTickets {
        private SupportTickets() {
        }

        public static final String BASE = "/support/tickets";

        public static final String BY_ID = BASE + "/{id}";

        public static final String MESSAGES = BY_ID + "/messages";

        public static final String READ = BY_ID + "/read";

        public static final String CLOSE = BY_ID + "/close";
    }

    public static final class Offers {
        private Offers() {
        }

        public static final String BASE = "/offers";

        public static final String MINE = BASE + "/mine";

        public static final String RESPOND = BASE + "/{id}/respond";

        public static final String ME = "/me/offers";
    }

    public static final class Deals {
        private Deals() {
        }

        public static final String BASE = "/me/deals";

        public static final String BY_PROP = BASE + "/{propId}";

        public static final String RESERVE = BY_PROP + "/reserve";

        public static final String CLOSE = BY_PROP + "/close";

        public static final String REOPEN = BY_PROP + "/reopen";

        public static final String PARTIES = BY_PROP + "/parties";
    }

    public static final class Finalization {
        private Finalization() {
        }

        public static final String REQUEST = "/finalization/{propId}/request";

        public static final String STATUS = "/finalization/{propId}/status";

        public static final String ME_REQUESTS = "/me/finalization-requests";

        public static final String ACCEPT = "/finalization/requests/{reqId}/accept";

        public static final String DECLINE = "/finalization/requests/{reqId}/decline";
    }

    public static final class Visits {
        private Visits() {
        }

        public static final String BASE = "/visits";

        public static final String ME_REQUESTS = "/me/visit-requests";

        public static final String STATUS = "/visit-requests/{id}/status";

        public static final String SLOT = BASE + "/{id}/slot";
    }

    public static final class Verification {
        private Verification() {
        }

        public static final String IDENTITY = "/me/verification/identity";

        public static final String IDENTITY_DISPUTE = IDENTITY + "/dispute";

        public static final String IDENTITY_APPEAL = IDENTITY + "/appeal";

        public static final String IDENTITY_CHALLENGE = IDENTITY + "/challenge";

        public static final String IDENTITY_SIMULATE = IDENTITY + "/simulate";
    }

    public static final class DevStorage {
        private DevStorage() {
        }

        public static final String OBJECT = "/dev/storage/{*key}";

        public static final String ANY = "/dev/storage/**";
    }

    public static final class Finances {
        private Finances() {
        }

        private static final String BASE = "/me/finances/{propId}";

        public static final String TRANSACTIONS = BASE + "/transactions";

        public static final String TRANSACTION_BY_ID = TRANSACTIONS + "/{txnId}";

        public static final String BASIS = BASE + "/basis";

        public static final String SUMMARY = BASE + "/summary";

        public static final String OVERVIEW = BASE + "/overview";
    }

    public static final class Rentals {
        private Rentals() {
        }

        public static final String MINE = "/me/rentals";

        public static final String BY_ID = MINE + "/{rentalId}";
    }

    public static final class Tenancies {
        private Tenancies() {
        }

        public static final String MINE = "/me/tenancies";

        public static final String CONFIRM = MINE + "/{id}/confirm";

        public static final String DECLINE = MINE + "/{id}/decline";

        public static final String MY_PROFILE = "/me/tenant-profile";

        public static final String PROFILES_VERIFIED = "/tenant-profiles/verified";

        public static final String DECLARATIONS = "/properties/{propId}/tenancy-declarations";

        public static final String DECLARATION_CONFIRM = "/tenancy-declarations/{id}/confirm";

        public static final String DECLARATION_REVOKE = "/tenancy-declarations/{id}/revoke";
    }

    public static final class Engagement {
        private Engagement() {
        }

        public static final String SAVED = "/me/saved";

        public static final String SAVED_BY_PROPERTY = SAVED + "/{propId}";

        public static final String SAVED_KEYS = SAVED + "/keys";

        public static final String FLATMATE_SAVES = "/me/flatmate-saves";

        public static final String FLATMATE_SAVE_KEYS = FLATMATE_SAVES + "/keys";

        public static final String FLATMATE_SAVE_BY_ID = FLATMATE_SAVES + "/{kind}/{id}";

        public static final String SOCIETY_FOLLOW = "/me/societies/{slug}/follow";

        public static final String SOCIETIES_FOLLOWING = "/me/societies/following";

        public static final String SAVED_SEARCHES = "/me/saved-searches";

        public static final String SAVED_SEARCH_BY_ID = SAVED_SEARCHES + "/{id}";

        public static final String RECENT_SEARCHES = "/me/recent-searches";

        public static final String NOTIFICATIONS = "/notifications";

        public static final String NOTIFICATIONS_READ = NOTIFICATIONS + "/read";

        public static final String NOTIFICATIONS_UNREAD_COUNT = NOTIFICATIONS + "/unread-count";

        public static final String NOTIFICATIONS_DISMISS = NOTIFICATIONS + "/dismiss";

        public static final String NOTIFICATION_BY_ID = NOTIFICATIONS + "/{id}";

        public static final String NOTIFICATION_PREFERENCES = "/me/notification-preferences";

        public static final String PUSH_SUBSCRIPTIONS = "/me/push-subscriptions";

        public static final String LIVING_STYLE = "/me/living-style";
    }

    public static final class Flatmates {
        private Flatmates() {
        }

        public static final String POSTS = "/flatmates/posts";

        public static final String POST_BY_ID = POSTS + "/{id}";

        public static final String POST_INTEREST = POST_BY_ID + "/interest";

        public static final String MY_POSTS = "/me/flatmate-posts";

        public static final String MY_POST_BY_ID = MY_POSTS + "/{id}";

        public static final String MY_REQUESTS = "/me/flatmate-requests";

        public static final String MY_REQUEST_BY_ID = MY_REQUESTS + "/{id}";

        public static final String MY_INTERESTS = "/me/flatmate-interests";

        public static final String MY_INTEREST_KEYS = MY_INTERESTS + "/keys";

        public static final String INTEREST_BY_TARGET = "/flatmates/{kind}/{id}/interest";

        public static final String RENEW = "/flatmates/{kind}/{id}/renew";

        public static final String FEED = "/flatmates/feed";

        public static final String LIVING_STYLE = "/flatmates/{kind}/{id}/living-style";

        public static final String ROOMS = "/flatmates/rooms";

        public static final String ROOM_BY_ID = ROOMS + "/{id}";

        public static final String ROOM_SEATS = ROOMS + "/{id}/seats";

        public static final String ROOM_BADGE_REQUEST = ROOMS + "/{id}/badge-request";

        public static final String ROOM_OCCUPANTS = ROOMS + "/{id}/occupants";

        public static final String ROOM_INTEREST = ROOMS + "/{id}/interest";

        public static final String GROUPS = "/flatmates/groups";

        public static final String GROUP_BADGE_REQUEST = GROUPS + "/{id}/badge-request";

        public static final String GROUP_BY_ID = GROUPS + "/{id}";

        public static final String GROUP_SEATS = GROUP_BY_ID + "/seats";

        public static final String OWNER_CONSENT = "/flatmates/owner-consent";

        public static final String OWNER_NOTICE = "/flatmates/owner-notice";

        public static final String OWNER_NOTICE_ANSWER = OWNER_NOTICE + "/answer";

        public static final String GROUP_JOIN = GROUP_BY_ID + "/join";

        public static final String GROUP_MEMBERSHIP = GROUP_BY_ID + "/membership";

        public static final String GROUP_MEMBER = GROUP_BY_ID + "/members/{memberId}";

        public static final String MY_GROUPS = "/me/flatmate-groups";

        public static final String MY_ROOMS = "/me/flatmate-rooms";

        public static final String OWNER_HOMES = "/me/owner-homes";

        public static final String OWNER_HOME_PREFILL = OWNER_HOMES + "/{managedId}/prefill";

        public static final String GROUP_APPLY = GROUP_BY_ID + "/apply";

        public static final String MY_GROUP_APPLICATIONS = "/me/group-applications";

        public static final String MY_GROUP_APPLICATION_BY_ID = MY_GROUP_APPLICATIONS + "/{id}";

        public static final String MY_REVIEWS = "/me/flatmate-reviews";

        public static final String CASE = "/flatmates/{kind}/{id}/verification";

        public static final String CASE_MESSAGES = CASE + "/messages";

        public static final String CASE_READ = CASE + "/read";
    }

    public static final class Reviews {
        private Reviews() {
        }

        public static final String FOR_PROPERTY = "/properties/{propId}/reviews";

        public static final String FOR_ENTITY = "/reviews/{entityType}/{entityId}";

        public static final String BY_ID = "/reviews/{id}";
    }

    public static final class Content {
        private Content() {
        }

        public static final String FAQS = "/faqs";
    }

    public static final class MeDocuments {
        private MeDocuments() {
        }

        private static final String BASE = "/me/documents";

        public static final String FOR_PROPERTY = BASE + "/{propId}";

        public static final String BY_ID = BASE + "/{propId}/{docId}";

        public static final String URL = BASE + "/{docId}/url";

        public static final String PERSONAL = BASE + "/personal";

        public static final String PERSONAL_BY_ID = PERSONAL + "/{docId}";

        public static final String FOR_MANAGED = BASE + "/managed/{managedId}";

        public static final String MANAGED_BY_ID = FOR_MANAGED + "/{docId}";

        public static final String REQUESTS = BASE + "/requests";

        public static final String REQUEST_BY_ID = REQUESTS + "/{reqId}";
    }

    public static final class Documents {
        private Documents() {
        }

        private static final String BASE = "/documents";

        public static final String REQUESTS = BASE + "/requests";

        public static final String SHARED = BASE + "/shared";

        public static final String SHARED_URL = SHARED + "/url";
    }

    public static final class MeDocumentRequests {
        private MeDocumentRequests() {
        }

        public static final String BASE = "/me/document-requests";

        public static final String DOCUMENTS_BY_ID = BASE + "/{reqId}/documents";

        public static final String DOCUMENT_URL = DOCUMENTS_BY_ID + "/{docId}/url";
    }

    public static final class MeRentAgreements {
        private MeRentAgreements() {
        }

        public static final String BASE = "/me/rent-agreements";

        public static final String RENEWAL = BASE + "/{id}/renewal";

        public static final String HOME_RENEWAL = BASE + "/homes/{homeId}/renewal";
    }

    public static final class ServiceRequests {
        private ServiceRequests() {
        }

        public static final String BASE = "/service-requests";

        public static final String QUEUE_SUMMARY = BASE + "/queue-summary";

        public static final String QUEUE = BASE + "/queue";

        public static final String BY_ID = BASE + "/{id}";

        public static final String DOC_URL = BY_ID + "/docs/{docId}/url";

        public static final String CO_FILL_CREATE = BASE + "/co-fill";

        public static final String DETAILS = BY_ID + "/details";

        public static final String STATUS = BY_ID + "/status";

        public static final String MESSAGES = BY_ID + "/messages";

        public static final String DOCS = BY_ID + "/docs";

        public static final String DOCS_FROM_VAULT = DOCS + "/from-vault";

        public static final String CHECKLIST = BY_ID + "/checklist";
        public static final String CHECKLIST_ITEM = CHECKLIST + "/{category}";

        public static final String IDENTITIES = BY_ID + "/identities";
        public static final String MASKED_IDENTITIES = IDENTITIES + "/masked";

        public static final String DRAFT = BY_ID + "/draft";

        public static final String DRAFT_DECISION = DRAFT + "/decision";

        public static final String DRAFT_OTP = DRAFT + "/otp";

        public static final String DRAFT_OPENED = DRAFT + "/opened";

        public static final String FINAL_DOC = BY_ID + "/final-doc";

        public static final String RENT_AGREEMENTS = BY_ID + "/rent-agreements";

        public static final String OVERLAPS = BY_ID + "/overlaps";

        public static final String AMENDMENTS = BY_ID + "/amendments";
        public static final String AMENDMENT_ACCEPT = AMENDMENTS + "/{amendmentId}/accept";
        public static final String AMENDMENT_WITHDRAW = AMENDMENTS + "/{amendmentId}/withdraw";

        public static final String ATTENTION = BY_ID + "/attention";
        public static final String ATTENTION_RESOLVE = ATTENTION + "/resolve";
        public static final String DESK_DETAILS = BY_ID + "/desk-details";
        public static final String DESK_IDENTITIES = BY_ID + "/desk-identities";

        public static final String REFUNDS = BY_ID + "/refunds";
        public static final String REFUND_APPROVE = REFUNDS + "/{refundId}/approve";
        public static final String REFUND_REJECT = REFUNDS + "/{refundId}/reject";

        public static final String POLICE_INTIMATION = BY_ID + "/police-intimation";

        public static final String PARTIES = BY_ID + "/parties";

        public static final String PARTY_BY_ID = PARTIES + "/{partyId}";

        public static final String PARTY_DETAILS = BY_ID + "/party-details";

        public static final String CHECKOUT = BY_ID + "/checkout";

        public static final String PAYMENT_SIMULATE = BY_ID + "/payment/simulate";

        public static final String READ = BY_ID + "/read";

        public static final String MY_INVITES = "/me/service-request-invites";

        public static final String INVITE_DECISION = MY_INVITES + "/{partyId}";
    }

    public static final class Plans {
        private Plans() {
        }

        public static final String SUBSCRIPTION = "/me/subscription";
        public static final String CANCEL_SUBSCRIPTION = SUBSCRIPTION + "/cancel";
        public static final String ORDER_STATUS = SUBSCRIPTION + "/orders/{orderId}";

        public static final String ENTITLEMENTS = "/me/entitlements";
    }

    public static final class Referrals {
        private Referrals() {
        }

        public static final String BASE = "/referrals";

        public static final String MINE = "/me/referrals";

        public static final String REDEEM = BASE + "/redeem";

        public static final String APPROVE = BASE + "/{id}/approve";

        public static final String REJECT = BASE + "/{id}/reject";

        public static final String CLAWBACK = BASE + "/{id}/clawback";
    }

    public static final class Tickets {
        private Tickets() {
        }

        public static final String BASE = "/tickets";

        public static final String BY_ID = BASE + "/{id}";

        public static final String SUMMARY = BASE + "/summary";

        public static final String NOTES = BY_ID + "/notes";
    }

    public static final class ServiceWaitlist {
        private ServiceWaitlist() {
        }

        public static final String BASE = "/service-waitlist";
    }

    public static final class Moderation {
        private Moderation() {
        }

        public static final String PROPERTY_STATUS = Properties.BY_ID + "/status";

        public static final String PROPERTY_FLAG = Properties.BY_ID + "/flag";

        public static final String PROPERTY_ADMIN_UPDATE = Properties.BY_ID + "/admin";

        public static final String PROPERTY_PHOTO_TAKEDOWN = Properties.BY_ID + "/photos/takedown";

        public static final String PROPERTY_RERA_CHECK = Properties.BY_ID + "/rera-check";

        public static final String PROPERTY_VERIFICATION = Properties.BY_ID + "/verification";

        public static final String VERIFICATION_MESSAGES = PROPERTY_VERIFICATION + "/messages";

        public static final String VERIFICATION_READ = PROPERTY_VERIFICATION + "/read";

        public static final String VERIFICATION_DECISION = PROPERTY_VERIFICATION + "/decision";

        public static final String VERIFICATION_CHECKLIST = PROPERTY_VERIFICATION + "/checklist";

        public static final String VERIFICATION_OWNERSHIP = PROPERTY_VERIFICATION + "/ownership";

        public static final String VERIFICATION_OWNERSHIP_EVIDENCE = VERIFICATION_OWNERSHIP + "/evidence";

        public static final String VERIFICATION_OWNERSHIP_DOCUMENTS = VERIFICATION_OWNERSHIP + "/documents";

        public static final String VERIFICATION_OWNERSHIP_DOCUMENT_URL =
                VERIFICATION_OWNERSHIP_DOCUMENTS + "/{docId}/url";

        public static final String VERIFICATION_OWNERSHIP_REQUEST = VERIFICATION_OWNERSHIP + "/request";

        public static final String VERIFICATION_OWNERSHIP_DECLINE = VERIFICATION_OWNERSHIP + "/decline";

        public static final String ME_PROPERTY_REVIEWS = "/me/property-reviews";

        public static final String REPORTS = "/reports";

        public static final String REPORT_BY_ID = REPORTS + "/{id}";

        public static final String REVIEW_STATUS = "/reviews/{id}/status";

        public static final String NOTES_FOR_ENTITY = "/admin/notes/{entityType}/{entityId}";

        public static final String ADMIN_REVIEWS = "/admin/reviews";

        public static final String ADMIN_PROPERTIES = "/admin/properties";

        public static final String ADMIN_PROPERTY = ADMIN_PROPERTIES + "/{id}";

        public static final String ADMIN_PROPERTIES_SUMMARY = ADMIN_PROPERTIES + "/summary";

        public static final String ADMIN_PROPERTIES_OWNER_STANDING =
                ADMIN_PROPERTIES + "/owner-standing";

        public static final String ADMIN_PROPERTIES_LOOKUP = ADMIN_PROPERTIES + "/lookup";
        public static final String ADMIN_PROPERTIES_DUPLICATES = ADMIN_PROPERTIES + "/duplicates";

        public static final String ADMIN_PROPERTIES_DUPLICATES_MERGE =
                ADMIN_PROPERTIES_DUPLICATES + "/merge";

        public static final String ADMIN_PROPERTIES_DUPLICATES_DISMISS =
                ADMIN_PROPERTIES_DUPLICATES + "/dismiss";

        public static final String PROPERTY_OUTREACH = Properties.BY_ID + "/outreach";

        public static final String PROPERTY_OUTREACH_SENT = PROPERTY_OUTREACH + "/{messageId}/sent";

        public static final String ADMIN_ENQUIRIES = "/admin/enquiries";

        public static final String ADMIN_VISITS = "/admin/visits";

        public static final String ADMIN_DEALS = "/admin/deals";

        public static final String ADMIN_ENQUIRIES_SUMMARY = ADMIN_ENQUIRIES + "/summary";
        public static final String ADMIN_ENQUIRY_BY_ID = ADMIN_ENQUIRIES + "/{id}";

        public static final String ADMIN_VISIT_BY_ID = ADMIN_VISITS + "/{id}";

        public static final String ADMIN_DEAL_BY_ID = ADMIN_DEALS + "/{id}";

        public static final String FLATMATE_REVIEWS = "/admin/flatmate-reviews";

        public static final String FLATMATE_REVIEW_BY_ID = FLATMATE_REVIEWS + "/{id}";

        public static final String FLATMATE_REVIEW_DOCUMENT_URL = FLATMATE_REVIEW_BY_ID + "/document-url";

        public static final String FLATMATE_REVIEW_REVOKE = FLATMATE_REVIEW_BY_ID + "/revoke";

        public static final String RENT_AGREEMENT_BY_ID = "/admin/rent-agreements/{id}";

        public static final String IDENTITY_REVIEWS = "/moderation/identity-reviews";

        public static final String IDENTITY_REVIEW_SUMMARY = IDENTITY_REVIEWS + "/summary";

        public static final String IDENTITY_REVIEW_BY_ID = IDENTITY_REVIEWS + "/{id}";

        public static final String IDENTITY_REVIEW_APPROVE = IDENTITY_REVIEW_BY_ID + "/approve";

        public static final String IDENTITY_REVIEW_REJECT = IDENTITY_REVIEW_BY_ID + "/reject";

        public static final String IDENTITY_REVIEW_REVOKE = IDENTITY_REVIEW_BY_ID + "/revoke";

        public static final String IDENTITY_REVIEW_APPEAL_UPHOLD = IDENTITY_REVIEW_BY_ID + "/appeal/uphold";

        public static final String IDENTITY_REVIEW_APPEAL_REOPEN = IDENTITY_REVIEW_BY_ID + "/appeal/reopen";

        public static final String FLATMATE_MODERATION = "/admin/flatmates/{id}/moderation";

        public static final String FLATMATE_MODERATION_CHECKLIST = FLATMATE_MODERATION + "/checklist";

        public static final String FLATMATE_MODERATION_QUEUE = "/admin/flatmates/moderation";

        public static final String FLATMATE_MODERATION_SUMMARY = FLATMATE_MODERATION_QUEUE + "/summary";

        public static final String FLATMATE_MODERATION_DETAIL = "/admin/flatmates/{id}";

        public static final String GROUP_APPLICATIONS = "/admin/group-applications";

        public static final String GROUP_APPLICATION_BY_ID = GROUP_APPLICATIONS + "/{id}";
    }

    public static final class Users {
        private Users() {
        }

        public static final String BASE = "/users";

        public static final String BY_ID = BASE + "/{id}";

        public static final String KYC_PROFILE = BY_ID + "/kyc-profile";

        public static final String ARCHIVE = BY_ID + "/archive";

        public static final String RESTORE = BY_ID + "/restore";

        public static final String SUSPEND = BY_ID + "/suspend";

        public static final String REACTIVATE = BY_ID + "/reactivate";

        public static final String BADGE = BY_ID + "/badge";

        public static final String FLAG = BY_ID + "/flag";

        public static final String TIMELINE = BY_ID + "/timeline";

        public static final String STAFF = BASE + "/staff";

        public static final String REISSUE_INVITE = BY_ID + "/reissue-invite";

        public static final String RESET_TWO_FACTOR = BY_ID + "/reset-2fa";

        public static final String PERMISSIONS = BY_ID + "/permissions";
    }

    public static final class Admin {
        private Admin() {
        }

        public static final String AUDIT_LOG = "/admin/audit-log";

        public static final String ERROR_LOG = "/admin/error-log";

        public static final String ERROR_LOG_BY_ID = ERROR_LOG + "/{id}";

        public static final String ERROR_LOG_RESOLVE = ERROR_LOG_BY_ID + "/resolve";

        public static final String STAFF_ACTIVITY = "/admin/staff-activity";

        public static final String STAFF_ACTIVITY_SUMMARY = STAFF_ACTIVITY + "/summary";

        public static final String TEAM_PERFORMANCE = "/admin/team-performance";

        public static final String MY_WORK = "/admin/my-work";

        public static final String DASHBOARD = "/admin/dashboard";

        public static final String BELL = "/admin/bell";

        public static final String SUPPLY_GAP = "/admin/supply-gap";

        public static final String ANALYTICS_PRICING = "/admin/analytics/pricing";

        public static final String ANALYTICS_SLA = "/admin/analytics/sla";

        public static final String ANALYTICS_TRAFFIC = "/admin/analytics/traffic";

        public static final String ANALYTICS_ENGAGEMENT = "/admin/analytics/engagement";

        public static final String ANALYTICS_SURFERS = "/admin/analytics/surfers";

        public static final String ANALYTICS_FUNNEL = "/admin/analytics/funnel";
        public static final String ANALYTICS_FLATMATES = "/admin/analytics/flatmates";

        public static final String SUPPORT_TICKETS = "/admin/support-tickets";

        public static final String FINANCE = "/admin/finance";

        public static final String FINANCE_SERIES = FINANCE + "/series";

        public static final String FINANCE_TRANSACTIONS = FINANCE + "/transactions";

        public static final String SETTINGS = "/admin/settings";
        public static final String SETTINGS_FLAGS = SETTINGS + "/flags";

        public static final String INTEGRATIONS = "/admin/integrations";

        public static final String INTEGRATION_CALLS = INTEGRATIONS + "/calls";

        public static final String HELP_FEEDBACK = "/admin/help-feedback";

        public static final String HELP_FEEDBACK_COMMENTS = HELP_FEEDBACK + "/comments";

        public static final String HELP_STAFF = "/admin/help/staff";

        public static final String HELP_STAFF_INDEX = HELP_STAFF + "/index";

        public static final String CITY_BY_SLUG = "/admin/cities/{slug}";

        public static final String CITY_WAITLIST = "/admin/cities/waitlist";

        public static final String FUNCTION_CATALOGUE = "/admin/function-catalogue";

        public static final String TEAM = "/admin/team";

        public static final String TEAM_ASSIGNEES = TEAM + "/assignees";

        public static final String MESSAGE_TEMPLATES = "/admin/message-templates";

        public static final String CONTENT = "/admin/content/{type}";

        public static final String CONTENT_ITEM = CONTENT + "/{id}";

        public static final String CONTENT_ARCHIVE = CONTENT_ITEM + "/archive";

        public static final String CONTENT_RESTORE = CONTENT_ITEM + "/restore";
    }

    public static final class DemandSignals {
        private DemandSignals() {
        }

        public static final String BASE = "/demand-signals";
    }

    public static final class PageViews {
        private PageViews() {
        }

        public static final String BASE = "/page-views";
    }

    public static final class ClientErrors {
        private ClientErrors() {
        }

        public static final String BASE = "/client-errors";
    }

    public static final class HelpFeedback {
        private HelpFeedback() {
        }

        public static final String BASE = "/help/feedback";
    }

    public static final class Refunds {
        private Refunds() {
        }

        public static final String MY_PAYMENTS = "/me/payments";

        public static final String MY_REFUND = MY_PAYMENTS + "/{id}/refund";

        public static final String DESK = "/admin/refunds";

        public static final String APPROVE = DESK + "/{id}/approve";

        public static final String REJECT = DESK + "/{id}/reject";
    }

    public static final class Leads {
        private Leads() {
        }

        public static final String BASE = "/admin/leads";

        public static final String BY_ID = BASE + "/{id}";

        public static final String CLAIM = BY_ID + "/claim";

        public static final String RELEASE = BY_ID + "/release";

        public static final String ASSIGN = BY_ID + "/assign";

        public static final String ASSIGNEES = BASE + "/assignees";

        public static final String CONTACTS = BY_ID + "/contacts";

        public static final String STAGE = BY_ID + "/stage";

        public static final String INTERESTS = BY_ID + "/interests";

        public static final String PROFILE = BY_ID + "/profile";

        public static final String NOTES = BY_ID + "/notes";

        public static final String CONVERTIBLE = BY_ID + "/convertible";

        public static final String CONVERSIONS = BY_ID + "/conversions";

        public static final String CONVERSION = BASE + "/conversions/{conversionId}";

        public static final String PERFORMANCE = BASE + "/performance";
    }

    public static final class Webhooks {
        private Webhooks() {
        }

        // Public webhook: signature-verified, deduped on order id, always 200 so the gateway stops retrying.
        public static final String CASHFREE_PAYMENT = "/webhooks/cashfree/payment";

        public static final String WHATSAPP = "/webhooks/whatsapp";

        public static final String ZEPTOMAIL = "/webhooks/zeptomail";
    }
}
