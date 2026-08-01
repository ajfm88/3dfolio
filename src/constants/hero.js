// The hero tagline as it ships inside the bundle. It has two jobs: it is what the
// admin panel starts from the first time it is opened (so the first save creates
// the Firestore document already populated, with nothing to retype), and it is
// what the hero falls back to if that document is missing or the read fails — the
// line under the heading is never blank, even with Firestore unreachable.
//
// Kept in its own module rather than in constants/index.js so the admin panel can
// import it without dragging that file's other exports into the admin chunk.
//
// The markup is the same small inline subset parseRichText understands: [label](url)
// and **bold**. A single newline is a line break, a blank line starts a new
// paragraph. The dash is a typographic —, matching the rest of the site.
export const DEFAULT_HERO_TAGLINE = `Full Stack Software Engineer based in Los Angeles, CA — passionate about creating innovative and efficient solutions to complex problems.`;
