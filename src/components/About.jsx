import { motion } from "framer-motion";

import { styles } from "../styles";
import { SectionWrapper } from "../hoc";
import { fadeIn, textVariant } from "../utils/motion";

const About = () => {
  return (
    <>
      <motion.div variants={textVariant()}>
        <p className={styles.sectionSubText}>A bit about me</p>
        <h2 className={styles.sectionHeadText}>Overview</h2>
      </motion.div>

      <motion.p
        variants={fadeIn("", "", 0.1, 1)}
        className="mt-4 text-secondary text-[17px] max-w-3xl leading-[30px]"
      >
        I’m Alejandro J. Foucault, a very ambitious Full Stack Software Engineer based in Los
        Angeles, CA with previous experience in the Hollywood film industry, and in education. I
        have a passion for creating innovative and efficient solutions to complex problems and I
        always aim to play a crucial role in developing Software that improves people’s lives. I am
        also a fitness enthusiast, an avid reader (both fiction and non-fiction), a language learner
        (passed both the JLPT N5 and N4 and I’m currently studying for the N3 (intermediate level)
        in Japanese), and a{" "}
        <a href="https://yelp.com/user_details?userid=JBqCl4WE7g9SPR-0y0tJzQ" target="_blank">
          <b>Yelp Elite Squad</b>
        </a>{" "}
        member who loves ramen, especially Tonkotsu and Tsukemen. いただきます！
        <br />
        P.S.: The Anki decks that I’ve created during my Japanese language learning journey can be
        found&nbsp;
        <a href="https://ankiweb.net/shared/by-author/215281557" target="_blank">
          <b>in this link</b>
        </a>
        . Also, if you want some extra ideas on what to read, I also keep a log of some of the great
        (both fiction and non-fiction) books I’ve been reading&nbsp;
        <a href="https://goodreads.com/ajfm88" target="_blank">
          <b>in this link</b>
        </a>
        .
      </motion.p>
    </>
  );
};

export default SectionWrapper(About, "about");
