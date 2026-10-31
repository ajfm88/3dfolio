import { Suspense, lazy } from "react";
import { SectionWrapper } from "../hoc";
import { styles } from "../styles";
import RotatingCube from "./RotatingCube";
import AnimatedLetters from "./AnimatedLetters";

// Lazy for the same reason as StarsCanvas in App.jsx: keeps three.js out of the
// entry bundle. Each card sits in a fixed-size box, so nothing shifts while the
// chunk loads.
const TechIconCard = lazy(() => import("./canvas/TechIconCard"));

const leftModels = [
  {
    modelPath: "/models/react_logo-transformed.glb",
    scale: 1,
    rotation: [0, 0, 0],
  },
  {
    modelPath: "/models/node-transformed.glb",
    scale: 5,
    rotation: [0, -Math.PI / 2, 0],
  },
];

const rightModels = [
  {
    modelPath: "/models/python-transformed.glb",
    scale: 0.8,
    rotation: [0, 0, 0],
  },
  {
    modelPath: "/models/git-svg-transformed.glb",
    scale: 0.05,
    rotation: [0, -Math.PI / 4, 0],
  },
];

const Tech = () => {
  return (
    <div className="relative overflow-hidden -mx-6 sm:-mx-16">
      <video
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 w-full h-full object-cover -z-10 opacity-30"
      >
        <source src="/skills-bg.webm" type="video/webm" />
      </video>
      <p className={`${styles.sectionSubText} text-center`}>
        Skills and expertise
      </p>
      <h2 className={`${styles.sectionHeadText} text-center`}>
        <AnimatedLetters
          letterClass="text-animate-hover"
          text="My Tech Stack"
          idx={1}
        />
      </h2>

      <div className="flex items-center justify-center mt-4 pb-10">
        <div className="hidden md:flex gap-4">
          {leftModels.map((model, i) => (
            <div key={`left-${i}`} className="w-44 h-44">
              <Suspense fallback={null}>
                <TechIconCard {...model} />
              </Suspense>
            </div>
          ))}
        </div>

        <div className="md:mx-24">
          <RotatingCube />
        </div>

        <div className="hidden md:flex gap-4">
          {rightModels.map((model, i) => (
            <div key={`right-${i}`} className="w-44 h-44">
              <Suspense fallback={null}>
                <TechIconCard {...model} />
              </Suspense>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SectionWrapper(Tech, "tech");
