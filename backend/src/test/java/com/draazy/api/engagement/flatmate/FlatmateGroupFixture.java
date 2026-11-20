package com.draazy.api.engagement.flatmate;

public final class FlatmateGroupFixture {

    public static String hunting(String title, String locality, String policy, int rentMax, int seats,
            int seatsOpen) {
        return """
                {"title":"%s","policy":"%s","seats":%d,"seatsOpen":%d,"name":"Host",
                 "preferences":{"localities":["%s"],"bhk":["2"],"rentMin":%d,"rentMax":%d,
                   "depositMin":0,"depositMax":%d,"gatedOnly":false,"bachelors":false}}
                """.formatted(title, policy, seats, seatsOpen, locality, rentMax / 2, rentMax, rentMax * 3);
    }

    public static String hunting(String title, String locality, String policy) {
        return hunting(title, locality, policy, 30000, 3, 2);
    }

    private FlatmateGroupFixture() {
    }
}
