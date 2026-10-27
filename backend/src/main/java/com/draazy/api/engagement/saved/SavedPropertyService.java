package com.draazy.api.engagement.saved;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyMapper;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.SavedCard;
import com.draazy.api.common.error.NotFoundException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Shortlists are user preferences, not auditable business records, and can grow unbounded. */
@Service
public class SavedPropertyService {

    private final SavedPropertyRepository savedPropertyRepo;
    private final PropertyRepository propertyRepo;
    private final PropertyMapper propertyMapper;

    public SavedPropertyService(SavedPropertyRepository savedPropertyRepo,
            PropertyRepository propertyRepo, PropertyMapper propertyMapper) {
        this.savedPropertyRepo = savedPropertyRepo;
        this.propertyRepo = propertyRepo;
        this.propertyMapper = propertyMapper;
    }

    /** Saved-order is restored after {@code findAllById}, which does not guarantee it. */
    @Transactional(readOnly = true)
    public Page<SavedCard> listSaved(UUID userId, Pageable pageable) {
        Page<SavedPropertyRepository.SavedRow> rows = savedPropertyRepo.findSavedRows(userId, pageable);
        if (rows.isEmpty()) {
            return new PageImpl<>(List.of(), rows.getPageable(), rows.getTotalElements());
        }
        List<Property> props = propertyRepo.findAllById(
                rows.getContent().stream().map(SavedPropertyRepository.SavedRow::getPropertyId).toList());
        Map<UUID, Property> byId = new LinkedHashMap<>();
        props.forEach(p -> byId.put(p.getId(), p));
        List<SavedCard> content = rows.getContent().stream()
                .filter(row -> byId.containsKey(row.getPropertyId()))
                .map(row -> propertyMapper.toSaved(byId.get(row.getPropertyId()), row.getSavedAt()))
                .toList();
        return new PageImpl<>(content, rows.getPageable(), rows.getTotalElements());
    }

    /** The whole shortlist as keys: the shell needs every heart, so this is unpaged. */
    @Transactional(readOnly = true)
    public List<SavedKey> listKeys(UUID userId) {
        return savedPropertyRepo.findSavedKeys(userId).stream()
                .map(row -> new SavedKey(row[0].toString(), (String) row[1]))
                .toList();
    }

    /** Validates existence first so we never write a dangling FK (which would 500 on the constraint). */
    @Transactional
    public void save(UUID userId, UUID propertyId) {
        if (!propertyRepo.existsById(propertyId)) {
            throw NotFoundException.of("Property");
        }
        savedPropertyRepo.insertIfAbsent(userId, propertyId);
    }

    /** Idempotently remove a property from the caller's shortlist. 204 whether or not a row existed. */
    @Transactional
    public void unsave(UUID userId, UUID propertyId) {
        savedPropertyRepo.deleteByUserAndProperty(userId, propertyId);
    }
}
