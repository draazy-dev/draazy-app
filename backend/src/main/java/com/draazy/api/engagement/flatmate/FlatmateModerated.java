package com.draazy.api.engagement.flatmate;

/** What a staff verdict touches on a room, a group or a seeker post. */
interface FlatmateModerated {

    String getModStatus();

    void setModStatus(String modStatus);

    ModerationRecheck getRecheck();

    FlatmateExpiry getExpiry();
}
