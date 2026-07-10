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

/*const experiences = [
  {
    title: "Independent Software Developer / Open Source Contributor",
    company_name: "Digar · Self-employed",
    company_url: "https://digarllc.com",
    icon: digar,
    iconBg: "#383E56",
    date: "Aug 2025 - Present",
    points: [
      "Gained experience working with Large Language Models and integrating them into software applications.",
      "Built a full-stack SaaS AI Resume Builder with Next.js 15, TypeScript, and PostgreSQL, featuring Stripe subscription billing, Clerk authentication, and drag-and-drop resume section reordering via dnd-kit.",
      "Integrated the OpenAI API to power ChatGPT-driven content suggestions that auto-fill resume sections from user input, with output streamed directly into a live-updating form interface.",
      "Contributed features to an open source TypeScript Chrome extension and Fastify backend that automates LinkedIn recruiter triage via a Telegram approval bot and Google Calendar integration.",
      "Currently working on an ongoing migration of server-rendered PHP pages to full React + TypeScript components with useEffect-based data fetching.",
    ],
  },
  {
    title: "Full Stack Software Developer",
    company_name: "The MBS Group (ISS Props division)",
    company_url: "https://issprops.com",
    icon: issgroup,
    iconBg: "#383E56",
    date: "June 2022 - August 2025",
    points: [
      "Implemented new features end-to-end on a full-stack rental and inventory management platform using MeteorJS, Node.js, MongoDB, and JavaScript (ES6+) with MVC architecture, supporting a 1M+ item catalog across US and European offices.",
      "Built new features on a public-facing catalog and prop search application built in Astro with React components.",
      "Designed new endpoints and enhanced existing ones on a backend REST API with Node.js and Express serving the catalog and prop search application.",
      "Created new MongoDB schemas for some features and modified existing schemas and queries to support new functionality and performance improvements.",
      "Owned the full feature lifecycle: gathered requirements from stakeholders, built MongoDB aggregation pipelines (validated with Studio 3T), wrote backend logic, built the UI, manually tested in sandbox, and iterated based on stakeholder feedback.",
      "Built and shipped reporting features for propmasters and set decorators, a dedicated section for the weapons master/armorer role (new routes and UI pages), an image carousel for catalog browsing, a dark mode implementation across the app, and other new panels and sections.",
      "Maintained the company’s public-facing WordPress website (issprops.com) including content updates and tweaks.",
      "Used Git and GitHub for version control: feature branching, pull request code reviews with the senior engineer, and structured commit history.",
      "Operated as the primary helpdesk and sysadmin responder in a 2-person IT team supporting the Los Angeles office (~150 staff at peak); troubleshot hardware, software, and cross-platform issues across Windows, Linux, and macOS for network connectivity, software installations, and system performance.",
      "Documented IT procedures and resolutions in shared OneNote files on the office OneDrive, creating reference material for recurring issues.",
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
      "Delivered personalized 1-on-1 and small-group coding lessons in Scratch, JavaScript, HTML, and CSS to students from elementary through high school, adapting curriculum and teaching style to each student’s age, skill level, and learning pace.",
      "Organized and led week-long Python bootcamps for cohorts of 10-12 middle and high schoolers, with 3-4 students per cohort typically continuing into regular classes.",
    ],
  },
  {
    title: "Business Operations Assistant",
    company_name: "GHD Enterprises",
    company_url: "",
    icon: ghdenterprises,
    iconBg: "#383E56",
    date: "July 2014 - March 2019",
    points: [
      "Queried and maintained relational data using SQL in Microsoft Access, designing reports, performing data validation and cleanup, and delivering structured data outputs to support business operations and management decisions.",
      "Built Excel reports using data exported from Microsoft Access to track advertising performance across radio stations and newspapers, identifying which channels generated the most inbound customer leads.",
      "Maintained financial and client data in Sage Peachtree and Microsoft Access, performing data validation, cleanup, and reconciliation to ensure records were accurate and trustworthy.",
      "Generated sales reports, order documentation, and monthly delivery statements from Excel and Access data to support business decision-making.",
      "Translated written and spoken content between English and Spanish, including correspondence and advertising scripts.",
    ],
  },
];*/

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
