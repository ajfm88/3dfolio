// These mirror server/src/lib/projectAccess.js, which imports Mongoose and
// cannot enter the browser bundle. The server stays authoritative on limits.
export const MAX_OWNED_PROJECTS = 20;
export const PROJECT_NAME_MAX = 80;
export const PROJECT_DESCRIPTION_MAX = 500;
