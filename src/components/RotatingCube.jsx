import {
  mongodb,
  postgresql,
  nextjs,
  javascript,
  python,
  typescript,
} from "../assets";
import "./RotatingCube.css";

const faces = [
  { src: mongodb, alt: "MongoDB", className: "face1" },
  { src: nextjs, alt: "Next.js", className: "face2" },
  { src: postgresql, alt: "PostgreSQL", className: "face3" },
  { src: javascript, alt: "JavaScript", className: "face4" },
  { src: python, alt: "Python", className: "face5" },
  { src: typescript, alt: "TypeScript", className: "face6" },
];

const RotatingCube = () => {
  return (
    <div className="stage-cube-cont">
      <div className="cubespinner">
        {faces.map(({ src, alt, className }) => (
          <div key={className} className={className}>
            <img src={src} alt={alt} />
          </div>
        ))}
      </div>
    </div>
  );
};

export default RotatingCube;
