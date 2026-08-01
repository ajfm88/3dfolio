import { useEffect, useState } from "react";

import { fetchCollection } from "../utils/firestoreRest";
import { mergeTechFaces } from "../constants/tech";
import "./RotatingCube.css";

const RotatingCube = () => {
  // Seeded with the cube built into the bundle rather than starting empty, so the
  // six panels always have logos on them: a Firestore read that is slow, blocked
  // or has no document yet spins the shipped cube instead of six blank sheets of
  // glass, which would read as broken rather than as loading.
  const [faces, setFaces] = useState(() => mergeTechFaces([]));

  useEffect(() => {
    let cancelled = false;

    fetchCollection("tech")
      .then((docs) => {
        const stored = docs[0]?.faces;
        if (!cancelled && Array.isArray(stored) && stored.length > 0) {
          setFaces(mergeTechFaces(stored));
        }
      })
      .catch(() => {
        // Falling back to the shipped cube is the entire error path — there is
        // nothing a visitor could do with a Firestore failure.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="stage-cube-cont">
      <div className="cubespinner">
        {faces.map(({ label, src, rotation }, index) => (
          // The face class places the panel in 3D and is fixed cube geometry; the
          // rotation only turns the image within its face, which is per-logo and
          // therefore comes from the data rather than the stylesheet.
          <div key={index} className={`face${index + 1}`}>
            <img src={src} alt={label} style={{ transform: `rotate(${rotation}deg)` }} />
          </div>
        ))}
      </div>
    </div>
  );
};

export default RotatingCube;
