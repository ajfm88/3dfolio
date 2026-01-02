import React, { useState, useEffect } from "react";
import { Tilt } from "react-tilt";
import { motion } from "framer-motion";

import { styles } from "../styles";
import { github } from "../assets";
import { SectionWrapper } from "../hoc";
import { projects } from "../constants";
import { fadeIn, textVariant } from "../utils/motion";

const ProjectCard = ({
  index,
  name,
  description,
  tags,
  url,
  image,
  source_code_link,
}) => {
  return (
    <motion.div variants={fadeIn("up", "spring", index * 0.5, 0.75)}>
      <Tilt
        options={{
          max: 45,
          scale: 1,
          speed: 450,
        }}
        className="bg-tertiary p-5 rounded-2xl sm:w-[360px] w-full transition-all"
      >
        <div className="relative w-full h-[230px]">
          <a
            href={url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="block absolute inset-0 z-10"
          >
            <img
              src={image}
              alt="project_image"
              className="w-full h-full object-cover rounded-2xl"
            />
          </a>
          <div className="absolute inset-0 flex justify-end m-3 card-img_hover">
            <div
              onClick={(e) => {
                window.open(source_code_link, "_blank");
              }}
              className="black-gradient w-10 h-10 rounded-full flex justify-center items-center cursor-pointer z-20"
            >
              <img
                src={github}
                alt="source code"
                className="w-1/2 h-1/2 object-contain"
              />
            </div>
          </div>
        </div>

        <div className="mt-5">
          <a href={source_code_link} target="_blank">
            <h3 className="text-white font-bold text-[24px]">{name}</h3>
          </a>
          <p className="mt-2 text-secondary text-[14px]">{description}</p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <p
              key={`${name}-${tag.name}`}
              className={`text-[14px] ${tag.color}`}
            >
              #{tag.name}
            </p>
          ))}
        </div>
      </Tilt>
    </motion.div>
  );
};

const Works = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Check if screen is mobile size
    const mediaQuery = window.matchMedia("(max-width: 768px)");
    setIsMobile(mediaQuery.matches);

    // Add listener for screen size changes
    const handleMediaQueryChange = (event) => {
      setIsMobile(event.matches);
    };

    mediaQuery.addEventListener("change", handleMediaQueryChange);

    return () => {
      mediaQuery.removeEventListener("change", handleMediaQueryChange);
    };
  }, []);

  // Show only first 3 projects on mobile
  const displayedProjects = isMobile ? projects.slice(0, 3) : projects;

  return (
    <>
      <motion.div variants={textVariant()}>
        <p className={`${styles.sectionSubText} `}>Portfolio highlights</p>
        <h2 className={`${styles.sectionHeadText}`}>Projects</h2>
      </motion.div>

      <div className="w-full flex">
        <motion.p
          variants={fadeIn("", "", 0.1, 1)}
          className="mt-3 text-secondary text-[17px] max-w-3xl leading-[30px]"
        >
          The following projects showcase my skills and experience across
          different tech stacks. Each project is briefly described in its
          respective card and there are links to code repositories (by clicking
          in the upper right corner of the card, on the GitHub logo. Or clicking
          on the name of the project itself), and to live demos (by clicking on
          the image of the project). These projects reflect my ability to solve
          complex problems, work with different technologies, and manage tasks
          effectively. To see more projects, please feel free to visit my&nbsp;
          <a href="https://github.com/ajfm88" target="_blank">
            <b>GitHub</b>
          </a>
          .
        </motion.p>
      </div>

      <div className="mt-20 flex flex-wrap gap-7">
        {displayedProjects.map((project, index) => (
          <ProjectCard key={`project-${index}`} index={index} {...project} />
        ))}
      </div>
    </>
  );
};

export default SectionWrapper(Works, "projects");
