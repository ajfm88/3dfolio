import { SectionWrapper } from "../hoc";
// import { technologies } from "../constants";
import { styles } from "../styles";
import RotatingCube from "./RotatingCube";
import AnimatedLetters from "./AnimatedLetters";

const Tech = () => {
  return (
    <div className="relative overflow-hidden">
      <video
        autoPlay
        muted
        loop
        playsInline
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full object-cover -z-10 opacity-30"
      >
        <source src="/skills-bg.webm" type="video/webm" />
      </video>
      <p className={`${styles.sectionSubText} text-center`}>Skills and expertise</p>
      <h2 className={`${styles.sectionHeadText} text-center`}>
        <AnimatedLetters letterClass="text-animate-hover" text="My Tech Stack" idx={1} />
      </h2>

      <RotatingCube />

      {/* Technology grid — commented out for cube preview
      <div className="flex flex-row flex-wrap justify-center gap-10 mt-10">
        {technologies.map((technology) => (
          <a
            key={technology.name}
            href={technology.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-2 group"
          >
            <div className="w-20 h-20 flex items-center justify-center rounded-xl bg-tertiary p-3 transition-transform duration-200 group-hover:scale-110">
              <img
                src={technology.icon}
                alt={technology.name}
                className="w-full h-full object-contain"
              />
            </div>
            <p className="text-white text-sm font-bold text-center">
              {technology.name}
            </p>
          </a>
        ))}
      </div>
      */}
    </div>
  );
};

export default SectionWrapper(Tech, "tech");
