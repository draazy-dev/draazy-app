// MahaRERA's search form posts, but its results page also answers a GET with the same field names.
export const mahaReraSearchUrl = (reraId) =>
  `https://maharera.maharashtra.gov.in/projects-search-result?project_name=${encodeURIComponent(reraId)}`;
