import { useState, useEffect } from "react";

import { BallCanvas } from "./canvas";
import { SectionWrapper } from "../hoc";
import { technologies } from "../constants";
import { styles } from "../styles";

const Tech = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 500);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 500);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  const Map = (isMobile, technologies) => {
    if (isMobile) {
      return technologies.slice(0, 6).map((technology) => (
        <div className="w-28 h-28" key={technology.name}>
          <BallCanvas icon={technology.icon} />
          <p className="flex justify-center text-white font-bold">
            {technology.name}
          </p>
        </div>
      ));
    } else {
      return technologies.map((technology) => (
        <div className="w-28 h-28" key={technology.name}>
          <BallCanvas icon={technology.icon} />
          <p className="flex justify-center text-white font-bold">
            {technology.name}
          </p>
        </div>
      ));
    }
  };
  return (
    <>
      <p className={`${styles.sectionSubText} text-center`}>
        Skills and expertise
      </p>
      <h2 className={`${styles.sectionHeadText} text-center`}>My Tech Stack</h2>
      <div className="flex flex-row flex-wrap justify-center gap-10">
        {Map(isMobile, technologies)}
      </div>
    </>
  );
};

export default SectionWrapper(Tech, "tech");
