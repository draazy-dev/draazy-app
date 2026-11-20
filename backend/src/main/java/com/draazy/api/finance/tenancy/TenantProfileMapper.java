package com.draazy.api.finance.tenancy;

import org.mapstruct.BeanMapping;
import org.mapstruct.Mapper;
import org.mapstruct.MappingTarget;
import org.mapstruct.ReportingPolicy;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)
public interface TenantProfileMapper {
    @BeanMapping(ignoreByDefault = true)
    @org.mapstruct.Mapping(target = "name", source = "name")
    @org.mapstruct.Mapping(target = "occupation", source = "occupation")
    @org.mapstruct.Mapping(target = "income", source = "income")
    @org.mapstruct.Mapping(target = "occupants", source = "occupants")
    @org.mapstruct.Mapping(target = "moveIn", source = "moveIn")
    @org.mapstruct.Mapping(target = "priorLandlord", source = "priorLandlord")
    @org.mapstruct.Mapping(target = "about", source = "about")
    void applyTo(TenantProfileUpdateRequest body, @MappingTarget TenantProfile profile);
}
