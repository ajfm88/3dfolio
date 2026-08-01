// The Alejandro wordmark, in the two variants the site uses: the light original
// for dark surfaces, and the blog's own version, which BlogNavbar renders through
// an `invert` filter to read on its light theme.
//
// Both are referenced by path out of public/ rather than imported from
// src/assets. Importing would let Vite fingerprint them, and a URL that changes
// on every build is a poor thing to hand a search engine: it resets whatever the
// crawler had learned about the image, and it cannot be written into sitemap.xml
// ahead of time because the hash is not known until the build runs. A stable,
// descriptive path is worth more here than cache busting on a logo that changes
// roughly never.
//
// The alt text is shared for the same reason it is spelled out at all: this is the
// one image on every single page, so it is the site's strongest chance of being
// understood as belonging to Alejandro Foucault rather than being skipped as a
// generic "logo".
export const LOGO_SRC = "/ajfm88-alejandro-foucault.png";
export const LOGO_BLOG_SRC = "/ajfm88-alejandro-foucault-blog.png";
export const LOGO_ALT = "Alejandro Foucault — ajfm88";
