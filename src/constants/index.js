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
  tailwind,
  mongodb,
  express,
  reactjs,
  nodejs,
  git,
  postgresql,
  docker,
  aws,
  githubicon,
  redux,
  prisma,
  nextjs,
  thecoderschool,
  issgroup,
  digar,
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

const technologies = [
  // Fundamentals
  {
    name: "HTML 5",
    icon: html,
    url: "https://html.spec.whatwg.org",
  },
  {
    name: "CSS 3",
    icon: css,
    url: "https://w3.org/style/css",
  },
  {
    name: "JavaScript",
    icon: javascript,
    url: "https://javascript.info",
  },
  {
    name: "TypeScript",
    icon: typescript,
    url: "https://typescriptlang.org",
  },
  {
    name: "Python",
    icon: python,
    url: "https://python.org",
  },
  // JS ecosystem & styling
  {
    name: "Next JS",
    icon: nextjs,
    url: "https://nextjs.org",
  },
  {
    name: "Tailwind CSS",
    icon: tailwind,
    url: "https://tailwindcss.com",
  },
  {
    name: "Redux",
    icon: redux,
    url: "https://redux.js.org",
  },
  {
    name: "Git",
    icon: git,
    url: "https://git-scm.com",
  },
  // MERN stack
  {
    name: "MongoDB",
    icon: mongodb,
    url: "https://mongodb.com",
  },
  {
    name: "Express JS",
    icon: express,
    url: "https://expressjs.com",
  },
  {
    name: "React",
    icon: reactjs,
    url: "https://react.dev",
  },
  {
    name: "Node JS",
    icon: nodejs,
    url: "https://nodejs.org",
  },
  // Databases & ORM
  {
    name: "PostgreSQL",
    icon: postgresql,
    url: "https://postgresql.org",
  },
  {
    name: "Prisma",
    icon: prisma,
    url: "https://prisma.io",
  },
  // DevOps & tools
  {
    name: "AWS",
    icon: aws,
    url: "https://aws.amazon.com",
  },
  {
    name: "Docker",
    icon: docker,
    url: "https://docker.com",
  },
  {
    name: "GitHub",
    icon: githubicon,
    url: "https://github.com",
  },
];

const experiences = [
  {
    title: "Independent Software Developer / Open Source Contributor",
    company_name: "Digar · Self-employed",
    company_url: "https://digarllc.com",
    icon: digar,
    iconBg: "#383E56",
    date: "Aug 2025 - Present",
    points: [
      "Shipped features for a TypeScript Chrome extension + Node.js backend that automates LinkedIn recruiter triage via a Telegram approval bot and Google Calendar.",
      "Helped build a Node.js / TypeScript REST API with API-key auth, per-key rate limiting, and schema validation.",
      "Delivered React + TypeScript features against a MySQL-backed REST API, including a new JWT-authenticated endpoint that retired a SQL-injectable legacy route.",
      "Worked on an ongoing migration of server-rendered PHP pages to full React + TypeScript components with useEffect-based data fetching.",
      "Maintainer and contributor of an open-source PHP routing library.",
    ],
  },
  {
    title: "Junior Software Developer",
    company_name: "The MBS Group (ISS Props division)",
    company_url: "https://issprops.com",
    icon: issgroup,
    iconBg: "#383E56",
    date: "June 2022 - August 2025",
    points: [
      "Implemented new features end-to-end on a full-stack rental and inventory management platform using MeteorJS, Node.js, MongoDB, and JavaScript (ES6+) with MVC architecture, supporting a 1M+ item catalog across US and European offices.",
      "Built components and new features on a public-facing prop search application built in Astro with React.",
      "Designed new endpoints and enhanced existing ones on a backend REST API with Node.js and Express serving the prop search application.",
      "Created new MongoDB schemas for some features and modified existing schemas and queries to support new functionality and performance improvements.",
      "Owned the full feature lifecycle: gathered requirements from stakeholders, built MongoDB aggregation pipelines (validated with Studio 3T), wrote backend logic, built the UI, manually tested in sandbox, and iterated based on stakeholder feedback.",
      "Built and shipped reporting features for propmasters and set decorators, a dedicated section for the weapons master/armorer role (new routes and UI pages), an image carousel for catalog browsing, a dark mode implementation across the app, and other new panels and sections.",
      "Maintained the company's public-facing WordPress website (issprops.com), including content updates and plugin maintenance.",
      "Used Git and GitHub for version control: feature branching, pull request code reviews with the senior engineer, and structured commit history.",
      "Operated as the primary helpdesk and sysadmin responder in a 2-person IT team supporting the Los Angeles office (~150 staff at peak); troubleshot hardware, software, and cross-platform issues across Windows, Linux, and macOS for network connectivity, software installations, and system performance.",
      "Documented IT procedures and resolutions in shared OneNote files on the office OneDrive, creating reference material for recurring issues.",
      "Role ended August 2025 due to company-wide layoffs across multiple departments.",
    ],
  },
  {
    title: "Code Coach",
    company_name: "theCoderSchool",
    company_url: "https://thecoderschool.com/locations/missionviejo",
    icon: thecoderschool,
    iconBg: "#E6DEDD",
    date: "May 2021 - June 2022",
    points: [
      "Delivered personalized 1-on-1 and small-group coding lessons in Scratch, JavaScript, HTML, and CSS to students from elementary through high school, adapting curriculum and teaching style to each student's age, skill level, and learning pace.",
      "Organized and led week-long Python bootcamps for cohorts of 10-12 middle and high schoolers, with 3-4 students per cohort typically continuing into regular classes.",
      "Guided students through building real projects from scratch, with noticeable skill progression and consistent positive feedback from students and families.",
    ],
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

export { services, technologies, experiences, projects };
