import { Environment, Float, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";

const TechModel = ({ modelPath, scale, rotation }) => {
  const { scene } = useGLTF(modelPath);
  return (
    <Float speed={5.5} rotationIntensity={0.5} floatIntensity={0.9}>
      <group scale={scale} rotation={rotation}>
        <primitive object={scene} />
      </group>
    </Float>
  );
};

const TechIconCard = ({ modelPath, scale, rotation }) => {
  return (
    <Canvas>
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 5, 5]} intensity={1} />
      <spotLight
        position={[10, 15, 10]}
        angle={0.3}
        penumbra={1}
        intensity={2}
      />
      <Environment preset="city" />
      <TechModel modelPath={modelPath} scale={scale} rotation={rotation} />
      <OrbitControls enableZoom={false} />
    </Canvas>
  );
};

export default TechIconCard;
