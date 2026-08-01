import {
  mongodb,
  nextjs,
  postgresql,
  javascript,
  python,
  typescript,
} from "../assets";

// The cube as it ships inside the bundle. Two jobs, the same pair About and Hero
// have: it is what the admin panel starts from the first time it is opened, so
// the first save writes a fully populated document with nothing to re-enter, and
// it is what the cube falls back to if that document is missing or the read
// fails — six blank glass panels would read as broken rather than as empty.
//
// Position is the face slot: index 0 is `.face1`, index 5 is `.face6`. The order
// below is the order the logos have always been in, so the shipped cube is
// unchanged.
//
// `rotation` turns the image inside its face, in degrees, and only ever holds
// 0, 90, 180 or 270. It exists because a face's placement transform can leave
// its contents turned relative to the viewer at the moment that face comes to
// the front: composing each placement with the spincube keyframe that fronts it
// lands on the identity matrix for every face except the second, which arrives
// rotated a quarter turn clockwise. The 270 below is what cancels that, and it
// belongs to the slot rather than to the picture — swapping the image keeps it.
// Any face is free to carry a rotation too, for a logo that simply reads better
// turned.
export const DEFAULT_TECH_FACES = [
  { label: "MongoDB", src: mongodb, rotation: 0 },
  { label: "Next.js", src: nextjs, rotation: 270 },
  { label: "PostgreSQL", src: postgresql, rotation: 0 },
  { label: "JavaScript", src: javascript, rotation: 0 },
  { label: "Python", src: python, rotation: 0 },
  { label: "TypeScript", src: typescript, rotation: 0 },
];

// The turns the panel offers. A cube face has no meaningful in-between angle —
// anything other than a quarter turn leaves the logo visibly crooked against
// the square — so this is a fixed set rather than a free number input.
export const TECH_ROTATIONS = [0, 90, 180, 270];

// Lays what is stored over the shipped cube by position, rather than using it in
// its place, so the result is always exactly six faces: a document that is short,
// empty or half-written still renders a whole cube out of whatever it does supply.
//
// A stored `imageUrl` of "" means the face is still on its bundled image, which is
// why both are returned — `src` is what to render, `imageUrl` is what to store, and
// the panel needs to tell the two apart to know whether a face has been replaced.
//
// Rotation is validated against the allowed set instead of being coerced or
// defaulted with `||`. 0 is both a falsy value and by far the most common one, so
// `stored.rotation || fallback.rotation` would quietly throw away every upright
// face the moment it was saved.
export function mergeTechFaces(stored) {
  const list = Array.isArray(stored) ? stored : [];

  return DEFAULT_TECH_FACES.map((fallback, index) => {
    const face = list[index] ?? {};
    const label = typeof face.label === "string" ? face.label.trim() : "";
    const imageUrl = typeof face.imageUrl === "string" ? face.imageUrl.trim() : "";
    const rotation = Number(face.rotation);

    return {
      label: label || fallback.label,
      imageUrl,
      src: imageUrl || fallback.src,
      rotation: TECH_ROTATIONS.includes(rotation) ? rotation : fallback.rotation,
    };
  });
}
