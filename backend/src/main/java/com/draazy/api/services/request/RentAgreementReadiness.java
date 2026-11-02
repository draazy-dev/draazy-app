package com.draazy.api.services.request;

import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.ErrorCodes;
import com.draazy.api.documents.vault.DocumentRepository;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

@Component
class RentAgreementReadiness {
    private static final int NAMED_AT_MOST = 6;
    private static final Set<String> PERSON_PAPERS = Set.of("pan", "aadhaar", "passport", "visa", "photo");

    private static final Set<String> RESIDENTIAL =
            Set.of("Flat / Apartment", "Independent House / Bungalow", "Row House");

    private static final Pattern INDEXED = Pattern.compile("(?:licensor|tenant)-(0|[1-9]\\d{0,2})-[a-z]+");
    private static final Pattern INDEXED_LOOKING = Pattern.compile("(?:licensor|tenant)-\\d");

    static String canonical(String category) {
        return category == null ? "" : category.strip().toLowerCase(Locale.ROOT);
    }

    static String sideOf(String category) {
        String c = canonical(category);
        if (c.startsWith("licensor-") || "ownership-proof".equals(c)) {
            return "owner";
        }
        return c.startsWith("tenant-") ? "tenant" : null;
    }

    static String identityScanSide(String category) {
        String c = canonical(category);
        return PERSON_PAPERS.stream().anyMatch(paper -> c.endsWith("-" + paper)) ? sideOf(c) : null;
    }

    static int partyIndex(String category) {
        String c = canonical(category);
        Matcher indexed = INDEXED.matcher(c);
        if (indexed.matches()) {
            return Integer.parseInt(indexed.group(1));
        }
        if (INDEXED_LOOKING.matcher(c).lookingAt()) {
            throw new BadRequestException("'" + c + "' is not a valid document category.");
        }
        return 0;
    }

    static boolean isIdentityScanFor(String category, String side, int index) {
        if (!side.equals(identityScanSide(category))) {
            return false;
        }
        Matcher indexed = INDEXED.matcher(canonical(category));
        return (indexed.matches() ? Integer.parseInt(indexed.group(1)) : 0) == index;
    }

    private final ServiceRequestIdentityRepository identities;
    private final DocumentRepository documents;
    private final RentAgreementOwnerSide ownerSide;

    RentAgreementReadiness(ServiceRequestIdentityRepository identities, DocumentRepository documents,
            RentAgreementOwnerSide ownerSide) {
        this.identities = identities;
        this.documents = documents;
        this.ownerSide = ownerSide;
    }

    private static final Set<ServiceRequestStatus> BEFORE_DRAFT = Set.of(ServiceRequestStatus.AWAITING_PAYMENT,
            ServiceRequestStatus.NEW, ServiceRequestStatus.ASSIGNED, ServiceRequestStatus.IN_PROGRESS);

    static boolean tenantFillsLater(ServiceRequest request) {
        if (!ServiceRequestTypes.RENT_AGREEMENT.equals(request.getType())) {
            return false;
        }
        Map<String, Object> state = ServiceRequestPricing.childObject(request.getDetails() == null
                ? Map.of() : request.getDetails(), "_state");
        return "invite".equals(String.valueOf(state.get("tenantMode")))
                && !"invite".equals(String.valueOf(state.get("ownerMode")));
    }

    static boolean ownerHoldsAll(ServiceRequest request) {
        if (!ServiceRequestTypes.RENT_AGREEMENT.equals(request.getType())) {
            return false;
        }
        Map<String, Object> state = ServiceRequestPricing.childObject(request.getDetails() == null
                ? Map.of() : request.getDetails(), "_state");
        return "fill".equals(String.valueOf(state.get("tenantMode")))
                && !"invite".equals(String.valueOf(state.get("ownerMode")));
    }

    static boolean tenantCanStillFill(ServiceRequest request) {
        return tenantFillsLater(request) && BEFORE_DRAFT.contains(request.getStatus());
    }

    // Once staff pick a case up, only a tenant invited to fill in after payment may still finish their side.
    boolean sideEditable(ServiceRequest request, boolean requester, String side) {
        boolean tenantLater = !requester && "tenant".equals(side) && tenantFillsLater(request);
        return switch (request.getStatus()) {
            case AWAITING_PAYMENT -> requester || request.getPaymentRef() == null || tenantLater;
            case NEW -> ServiceRequestTypes.RENT_AGREEMENT.equals(request.getType());
            case ASSIGNED, IN_PROGRESS -> tenantLater && waitingOnTenant(request);
            default -> false;
        };
    }

    static ConflictException editLocked(ServiceRequest request) {
        return new ConflictException(request.getStatus() == ServiceRequestStatus.AWAITING_PAYMENT
                ? "Checkout is already open for this request. Ask the requester to reopen it if edits are needed."
                : "Our team has started on this agreement. Message our team on the request to change your details.");
    }

    void require(ServiceRequest request) {
        if (!ServiceRequestTypes.RENT_AGREEMENT.equals(request.getType())) {
            return;
        }
        requireOwnerSide(request);
        boolean tenantLater = tenantFillsLater(request);
        List<String> missingDocuments = missingDocumentItems(request).entrySet().stream()
                .filter(item -> !tenantLater || !"tenant".equals(sideOf(item.getKey())))
                .map(Map.Entry::getValue).toList();
        if (!missingDocuments.isEmpty()) {
            throw new ConflictException("Upload required documents before checkout: "
                    + summarise(missingDocuments) + ".");
        }
        List<String> missingIdentities = withoutTenant(missingIdentities(request), tenantLater);
        if (!missingIdentities.isEmpty()) {
            throw new ConflictException("Record PAN numbers before checkout: "
                    + summarise(missingIdentities) + ".");
        }
        List<String> missingParticulars = withoutTenant(missingParticulars(request), tenantLater);
        if (!missingParticulars.isEmpty()) {
            throw new ConflictException("Complete the agreement before checkout: "
                    + summarise(missingParticulars) + ".");
        }
    }

    void requireTenantSide(ServiceRequest request) {
        if (!tenantFillsLater(request)) {
            return;
        }
        List<String> missing = missingTenantSide(request);
        if (!missing.isEmpty()) {
            throw new ConflictException("Waiting for the tenant to fill their part: " + summarise(missing) + ".");
        }
    }

    boolean waitingOnTenant(ServiceRequest request) {
        return tenantCanStillFill(request) && !missingTenantSide(request).isEmpty();
    }

    private List<String> missingTenantSide(ServiceRequest request) {
        List<String> missing = new ArrayList<>();
        missingParticulars(request).stream().filter(RentAgreementReadiness::isTenantLabel).forEach(missing::add);
        missingIdentities(request).stream().filter(RentAgreementReadiness::isTenantLabel)
                .map(label -> label + " PAN").forEach(missing::add);
        missingDocumentItems(request).forEach((key, label) -> {
            if ("tenant".equals(sideOf(key))) {
                missing.add(label);
            }
        });
        return missing;
    }

    private static boolean isTenantLabel(String label) {
        return label.startsWith("Tenant ");
    }

    private static List<String> withoutTenant(List<String> labels, boolean tenantLater) {
        return tenantLater ? labels.stream().filter(label -> !isTenantLabel(label)).toList() : labels;
    }

    void requireOwnerSide(ServiceRequest request) {
        if (!ServiceRequestTypes.RENT_AGREEMENT.equals(request.getType()) || ownerSide.requesterIsOwner(request)) {
            return;
        }
        Set<String> waiting = new LinkedHashSet<>(ownerSide.licensorsAwaitingOwner(request));
        missingDocumentItems(request).forEach((key, label) -> {
            if ("owner".equals(sideOf(key))) {
                waiting.add(label);
            }
        });
        missingIdentities(request).stream().filter(label -> label.startsWith("Licensor ")).forEach(waiting::add);
        if (!waiting.isEmpty()) {
            throw new ConflictException(ErrorCodes.OWNER_SIDE_PENDING,
                    "Waiting for the owner to fill their part: " + summarise(List.copyOf(waiting)) + ".");
        }
    }

    static List<String> missingParticulars(ServiceRequest request) {
        Map<String, Object> details = request.getDetails() == null ? Map.of() : request.getDetails();
        Map<String, Object> state = ServiceRequestPricing.childObject(details, "_state");
        Map<String, Object> terms = ServiceRequestPricing.childObject(state, "terms");
        Map<String, Object> prop = ServiceRequestPricing.childObject(state, "prop");
        List<String> missing = new ArrayList<>();
        Long rent = ServiceRequestPricing.rupees(details.get("rent"), terms.get("rent"));
        if (rent == null || rent <= 0L) {
            missing.add("Monthly rent");
        }
        need(missing, terms.get("startDate"), "Start date");
        need(missing, prop.get("flatNo"), "Flat number");
        need(missing, prop.get("society"), "Society / building");
        need(missing, prop.get("locality"), "Locality");
        need(missing, prop.get("pincode"), "Pincode");
        boolean areaStamped = stated(details.get("regArea"))
                || stated(state.get("regArea"));
        if (!areaStamped && !(prop.get("gramPanchayat") instanceof Boolean)) {
            missing.add("Gram panchayat (Yes or No)");
        }
        need(missing, prop.get("area"), "Area");
        need(missing, prop.get("landmark"), "Landmark");
        need(missing, prop.get("policeStation"), "Police station");
        need(missing, prop.get("roadVicinity"), "Road / vicinity");
        need(missing, prop.get("roadType"), "Road type");
        if (!RESIDENTIAL.contains(String.valueOf(prop.get("propType")))) {
            missing.add("A residential property type");
        }
        Map<String, Object> owner = ServiceRequestPricing.childObject(state, "owner");
        entity(missing, owner, "Licensor 1");
        need(missing, owner.get("oName"), "Licensor 1 name");
        need(missing, owner.get("oAge"), "Licensor 1 age");
        offlinePapers(missing, owner, "Licensor 1");
        List<Map<?, ?>> coOwners = rows(state.get("coOwners"));
        for (int i = 0; i < coOwners.size(); i++) {
            entity(missing, coOwners.get(i), "Licensor " + (i + 2));
            need(missing, coOwners.get(i).get("name"), "Licensor " + (i + 2) + " name");
            need(missing, coOwners.get(i).get("age"), "Licensor " + (i + 2) + " age");
            offlinePapers(missing, coOwners.get(i), "Licensor " + (i + 2));
        }
        List<Map<?, ?>> tenants = rows(state.get("tenants"));
        for (int j = 0; j < Math.max(1, tenants.size()); j++) {
            Map<?, ?> tenant = j < tenants.size() ? tenants.get(j) : Map.of();
            entity(missing, tenant, "Tenant " + (j + 1));
            need(missing, tenant.get("name"), "Tenant " + (j + 1) + " name");
            need(missing, tenant.get("age"), "Tenant " + (j + 1) + " age");
            offlinePapers(missing, tenant, "Tenant " + (j + 1));
        }
        return missing;
    }

    private static boolean stated(Object value) {
        return value != null && !value.toString().isBlank();
    }

    private static void need(List<String> missing, Object value, String label) {
        if (!stated(value)) {
            missing.add(label);
        }
    }

    private static void entity(List<String> missing, Map<?, ?> party, String label) {
        if ("entity".equals(String.valueOf(party.get("type")))) {
            missing.add(label + " must use the legal desk quote flow for company or firm parties");
        }
    }

    private static void offlinePapers(List<String> missing, Map<?, ?> party, String label) {
        String residency = residency(party);
        if ("resident".equals(residency)) {
            return;
        }
        need(missing, party.get("passport"), label + " passport number");
        if ("foreign".equals(residency)) {
            need(missing, party.get("visaOci"), label + " visa / OCI details");
        }
    }

    private Map<String, String> missingDocumentItems(ServiceRequest request) {
        Set<String> filed = documents.findByServiceRequestIdOrderByUploadedAtDesc(request.getId()).stream().map(com.draazy.api.documents.vault.Document::getCategory).filter(Objects::nonNull).map(RentAgreementReadiness::canonical).collect(Collectors.toSet());
        Map<String, String> missing = new LinkedHashMap<>(ServiceRequestChecklist.itemsFor(request));
        missing.keySet().removeAll(filed);
        return missing;
    }

    List<String> missingIdentities(ServiceRequest request) {
        Map<String, Object> state = ServiceRequestPricing.childObject(request.getDetails() == null
                ? Map.of() : request.getDetails(), "_state");
        int licensors = 1 + rows(state.get("coOwners")).size();
        int tenants = Math.max(1, rows(state.get("tenants")).size());

        Set<String> identified = identities.findByServiceRequestIdOrderByPartyRoleAscPartyIndexAsc(request.getId())
                .stream().filter(row -> row.getPan() != null)
                .map(row -> row.getPartyRole() + ":" + row.getPartyIndex()).collect(Collectors.toSet());

        List<String> missing = new ArrayList<>();
        for (int i = 0; i < licensors; i++) {
            if (!identified.contains("owner:" + i)) {
                missing.add("Licensor " + (i + 1));
            }
        }
        for (int j = 0; j < tenants; j++) {
            if (!identified.contains("tenant:" + j)) {
                missing.add("Tenant " + (j + 1));
            }
        }
        return missing;
    }

    private static String summarise(List<String> items) {
        String named = String.join(", ", items.subList(0, Math.min(items.size(), NAMED_AT_MOST)));
        String more = items.size() > NAMED_AT_MOST ? " and " + (items.size() - NAMED_AT_MOST) + " more" : "";
        return named + more;
    }

    private static List<Map<?, ?>> rows(Object value) {
        if (!(value instanceof List<?> items)) {
            return List.of();
        }
        return items.stream().filter(Map.class::isInstance).<Map<?, ?>>map(Map.class::cast).toList();
    }

    private static String residency(Map<?, ?> party) {
        Object raw = party.get("residency");
        String value = raw == null || raw.toString().isBlank() ? "resident" : raw.toString().trim();
        return "nri".equals(value) || "foreign".equals(value) ? value : "resident";
    }
}
