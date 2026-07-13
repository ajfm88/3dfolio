import {
  resume,
  linktree,
  linkedin,
  github,
  suburbia,
  jobify,
  airesume,
} from "../assets";

export const navLinks = [
  {
    id: "about",
    title: "About Me",
  },
  {
    id: "experience",
    title: "Work Experience",
  },
  {
    id: "tech",
    title: "Tech Stack",
  },
  {
    id: "projects",
    title: "Projects",
  },
  {
    id: "contact",
    title: "Contact Me",
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

const projects = [
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
  /*{
    name: "Twitter Clone",
    description:
      "A short-form social media app with picture uploads, likes & comments where users share quick posts called tweets with followers.",
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
  },*/
];

export { services, projects };
