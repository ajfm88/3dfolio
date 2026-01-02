import React from "react";
import { Tilt } from "react-tilt";
import { motion } from "framer-motion";

import { styles } from "../styles";
import { services } from "../constants";
import { SectionWrapper } from "../hoc";
import { fadeIn, textVariant } from "../utils/motion";

const ServiceCard = ({ index, title, icon, url }) => (
  <Tilt className="xs:w-[250px] w-full transition-all">
    <motion.div
      variants={fadeIn("right", "spring", index * 0.5, 0.75)}
      className="w-full green-pink-gradient p-[1px] rounded-[20px] shadow-card"
    >
      <div
        options={{
          max: 45,
          scale: 1,
          speed: 450,
        }}
        className="bg-tertiary rounded-[20px] py-5 px-12 min-h-[280px] flex justify-evenly items-center flex-col"
      >
        <img
          src={icon}
          alt="web-development"
          className="w-16 h-16 object-contain"
        />
        <a
          href={url || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute inset-0 z-10 cursor-pointer"
        />
        <div className="relative z-0">
          <h3 className="text-white text-[20px] font-bold text-center">
            {title}
          </h3>
        </div>
      </div>
    </motion.div>
  </Tilt>
);

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
        I’m a very ambitious Full Stack Software Engineer based in Los Angeles,
        CA with previous experience in the Hollywood film industry, and in
        education. I have a passion for creating innovative and efficient
        solutions to complex problems and I always aim to play a crucial role in
        developing Software that improves people’s lives. I am also a fitness
        enthusiast, an avid reader (both fiction and non-fiction), a language
        learner (passed both the JLPT N5 and N4 and I’m currently studying for
        the N3 (intermediate level) in Japanese), and a{" "}
        <a
          href="https://yelp.com/user_details?userid=JBqCl4WE7g9SPR-0y0tJzQ"
          target="_blank"
        >
          <b>Yelp Elite Squad</b>
        </a>{" "}
        member who loves ramen, especially Tonkotsu and Tsukemen. いただきます！
        <br />
        P.S.: The Anki decks that I’ve created during my Japanese language
        learning journey can be found&nbsp;
        <a
          href="https://ankiweb.net/shared/by-author/215281557"
          target="_blank"
        >
          <b>here</b>
        </a>
        .
      </motion.p>

      <div className="mt-20 flex flex-wrap gap-10">
        {services.map((service, index) => (
          <ServiceCard key={service.title} index={index} {...service} />
        ))}
      </div>
    </>
  );
};

export default SectionWrapper(About, "about");
