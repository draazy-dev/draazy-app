package com.draazy.api.leads.photos;

// Unlike contact requests nothing is granted here: resolved and declined are both pure feedback.
public final class PhotoRequestStatuses {

    private PhotoRequestStatuses() {
    }

    /** Asked for, not yet acted on. The only state the owner's badge counts. */
    public static final String PENDING = "pending";

    // Answered rows are kept: they still record that someone wanted more of this listing.
    public static final String RESOLVED = "resolved";

    public static final String DECLINED = "declined";

    public static final String WITHDRAWN = "withdrawn";

    /** The two states an owner may move a request <em>to</em>. {@link #PENDING} is not among them. */
    public static boolean isTerminal(String status) {
        return RESOLVED.equals(status) || DECLINED.equals(status);
    }
}
