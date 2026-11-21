package com.draazy.api.moderation.enquiry;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.audit.AuditService;
import com.draazy.api.deals.deal.Deal;
import com.draazy.api.deals.deal.DealRepository;
import com.draazy.api.deals.visit.Visit;
import com.draazy.api.deals.visit.VisitRepository;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.leads.contact.ContactRequest;
import com.draazy.api.leads.contact.ContactRequestRepository;
import com.draazy.api.security.AuthPrincipal;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class EnquiryBoardServiceNullPropertyTest {

    private final ContactRequestRepository contactRequests = mock(ContactRequestRepository.class);
    private final VisitRepository visits = mock(VisitRepository.class);
    private final DealRepository deals = mock(DealRepository.class);
    private final PropertyRepository properties = mock(PropertyRepository.class);
    private final EnquiryBoardService service = new EnquiryBoardService(contactRequests, visits, deals,
            properties, mock(UserRepository.class), mock(AuditService.class), mock(EnquiryBoardQueries.class));
    private final AuthPrincipal actor = mock(AuthPrincipal.class);

    @Test
    void enquiryWithoutPropertyHasNullPropertyFields() {
        UUID id = UUID.randomUUID();
        ContactRequest row = mock(ContactRequest.class);
        when(row.getId()).thenReturn(id);
        when(contactRequests.findById(id)).thenReturn(Optional.of(row));

        AdminEnquiryDto dto = service.enquiry(actor, id.toString());

        assertThat(dto.id()).isEqualTo(id.toString());
        assertThat(dto.propertyId()).isNull();
        assertThat(dto.propertyTitle()).isNull();
        assertThat(dto.locality()).isNull();
    }

    @Test
    void visitWithoutPropertyHasNullPropertyFields() {
        UUID id = UUID.randomUUID();
        Visit row = mock(Visit.class);
        when(row.getId()).thenReturn(id);
        when(visits.findById(id)).thenReturn(Optional.of(row));

        AdminVisitDto dto = service.visit(actor, id.toString());

        assertThat(dto.id()).isEqualTo(id.toString());
        assertThat(dto.propertyId()).isNull();
        assertThat(dto.propertyTitle()).isNull();
    }

    @Test
    void dealWithoutPropertyHasNullPropertyFields() {
        UUID id = UUID.randomUUID();
        Deal row = mock(Deal.class);
        when(row.getId()).thenReturn(id);
        when(deals.findById(id)).thenReturn(Optional.of(row));

        AdminDealDto dto = service.deal(actor, id.toString());

        assertThat(dto.id()).isEqualTo(id.toString());
        assertThat(dto.propertyId()).isNull();
        assertThat(dto.propertyTitle()).isNull();
    }

    @Test
    void propertyIdIsRenderedWhenPresent() {
        UUID id = UUID.randomUUID();
        UUID propertyId = UUID.randomUUID();
        ContactRequest row = mock(ContactRequest.class);
        when(row.getId()).thenReturn(id);
        when(row.getPropertyId()).thenReturn(propertyId);
        when(contactRequests.findById(id)).thenReturn(Optional.of(row));
        when(properties.findById(propertyId)).thenReturn(Optional.empty());

        assertThat(service.enquiry(actor, id.toString()).propertyId()).isEqualTo(propertyId.toString());
    }
}
