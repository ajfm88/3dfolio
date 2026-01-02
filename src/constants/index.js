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
  jobify,
  twitter,
  airesume,
  evogym,
  imdb,
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
    url: "https://linkedin.com/in/ajfm88",
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
    date: "June 2022 - August 2025",
    points: [
      "Worked on a complete internal Full Stack rental and inventory management application using JavaScript, Node.js, MeteorJS with MVC architecture, and MongoDB.",
      "Architected and developed a public-facing customer prop search application using Astro with React components, implementing reusable UI components and templated controls.",
      "Designed and implemented a RESTful API backend using Express and Node.js to power the public-facing customer prop search application.",
      "Utilized Git and GitHub for version control implementing feature branching workflows.",
      "Managed WordPress CMS to update and maintain our primary company website, ensuring consistent branding and user experience.",
    ],
  },
  {
    title: "Code Coach",
    company_name: "The Coder School",
    icon: thecoderschool,
    iconBg: "#E6DEDD",
    date: "May 2021 - June 2022",
    points: [
      "Organized and led week-long coding bootcamps teaching Python programming fundamentals to middle and high schoolers.",
      "Planned and executed small but fun projects in Scratch for one-on-one coding lessons with elementary school children.",
      "Gained teaching experience by teaching kids and teenagers. Communicated well with the students and their parents.",
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
        color: "black-gradient",
      },
      {
        name: "typescript",
        color: "pink-text-gradient",
      },
      {
        name: "threejs",
        color: "orange-text-gradient",
      },
      {
        name: "tailwind",
        color: "green-text-gradient",
      },
    ],
    url: "https://suburbia-skate-ajfm88.netlify.app",
    image: suburbia,
    source_code_link: "https://github.com/ajfm88/suburbia-skate",
  },
  {
    name: "Jobify",
    description:
      "A Full Stack MERN job tracking app that allows users to manage their job search and view detailed monthly statistics.",
    tags: [
      {
        name: "mongodb",
        color: "green-text-gradient",
      },
      {
        name: "express",
        color: "black-gradient",
      },
      {
        name: "react",
        color: "blue-text-gradient",
      },
      {
        name: "nodejs",
        color: "green-text-gradient",
      },
    ],
    url: "https://jobify-ajfm88.onrender.com",
    image: jobify,
    source_code_link: "https://github.com/ajfm88/jobify",
  },
  {
    name: "Twitter Clone",
    description:
      "A short-form social media app with picture uploads, likes & comments where users share quick posts called 'tweets' with followers.",
    tags: [
      {
        name: "nextjs",
        color: "black-gradient",
      },
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
        color: "green-text-gradient",
      },
    ],
    url: "https://twitter-clone-ajfm88.vercel.app",
    image: twitter,
    source_code_link: "https://github.com/ajfm88/twitter-clone",
  },
  {
    name: "EvoGym",
    description:
      "A stunning and responsive SPA fitness brand website created with React, TypeScript and TailwindCSS.",
    tags: [
      {
        name: "react",
        color: "blue-text-gradient",
      },
      {
        name: "tailwind",
        color: "green-text-gradient",
      },
      {
        name: "typescript",
        color: "pink-text-gradient",
      },
      {
        name: "vite",
        color: "orange-text-gradient",
      },
    ],
    url: "https://evogym-ajfm88.netlify.app",
    image: evogym,
    source_code_link: "https://github.com/ajfm88/evogym",
  },
  {
    name: "AI Resume Builder",
    description:
      "A Full Stack, ChatGPT-powered SaaS application for creating stunning resumes with the help of AI.",
    tags: [
      {
        name: "nextjs",
        color: "black-gradient",
      },
      {
        name: "react",
        color: "blue-text-gradient",
      },
      {
        name: "openai",
        color: "green-text-gradient",
      },
      {
        name: "typescript",
        color: "pink-text-gradient",
      },
    ],
    url: "https://ai-resume-builder-ajfm88.vercel.app",
    image: airesume,
    source_code_link: "https://github.com/ajfm88/ai-resume-builder",
  },
  {
    name: "IMDB Clone",
    description:
      "An IMDb clone built with Next.js and The Movie Database (TMDB) API, featuring movie and TV show browsing with information and ratings.",
    tags: [
      {
        name: "nextjs",
        color: "black-gradient",
      },
      {
        name: "react",
        color: "blue-text-gradient",
      },
      {
        name: "tmdb",
        color: "orange-text-gradient",
      },
      {
        name: "tailwind",
        color: "green-text-gradient",
      },
    ],
    url: "https://imdb-clone-ajfm88.vercel.app",
    image: imdb,
    source_code_link: "https://github.com/ajfm88/imdb-clone",
  },
];

export { services, technologies, experiences, projects };
