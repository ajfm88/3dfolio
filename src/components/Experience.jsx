import {
  VerticalTimeline,
  VerticalTimelineElement,
} from "react-vertical-timeline-component";
import { motion } from "framer-motion";

import "react-vertical-timeline-component/style.min.css";

import { styles } from "../styles";
import { experiences } from "../constants";
import { SectionWrapper } from "../hoc";
import { textVariant } from "../utils/motion";
import AnimatedLetters from "./AnimatedLetters";

const ExperienceCard = ({ experience }) => {
  return (
    <VerticalTimelineElement
      contentStyle={{
        background: "#1d1836",
        color: "#fff",
      }}
      contentArrowStyle={{ borderRight: "7px solid  #232631" }}
      date={experience.date}
      iconStyle={{ background: experience.iconBg }}
      icon={
        experience.company_url ? (
          <a
            href={experience.company_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex justify-center items-center w-full h-full rounded-full overflow-hidden"
          >
            <img
              src={experience.icon}
              alt={experience.company_name}
              className="w-[95%] h-[95%] object-contain"
            />
          </a>
        ) : (
          <div className="flex justify-center items-center w-full h-full rounded-full overflow-hidden">
            <img
              src={experience.icon}
              alt={experience.company_name}
              className="w-[95%] h-[95%] object-contain"
            />
          </div>
        )
      }
    >
      <div>
        <h3 className="text-white text-[24px] font-bold">{experience.title}</h3>
        <p
          className="text-secondary text-[16px] font-semibold group/company"
          style={{ margin: 0 }}
        >
          {experience.company_url ? (
            <a
              href={experience.company_url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors duration-200 after:content-['_↗'] after:opacity-0 group-hover/company:after:opacity-100 after:transition-opacity after:duration-200"
            >
              {experience.company_name}
            </a>
          ) : (
            experience.company_name
          )}
        </p>
        <p className="experience-date-mobile text-secondary text-[14px] font-semibold mt-1">
          {experience.date}
        </p>
      </div>

      <ul className="mt-5 list-disc ml-5 space-y-2">
        {experience.points.map((point, index) => (
          <li
            key={`experience-point-${index}`}
            className="text-white-100 text-[14px] pl-1 tracking-wider"
          >
            {point}
          </li>
        ))}
      </ul>
    </VerticalTimelineElement>
  );
};

const Experience = () => {
  return (
    <>
      <motion.div variants={textVariant()}>
        <p className={`${styles.sectionSubText} text-center`}>
          Career highlights
        </p>
        <h2 className={`${styles.sectionHeadText} text-center`}>
          <AnimatedLetters
            letterClass="text-animate-hover"
            text="Work Experience"
            idx={1}
          />
        </h2>
      </motion.div>

      <div className="mt-20 flex flex-col">
        <VerticalTimeline>
          {experiences.map((experience, index) => (
            <ExperienceCard
              key={`experience-${index}`}
              experience={experience}
            />
          ))}
        </VerticalTimeline>
      </div>
    </>
  );
};

export default SectionWrapper(Experience, "experience");
