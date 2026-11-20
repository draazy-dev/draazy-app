package com.draazy.api.moderation.verification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.audit.AuditService;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Review checklist — a ticked checklist read back in another row order keeps its ticks")
class VerificationCasesChecklistOrderTest {

    @Test
    void reorderedRowsAreNotMistakenForALegacyChecklist() {
        UUID propertyId = UUID.randomUUID();
        PropertyReview review = new PropertyReview(propertyId);
        List.of(VerificationCases.CHECKLIST.get(2), VerificationCases.CHECKLIST.get(0),
                VerificationCases.CHECKLIST.get(1))
                .forEach(review::addChecklistItem);
        review.getChecklist().forEach(item -> item.mark(true, UUID.randomUUID()));

        PropertyReviewRepository reviews = mock(PropertyReviewRepository.class);
        when(reviews.findByPropertyId(propertyId)).thenReturn(Optional.of(review));

        PropertyReview ensured = new VerificationCases(reviews, mock(AuditService.class),
                mock(PropertyRepository.class)).ensure(propertyId, "rent");

        assertThat(ensured.getChecklist()).hasSize(VerificationCases.CHECKLIST.size())
                .allMatch(ReviewChecklistItem::isPass);
    }

    @Test
    void aListingQuotingAReraIdGetsAFourthItemSortedLast() {
        UUID propertyId = UUID.randomUUID();
        PropertyRepository properties = propertyQuoting(propertyId, "P52100012345");
        PropertyReviewRepository reviews = mock(PropertyReviewRepository.class);
        when(reviews.findByPropertyId(propertyId)).thenReturn(Optional.empty());
        when(reviews.saveAndFlush(any(PropertyReview.class))).thenAnswer(call -> call.getArgument(0));

        PropertyReview created = new VerificationCases(reviews, mock(AuditService.class), properties)
                .ensure(propertyId, "buy");

        assertThat(VerificationCases.ordered(created)).extracting(ReviewChecklistItem::getItem)
                .containsExactly(VerificationCases.CHECKLIST.get(0), VerificationCases.CHECKLIST.get(1),
                        VerificationCases.CHECKLIST.get(2), VerificationCases.RERA_ITEM);
    }

    @Test
    void theReraItemIsAddedToAnOpenCaseWithoutLosingTicks() {
        UUID propertyId = UUID.randomUUID();
        PropertyReview review = new PropertyReview(propertyId);
        VerificationCases.CHECKLIST.forEach(review::addChecklistItem);
        review.getChecklist().forEach(item -> item.mark(true, UUID.randomUUID()));
        PropertyReviewRepository reviews = mock(PropertyReviewRepository.class);
        when(reviews.findByPropertyId(propertyId)).thenReturn(Optional.of(review));

        PropertyReview ensured = new VerificationCases(reviews, mock(AuditService.class),
                propertyQuoting(propertyId, "P52100012345")).ensure(propertyId, "buy");

        assertThat(ensured.getChecklist()).hasSize(4);
        assertThat(ensured.getChecklist()).filteredOn(item -> VerificationCases.RERA_ITEM.equals(item.getItem()))
                .singleElement().satisfies(item -> assertThat(item.isPass()).isFalse());
        assertThat(ensured.getChecklist()).filteredOn(ReviewChecklistItem::isPass).hasSize(3);
    }

    @Test
    void theReraItemIsDroppedOnceTheListingQuotesNoId() {
        UUID propertyId = UUID.randomUUID();
        PropertyReview review = new PropertyReview(propertyId);
        VerificationCases.CHECKLIST.forEach(review::addChecklistItem);
        review.addChecklistItem(VerificationCases.RERA_ITEM);
        PropertyReviewRepository reviews = mock(PropertyReviewRepository.class);
        when(reviews.findByPropertyId(propertyId)).thenReturn(Optional.of(review));

        PropertyReview ensured = new VerificationCases(reviews, mock(AuditService.class),
                propertyQuoting(propertyId, " ")).ensure(propertyId, "buy");

        assertThat(ensured.getChecklist()).hasSize(VerificationCases.CHECKLIST.size());
    }

    private static PropertyRepository propertyQuoting(UUID propertyId, String reraId) {
        Property property = mock(Property.class);
        when(property.getReraId()).thenReturn(reraId);
        PropertyRepository properties = mock(PropertyRepository.class);
        when(properties.findById(propertyId)).thenReturn(Optional.of(property));
        return properties;
    }
}
