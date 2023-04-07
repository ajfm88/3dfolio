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
  evogym,
  jobify,
  realtorclone,
} from '../assets';

export const navLinks = [
  {
    id: 'about',
    title: 'About',
  },
  {
    id: 'work',
    title: 'Work',
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
    url: 'https://www.linkedin.com/in/ajfm88',
  },
  {
    title: 'Resume',
    icon: resume,
    url: 'https://drive.google.com/file/d/1PaMnfocfEEbOowfjpGdQ9gjMky9i1o6A',
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
  {
    name: 'HTML 5',
    icon: html,
  },
  {
    name: 'CSS 3',
    icon: css,
  },
  {
    name: 'JavaScript',
    icon: javascript,
  },
  {
    name: 'TypeScript',
    icon: typescript,
  },
  {
    name: 'Python',
    icon: python,
  },
  {
    name: 'Redux Toolkit',
    icon: redux,
  },
  {
    name: 'Tailwind CSS',
    icon: tailwind,
  },
  {
    name: 'MongoDB',
    icon: mongodb,
  },
  {
    name: 'Express JS',
    icon: express,
  },
  {
    name: 'React JS',
    icon: reactjs,
  },
  {
    name: 'Node JS',
    icon: nodejs,
  },
  {
    name: 'Next JS',
    icon: nextjs,
  },
  {
    name: 'git',
    icon: git,
  },
];

const experiences = [
  {
    title: 'Junior Software Developer',
    company_name: 'The MBS Group / ISSProps',
    icon: issgroup,
    iconBg: '#383E56',
    date: 'June 2022 - Present',
    points: [
      'Developing and maintaining Full Stack, in-house application by performing routine updates.',
      'Collaborating with cross-functional teams including the sales team, the finance team, inventory and returns managers, and the Senior developer to create a high-quality application to be used internally across our different branches.',
      'Implementing responsive design and ensuring cross-browser compatibility.',
      'Acting as a technical consultant for any new functionality prior to implementation.',
    ],
  },
  {
    title: 'Code Coach',
    company_name: 'The Coder School',
    icon: thecoderschool,
    iconBg: '#E6DEDD',
    date: 'May 2021 - June 2022',
    points: [
      'Conducted one-on-one or one-on-two coding lessons for kids. Taught younger kids programming by using Scratch, while older kids gravitated towards learning with Python/JavaScript.',
      'Created small projects or apps that I decided on with them, and generally followed the curriculum of the school.',
      'Polished my coding skills. Gained a strong grasp of basic procedural programming, object-oriented programming and a general knowledge of a few scripting languages such as JavaScript and Python.',
      'Gained teaching experience by teaching kids and teenagers. Communicated well with the students and their parents. Found answers about how to program certain features alongside with them since not everything was known upfront.',
    ],
  },
];

const testimonials = [
  {
    testimonial:
      'I thought it was impossible to make a website as beautiful as our product, but Alejandro proved me wrong.',
    name: 'Sara Lee',
    designation: 'CFO',
    company: 'Acme Co',
    image: 'https://randomuser.me/api/portraits/women/4.jpg',
  },
  {
    testimonial:
      "I've never met a web developer who truly cares about their clients' success like Alejandro does.",
    name: 'Chris Brown',
    designation: 'COO',
    company: 'DEF Corp',
    image: 'https://randomuser.me/api/portraits/men/5.jpg',
  },
  {
    testimonial:
      "After Alejandro optimized our website, our traffic increased by 50%. We can't thank them enough!",
    name: 'Lisa Wang',
    designation: 'CTO',
    company: '456 Enterprises',
    image: 'https://randomuser.me/api/portraits/women/6.jpg',
  },
];

const projects = [
  {
    name: 'EvoGym',
    description:
      'A fitness React 18 single-page application website with responsive design and contact us page email capabilities.',
    tags: [
      {
        name: 'react',
        color: 'blue-text-gradient',
      },
      {
        name: 'tailwind',
        color: 'pink-text-gradient',
      },
      {
        name: 'typescript',
        color: 'blue-text-gradient',
      },
      {
        name: 'vite',
        color: 'green-text-gradient',
      },
    ],
    image: evogym,
    source_code_link: 'https://github.com/ajfm88/evogym',
  },
  {
    name: 'Jobify',
    description:
      'A Full Stack MERN job tracking app with sign-up and login features, and detailed statistics on job applications month by month.',
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
    image: jobify,
    source_code_link: 'https://github.com/ajfm88/jobify',
  },
  {
    name: 'Realtor.com',
    description:
      'A comprehensive online real estate platform that provides users with up-to-date and accurate information on properties for sale, rent, and other real estate-related services.',
    tags: [
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
        color: 'blue-text-gradient',
      },
      {
        name: 'leaflet',
        color: 'green-text-gradient',
      },
    ],
    image: realtorclone,
    source_code_link: 'https://github.com/ajfm88/realtor-clone',
  },
];

export { services, technologies, experiences, testimonials, projects };
