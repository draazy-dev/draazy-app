const isSale = (deal) => deal === 'buy' || deal === 'sale';

export const dealOf = (deal) => (isSale(deal) ? 'buy' : 'rent');
export const packSlug = (deal) => (isSale(deal) ? 'contact-pack-buy' : 'contact-pack');
export const passSlug = (deal) => (isSale(deal) ? 'listing-pass-buy' : 'listing-pass');
export const packPriceKey = (deal) => (isSale(deal) ? 'contactPackBuy' : 'contactPack');
export const passPriceKey = (deal) => (isSale(deal) ? 'listingPassBuy' : 'listingPass');
