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

    @Transactional(readOnly = true)
    public List<SavedKey> listKeys(UUID userId) {
        return savedPropertyRepo.findSavedKeys(userId).stream()
                .map(row -> new SavedKey(row[0].toString(), (String) row[1]))
                .toList();
    }

    @Transactional
    public void save(UUID userId, UUID propertyId) {
        if (!propertyRepo.existsById(propertyId)) {
            throw NotFoundException.of("Property");
        }
        savedPropertyRepo.insertIfAbsent(userId, propertyId);
    }

    @Transactional
    public void unsave(UUID userId, UUID propertyId) {
        savedPropertyRepo.deleteByUserAndProperty(userId, propertyId);
    }
}
