package com.draazy.api.engagement.flatmate;

interface FlatmateModerated {
    String getModStatus();

    void setModStatus(String modStatus);

    ModerationRecheck getRecheck();

    FlatmateExpiry getExpiry();
}
