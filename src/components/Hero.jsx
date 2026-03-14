import { motion } from "framer-motion";
import { TypeAnimation } from "react-type-animation";

import { styles } from "../styles";
import ParticlesBackground from "./canvas/Particles";

const Hero = () => {
  return (
    <section className={`relative w-full h-screen mx-auto overflow-hidden`}>
      {/* Animated background gradient */}
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#120E29] via-[#1D1836] to-[#0A0A12] opacity-80">
        <motion.div
          className="absolute inset-0 opacity-30"
          style={{
            background:
              "radial-gradient(circle at 50% 50%, rgba(145, 94, 255, 0.4) 0%, transparent 50%)",
          }}
          animate={{
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            repeatType: "reverse",
          }}
        />
      </div>

      <ParticlesBackground />

      <div
        className={`absolute inset-0 top-[80px] sm:top-[120px] max-w-7xl mx-auto ${styles.paddingX} flex flex-col items-center md:items-start md:flex-row md:justify-between gap-4 md:gap-8 z-10`}
      >
        {/* Left side content */}
        <motion.div
          className="w-full md:flex-1 flex flex-col justify-center items-center md:items-start mt-0 sm:mt-5 px-4 sm:px-0"
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="flex items-center mb-4 sm:mb-6">
            <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-[#915EFF]" />
            <div className="w-20 sm:w-40 h-1 ml-2 violet-gradient" />
          </div>

          <motion.h1
            className={`${styles.heroHeadText} text-white text-center md:text-left text-[2rem] sm:text-[3rem] md:text-[4rem] leading-tight`}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            Hi, I’m{" "}
            <span className="relative inline-block">
              <span className="text-[#915EFF] hover:text-white hover:bg-[#915EFF] px-2 transition-all duration-300 rounded">
                Alejandro
              </span>
              <motion.span
                className="absolute -bottom-1 sm:-bottom-2 left-0 w-full h-1 bg-[#915EFF]"
                initial={{ width: 0 }}
                animate={{ width: "100%" }}
                transition={{ delay: 0.8, duration: 0.8 }}
              />
            </span>
          </motion.h1>

          <motion.div
            className="relative mt-2 sm:mt-4 w-full text-center md:text-left"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <motion.p
              className={`${styles.heroSubText} text-white-100 text-[1rem] sm:text-[1.25rem] md:text-[1.5rem] leading-relaxed`}
            >
              I build{" "}
              <TypeAnimation
                sequence={[
                  "full stack web apps",
                  1500,
                  "interactive 3D experiences",
                  1500,
                  "scalable MERN solutions",
                  1500,
                  "performant Next.js apps",
                  1500,
                  "innovative software",
                  1500,
                ]}
                wrapper="span"
                speed={50}
                repeat={Infinity}
                className="text-[#915EFF] font-semibold"
              />
            </motion.p>

            {/* Animated underline */}
            <motion.div
              className="absolute -bottom-2 sm:-bottom-4 left-0 h-0.5 bg-gradient-to-r from-transparent via-[#915EFF] to-transparent w-full"
              initial={{ width: 0 }}
              animate={{ width: "100%" }}
              transition={{
                delay: 0.6,
                duration: 1.5,
                repeat: Infinity,
                repeatType: "reverse",
              }}
            />
          </motion.div>

          <motion.p
            className="mt-6 sm:mt-8 text-secondary max-w-md text-[14px] sm:text-[16px] leading-relaxed text-center md:text-left px-4 sm:px-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          >
            Full Stack Software Engineer based in Los Angeles, CA — passionate
            about creating innovative and efficient solutions to complex
            problems.
          </motion.p>

          <motion.div
            className="mt-6 sm:mt-8 flex flex-wrap justify-center md:justify-start gap-3 sm:gap-4 px-4 sm:px-0"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.8 }}
          >
            <motion.a
              href="https://github.com/ajfm88"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-tertiary px-4 sm:px-6 py-2 sm:py-3 rounded-lg text-white flex items-center hover:bg-[#e0434d] transition-all duration-300 shadow-lg text-sm sm:text-base"
              whileHover={{
                scale: 1.05,
                boxShadow: "0 0 20px rgba(145, 94, 255, 0.7)",
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 sm:h-5 sm:w-5 mr-2"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              GitHub
            </motion.a>
            <motion.a
              href="https://linkedin.com/in/ajfm88"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-tertiary px-4 sm:px-6 py-2 sm:py-3 rounded-lg text-white flex items-center hover:bg-[#0077b5] transition-all duration-300 shadow-lg text-sm sm:text-base"
              whileHover={{
                scale: 1.05,
                boxShadow: "0 0 20px rgba(145, 94, 255, 0.7)",
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 sm:h-5 sm:w-5 mr-2"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
              </svg>
              LinkedIn
            </motion.a>
            <motion.a
              href="https://tr.ee/Xj8r3OZd11"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-tertiary px-4 sm:px-6 py-2 sm:py-3 rounded-lg text-white flex items-center hover:bg-[#43E55E] hover:text-black transition-all duration-300 shadow-lg text-sm sm:text-base"
              whileHover={{
                scale: 1.05,
                boxShadow: "0 0 20px rgba(145, 94, 255, 0.7)",
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 sm:h-5 sm:w-5 mr-2"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z" />
              </svg>
              Resume
            </motion.a>
          </motion.div>
        </motion.div>

        {/* Right side decorative element */}
        <motion.div
          className="w-full md:w-auto md:flex-1 flex justify-center items-center mt-8 md:mt-0"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 1 }}
        >
          <div className="relative w-48 h-48 sm:w-64 sm:h-64 md:w-72 md:h-72">
            {/* Animated code brackets */}
            <motion.div
              className="absolute top-0 left-0 text-[80px] sm:text-[120px] md:text-[150px] text-[#915EFF] opacity-20 font-mono"
              animate={{
                y: [0, 10, 0],
                rotateZ: [0, 5, 0],
              }}
              transition={{
                duration: 8,
                repeat: Infinity,
                repeatType: "reverse",
              }}
            >
              {"<"}
            </motion.div>
            <motion.div
              className="absolute bottom-0 right-0 text-[80px] sm:text-[120px] md:text-[150px] text-[#915EFF] opacity-20 font-mono"
              animate={{
                y: [0, -10, 0],
                rotateZ: [0, -5, 0],
              }}
              transition={{
                duration: 8,
                repeat: Infinity,
                repeatType: "reverse",
              }}
            >
              {"/>"}
            </motion.div>

            {/* Animated floating circles */}
            {[...Array(5)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute rounded-full bg-[#915EFF]"
                style={{
                  width: `${Math.random() * 30 + 10}px`,
                  height: `${Math.random() * 30 + 10}px`,
                  left: `${Math.random() * 150}px`,
                  top: `${Math.random() * 150}px`,
                  opacity: Math.random() * 0.5 + 0.1,
                }}
                animate={{
                  y: [0, Math.random() * 30 - 15, 0],
                  x: [0, Math.random() * 30 - 15, 0],
                  scale: [1, Math.random() * 0.3 + 0.8, 1],
                }}
                transition={{
                  duration: Math.random() * 5 + 3,
                  repeat: Infinity,
                  repeatType: "reverse",
                }}
              />
            ))}
          </div>
        </motion.div>
      </div>

      <div className="absolute xs:bottom-5 bottom-2 w-full flex justify-center items-center z-10">
        <motion.a
          href="#about"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 1.2 }}
          className="group"
        >
          <div className="w-[30px] h-[50px] sm:w-[35px] sm:h-[64px] rounded-3xl border-4 border-secondary flex justify-center items-start p-2 hover:border-[#915EFF] transition-colors duration-300 group-hover:shadow-[0_0_15px_rgba(145,94,255,0.6)]">
            <motion.div
              animate={{
                y: [0, 20, 0],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                repeatType: "loop",
              }}
              className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-secondary mb-1 group-hover:bg-[#915EFF] transition-colors duration-300"
            />
          </div>
        </motion.a>
      </div>
    </section>
  );
};

export default Hero;
