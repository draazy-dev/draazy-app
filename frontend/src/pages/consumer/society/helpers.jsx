import { fmtNum } from '../../../lib/format.js';
import { titleCase } from './constants.js';

function buildAbout(soc, locName, t) {
  if (soc._thin) return t('society.aboutThin', { name: soc.name, locality: locName });

  const descriptor = [
    soc.towers ? t('society.descTower', { count: soc.towers }) : null,
    soc.units ? t('society.descHome', { count: fmtNum(soc.units) }) : null,
  ].filter(Boolean).join(', ');
  const descArg = descriptor ? `${descriptor} ` : '';

  const sentences = [
    soc.builder
      ? t('society.aboutIntroBuilder', { name: soc.name, descriptor: descArg, builder: soc.builder, locality: locName })
      : t('society.aboutIntro', { name: soc.name, descriptor: descArg, locality: locName }),
  ];
  if (soc.year) {
    sentences.push(soc.occupancy
      ? t('society.aboutBuiltOccupancy', { year: soc.year, percent: soc.occupancy })
      : t('society.aboutBuilt', { year: soc.year }));
  }
  sentences.push(t('society.aboutBrokerFree'));
  return sentences.join(' ');
}

function genericSociety(slug, name, locName) {
  return {
    id: 'G:' + slug, slug, name: name || titleCase(slug), localitySlug: slug,
    registration: false, conveyance: false, amenities: [],
    _generic: true, _thin: true, _locName: locName,
  };
}

export { buildAbout, genericSociety };
