// Must stay a leaf (no imports): providers read these at module scope, and an import cycle here
// hits a temporal dead zone that boots the app to an empty <body>.

export const MAX_PAGE_SIZE = 100;
