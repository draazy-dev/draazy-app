package com.draazy.api.catalog.property;

/** Whether a listing may be live now, or the owner's free tier is already full. */
public interface ListingLiveGate {

    boolean mayGoLive(Property property);
}
