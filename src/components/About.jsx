import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

import { styles } from "../styles";
import { SectionWrapper } from "../hoc";
import { fadeIn, textVariant } from "../utils/motion";
import { fetchCollection } from "../utils/firestoreRest";
import { parseRichText } from "../utils/richText";
import { DEFAULT_ABOUT } from "../constants/about";
import AnimatedLetters from "./AnimatedLetters";

const About = () => {
  // Seeded with the copy built into the bundle rather than starting empty, so
  // this section always has something to render: a Firestore read that is slow,
  // blocked or has no document yet shows the shipped text instead of a gap. The
  // swap to stored copy happens during initial page load, long before anyone has
  // scrolled this far down.
  const [body, setBody] = useState(DEFAULT_ABOUT);

  useEffect(() => {
    let cancelled = false;

    fetchCollection("about")
      .then((docs) => {
        const stored = docs[0]?.body;
        if (!cancelled && typeof stored === "string" && stored.trim()) {
          setBody(stored);
        }
      })
      .catch(() => {
        // Falling back to the shipped copy is the entire error path — there is
        // nothing a visitor could do with a Firestore failure.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const blocks = useMemo(() => parseRichText(body), [body]);

  return (
    <>
      <motion.div variants={textVariant()}>
        <p className={styles.sectionSubText}>A bit about me</p>
        <h2 className={styles.sectionHeadText}>
          <AnimatedLetters letterClass="text-animate-hover" text="Overview" idx={1} />
        </h2>
      </motion.div>

      {blocks.map((nodes, index) => (
        <motion.p
          key={index}
          variants={fadeIn("", "", 0.1, 1)}
          className="mt-4 text-secondary text-[17px] max-w-3xl leading-[30px]"
        >
          {nodes}
        </motion.p>
      ))}
    </>
  );
};

export default SectionWrapper(About, "about");
