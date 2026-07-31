// The About copy as it ships inside the bundle. It has two jobs: it is what the
// admin panel starts from the first time it is opened (so the first save creates
// the Firestore document already populated, with nothing to retype), and it is
// what the public section falls back to if that document is missing or the read
// fails — the section is never blank, even with Firestore unreachable.
//
// Kept in its own module rather than in constants/index.js so the admin panel can
// import it without dragging that file's image imports into the admin chunk.
//
// The markup is the small inline subset parseRichText understands: [label](url)
// and **bold**. A single newline is a line break, a blank line starts a new
// paragraph. Apostrophes are the typographic ’, matching the rest of the site.
export const DEFAULT_ABOUT = `I’m Alejandro J. Foucault, a very ambitious Full Stack Software Engineer based in Los Angeles, CA with previous experience in the Hollywood film industry, and in education. I have a passion for creating innovative and efficient solutions to complex problems and I always aim to play a crucial role in developing Software that improves people’s lives. I am also a fitness enthusiast, an avid reader (both fiction and non-fiction), a language learner (passed both the JLPT N5 and N4 and I’m currently studying for the N3 (intermediate level) in Japanese), and a [**Yelp Elite Squad**](https://yelp.com/user_details?userid=JBqCl4WE7g9SPR-0y0tJzQ) member who loves ramen, especially Tonkotsu and Tsukemen. いただきます！
P.S.: The Anki decks that I’ve created during my Japanese language learning journey can be found [**in this link**](https://ankiweb.net/shared/by-author/215281557). Also, if you want some extra ideas on what to read, I also keep a log of some of the great (both fiction and non-fiction) books I’ve been reading [**in this link**](https://goodreads.com/ajfm88).`;
