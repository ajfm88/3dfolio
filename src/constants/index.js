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
  suburbia,
  jobify,
  twitter,
  airesume,
  evogym,
  imdb,
} from '../assets';

export const navLinks = [
  {
    id: 'about',
    title: 'About',
  },
  {
    id: 'experience',
    title: 'Experience',
  },
  {
    id: 'tech',
    title: 'Tech',
  },
  {
    id: 'projects',
    title: 'Projects',
  },
  {
    id: 'contact',
    title: 'Contact',
  },
];

const services = [
  {
    title: 'LinkedIn',
    icon: linkedin,
    url: 'https://linkedin.com/in/ajfm88',
  },
  {
    title: 'Résumé',
    icon: resume,
    url: 'https://tr.ee/Xj8r3OZd11',
  },
  {
    title: 'GitHub',
    icon: github,
    url: 'https://github.com/ajfm88',
  },
  {
    title: 'Linktree',
    icon: linktree,
    url: 'https://linktr.ee/ajfm88',
  },
];

const technologies = [
  // Fundamentals
  {
    name: 'HTML 5',
    icon: html,
    url: 'https://html.spec.whatwg.org',
  },
  {
    name: 'CSS 3',
    icon: css,
    url: 'https://w3.org/Style/CSS',
  },
  {
    name: 'JavaScript',
    icon: javascript,
    url: 'https://javascript.info',
  },
  {
    name: 'TypeScript',
    icon: typescript,
    url: 'https://typescriptlang.org',
  },
  {
    name: 'Python',
    icon: python,
    url: 'https://python.org',
  },
  // JS ecosystem & styling
  {
    name: 'Next JS',
    icon: nextjs,
    url: 'https://nextjs.org',
  },
  {
    name: 'Tailwind CSS',
    icon: tailwind,
    url: 'https://tailwindcss.com',
  },
  {
    name: 'Redux',
    icon: redux,
    url: 'https://redux.js.org',
  },
  {
    name: 'Git',
    icon: git,
    url: 'https://git-scm.com',
  },
  // MERN stack
  {
    name: 'MongoDB',
    icon: mongodb,
    url: 'https://mongodb.com',
  },
  {
    name: 'Express JS',
    icon: express,
    url: 'https://expressjs.com',
  },
  {
    name: 'React',
    icon: reactjs,
    url: 'https://react.dev',
  },
  {
    name: 'Node JS',
    icon: nodejs,
    url: 'https://nodejs.org',
  },
  // Databases & ORM
  {
    name: 'PostgreSQL',
    icon: postgresql,
    url: 'https://postgresql.org',
  },
  {
    name: 'Prisma',
    icon: prisma,
    url: 'https://prisma.io',
  },
  // DevOps & tools
  {
    name: 'AWS',
    icon: aws,
    url: 'https://aws.amazon.com',
  },
  {
    name: 'Docker',
    icon: docker,
    url: 'https://docker.com',
  },
  {
    name: 'GitHub',
    icon: githubicon,
    url: 'https://github.com',
  },
];

const experiences = [
  {
    title: 'Software Developer',
    company_name: 'The MBS Group / ISS Props',
    company_url: 'https://issprops.com',
    icon: issgroup,
    iconBg: '#383E56',
    date: 'June 2022 - April 2026',
    points: [
      'Developed a full-stack rental and inventory management platform using MeteorJS, Node.js, and MongoDB with MVC architecture, replacing legacy systems and improving operational efficiency by 40%.',
      'Architected a public-facing prop search application using Astro and React, building a reusable component library and templated controls for a performant, consistent UI.',
      'Designed and built a RESTful API with Node.js and Express to serve the prop search application, enabling clean separation between client and server layers.',
      'Practiced Git/GitHub workflows including feature branching, pull request code reviews, and structured commit histories.',
      'Maintained the company WordPress site, managing content updates and ensuring consistent branding.',
      'Provided IT support for 150+ employees across Windows, Linux, and macOS — troubleshooting hardware, software, and cross-platform issues.',
      'Managed helpdesk operations via Asana, documenting resolutions and building an internal knowledge base for recurring issues.',
    ],
  },
  {
    title: 'Code Coach',
    company_name: 'The Coder School',
    company_url: 'https://thecoderschool.com/locations/missionviejo',
    icon: thecoderschool,
    iconBg: '#E6DEDD',
    date: 'April 2021 - June 2022',
    points: [
      "Delivered personalized 1-on-1 and small-group coding lessons in Scratch, JavaScript, HTML, and CSS to students ranging from elementary through high school, adapting curriculum and teaching style to each student's age, skill level, and learning pace.",
      'Organized and led week-long Python bootcamps for cohorts of 15–20 middle and high schoolers, with roughly 5 students per cohort converting to full-time enrollment.',
      'Wrote and adapted lesson curriculum to match individual student goals, ensuring material stayed engaging and appropriately challenging as students progressed.',
      'Tracked student progress and produced regular reports, maintaining clear communication with parents on skill development, project milestones, and next learning steps.',
      'Guided students through building real projects from scratch, resulting in measurable skill progression and consistent positive feedback from students and families.',
    ],
  },
];

const projects = [
  {
    name: 'AI Resume Builder',
    description:
      'A Full Stack, ChatGPT-powered SaaS application for creating stunning resumes with the help of AI.',
    tags: [
      {
        name: 'nextjs',
        color: 'black-gradient',
      },
      {
        name: 'react',
        color: 'blue-text-gradient',
      },
      {
        name: 'openai',
        color: 'green-text-gradient',
      },
      {
        name: 'typescript',
        color: 'pink-text-gradient',
      },
    ],
    url: 'https://ai-resume-builder-ajfm88.vercel.app',
    image: airesume,
    source_code_link: 'https://github.com/ajfm88/ai-resume-builder',
  },
  {
    name: 'Suburbia Skateboards',
    description:
      'A stunning skateboard brand website with a interactive customizer app that allows the user to build their own unique skateboard.',
    tags: [
      {
        name: 'nextjs',
        color: 'black-gradient',
      },
      {
        name: 'typescript',
        color: 'pink-text-gradient',
      },
      {
        name: 'threejs',
        color: 'orange-text-gradient',
      },
      {
        name: 'tailwind',
        color: 'green-text-gradient',
      },
    ],
    url: 'https://suburbia-skate-ajfm88.netlify.app',
    image: suburbia,
    source_code_link: 'https://github.com/ajfm88/suburbia-skate',
  },
  {
    name: 'Jobify',
    description:
      'A Full Stack MERN job tracking app that allows users to manage their job search and view detailed monthly statistics.',
    tags: [
      {
        name: 'mongodb',
        color: 'green-text-gradient',
      },
      {
        name: 'express',
        color: 'black-gradient',
      },
      {
        name: 'react',
        color: 'blue-text-gradient',
      },
      {
        name: 'nodejs',
        color: 'green-text-gradient',
      },
    ],
    url: 'https://jobify-ajfm88.onrender.com',
    image: jobify,
    source_code_link: 'https://github.com/ajfm88/jobify',
  },
  {
    name: 'Twitter Clone',
    description:
      'A short-form social media app with picture uploads, likes & comments where users share quick posts called tweets with followers.',
    tags: [
      {
        name: 'nextjs',
        color: 'black-gradient',
      },
      {
        name: 'react',
        color: 'blue-text-gradient',
      },
      {
        name: 'firebase',
        color: 'orange-text-gradient',
      },
      {
        name: 'tailwind',
        color: 'green-text-gradient',
      },
    ],
    url: 'https://twitter-clone-ajfm88.vercel.app',
    image: twitter,
    source_code_link: 'https://github.com/ajfm88/twitter-clone',
  },
  {
    name: 'EvoGym',
    description:
      'A stunning and responsive SPA fitness brand website created with React, TypeScript and TailwindCSS.',
    tags: [
      {
        name: 'react',
        color: 'blue-text-gradient',
      },
      {
        name: 'tailwind',
        color: 'green-text-gradient',
      },
      {
        name: 'typescript',
        color: 'pink-text-gradient',
      },
      {
        name: 'vite',
        color: 'orange-text-gradient',
      },
    ],
    url: 'https://evogym-ajfm88.netlify.app',
    image: evogym,
    source_code_link: 'https://github.com/ajfm88/evogym',
  },
  {
    name: 'IMDB Clone',
    description:
      'An IMDb clone built with Next.js and The Movie Database (TMDB) API, featuring movie and TV show browsing with information and ratings.',
    tags: [
      {
        name: 'nextjs',
        color: 'black-gradient',
      },
      {
        name: 'react',
        color: 'blue-text-gradient',
      },
      {
        name: 'tmdb',
        color: 'orange-text-gradient',
      },
      {
        name: 'tailwind',
        color: 'green-text-gradient',
      },
    ],
    url: 'https://imdb-clone-ajfm88.vercel.app',
    image: imdb,
    source_code_link: 'https://github.com/ajfm88/imdb-clone',
  },
];

export { services, technologies, experiences, projects };
