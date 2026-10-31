// The two Alejandro logos are deliberately absent: they live in public/ under
// descriptive filenames instead of being imported. A bundled asset is served at a
// fingerprinted URL that changes on every build, which resets what a search engine
// knows about the image and cannot be named ahead of time in sitemap.xml.
import github from "./github.png";
import menu from "./menu.svg";
import close from "./close.svg";

import javascript from "./tech/javascript.svg";
import typescript from "./tech/typescript.svg";
import python from "./tech/python.svg";
import mongodb from "./tech/mongodb.png";
import postgresql from "./tech/postgresql.svg";
import java from "./tech/java.svg";

export {
  github,
  menu,
  close,
  javascript,
  typescript,
  python,
  mongodb,
  postgresql,
  java,
};
