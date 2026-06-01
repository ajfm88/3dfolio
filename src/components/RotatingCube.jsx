import { mongodb, postgresql, reactjs, nodejs, python, typescript } from '../assets';
import './RotatingCube.css';

const faces = [
  { src: mongodb,    alt: 'MongoDB',    className: 'face1' },
  { src: reactjs,    alt: 'React',      className: 'face2' },
  { src: postgresql, alt: 'PostgreSQL',  className: 'face3' },
  { src: nodejs,     alt: 'Node.js',    className: 'face4' },
  { src: python,     alt: 'Python',     className: 'face5' },
  { src: typescript, alt: 'TypeScript', className: 'face6' },
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
