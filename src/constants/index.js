import {
  resume,
  linktree,
  linkedin,
  github,
  html,
  css,
  javascript,
  typescript,
  python,
  redux,
  tailwind,
  mongodb,
  express,
  reactjs,
  nodejs,
  git,
  nextjs,
  thecoderschool,
  issgroup,
  suburbia,
  twitterclone,
  evogym,
} from "../assets";

export const navLinks = [
  {
    id: "about",
    title: "About",
  },
  {
    id: "experience",
    title: "Experience",
  },
  {
    id: "tech",
    title: "Tech",
  },
  {
    id: "projects",
    title: "Projects",
  },
  {
    id: "contact",
    title: "Contact",
  },
];

const services = [
  {
    title: "LinkedIn",
    icon: linkedin,
    url: "https://www.linkedin.com/in/ajfm88",
  },
  {
    title: "Résumé",
    icon: resume,
    url: "https://tr.ee/Xj8r3OZd11",
  },
  {
    title: "GitHub",
    icon: github,
    url: "https://github.com/ajfm88",
  },
  {
    title: "Linktree",
    icon: linktree,
    url: "https://linktr.ee/ajfm88",
  },
];

const technologies = [
  {
    name: "HTML 5",
    icon: html,
  },
  {
    name: "CSS 3",
    icon: css,
  },
  {
    name: "JavaScript",
    icon: javascript,
  },
  {
    name: "TypeScript",
    icon: typescript,
  },
  {
    name: "Python",
    icon: python,
  },
  {
    name: "Next JS",
    icon: nextjs,
  },
  {
    name: "Tailwind CSS",
    icon: tailwind,
  },
  {
    name: "MongoDB",
    icon: mongodb,
  },
  {
    name: "Express JS",
    icon: express,
  },
  {
    name: "React JS",
    icon: reactjs,
  },
  {
    name: "Node JS",
    icon: nodejs,
  },
  {
    name: "git",
    icon: git,
  },
  {
    name: "Redux Toolkit",
    icon: redux,
  },
];

const experiences = [
  {
    title: "Junior Software Developer",
    company_name: "The MBS Group / ISSProps",
    icon: issgroup,
    iconBg: "#383E56",
    date: "June 2022 - Present",
    points: [
      "Developing and maintaining Full Stack, in-house application by performing routine updates.",
      "Collaborating with cross-functional teams including the sales team, the finance team, inventory and returns managers, and the Senior developer to create a high-quality application to be used internally across our different branches.",
      "Implementing responsive design and ensuring cross-browser compatibility.",
      "Acting as a technical consultant for any new functionality prior to implementation.",
    ],
  },
  {
    title: "Code Coach",
    company_name: "The Coder School",
    icon: thecoderschool,
    iconBg: "#E6DEDD",
    date: "May 2021 - June 2022",
    points: [
      "Conducted one-on-one or one-on-two coding lessons for kids. Taught younger kids programming by using Scratch, while older kids gravitated towards learning with Python/JavaScript.",
      "Created small projects or apps that I decided on with them, and generally followed the curriculum of the school.",
      "Polished my coding skills. Gained a strong grasp of basic procedural programming, object-oriented programming and a general knowledge of a few scripting languages such as JavaScript and Python.",
      "Gained teaching experience by teaching kids and teenagers. Communicated well with the students and their parents. Found answers about how to program certain features alongside with them since not everything was known upfront.",
    ],
  },
];

const projects = [
  {
    name: "Suburbia Skateboards",
    description:
      "A stunning skateboard brand website with a interactive customizer app that allows the user to build their own unique skateboard.",
    tags: [
      {
        name: "nextjs",
        color: "gray-text-gradient",
      },
      {
        name: "threejs",
        color: "pink-text-gradient",
      },
      {
        name: "typescript",
        color: "blue-text-gradient",
      },
      {
        name: "tailwind",
        color: "orange-text-gradient",
      },
    ],
    url: "https://suburbia-skate-ajfm88.netlify.app",
    image: suburbia,
    source_code_link: "https://github.com/ajfm88/suburbia-skate",
  },
  {
    name: "Twitter Clone",
    description:
      "A short-form social media app with picture uploads, likes & comments where users share quick posts called 'tweets' with followers.",
    tags: [
      {
        name: "react",
        color: "blue-text-gradient",
      },
      {
        name: "firebase",
        color: "orange-text-gradient",
      },
      {
        name: "tailwind",
        color: "blue-text-gradient",
      },
      {
        name: "nextjs",
        color: "green-text-gradient",
      },
    ],
    url: "https://twitter-clone-ajfm88.vercel.app",
    image: twitterclone,
    source_code_link: "https://github.com/ajfm88/twitter-clone",
  },
  {
    name: "EvoGym",
    description:
      "A fitness React 18 single-page application website with responsive design and contact us page email capabilities.",
    tags: [
      {
        name: "react",
        color: "blue-text-gradient",
      },
      {
        name: "tailwind",
        color: "pink-text-gradient",
      },
      {
        name: "typescript",
        color: "blue-text-gradient",
      },
      {
        name: "vite",
        color: "green-text-gradient",
      },
    ],
    url: "https://evogym-ajfm88.netlify.app",
    image: evogym,
    source_code_link: "https://github.com/ajfm88/evogym",
  },
];

export { services, technologies, experiences, projects };
