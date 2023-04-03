import {
  resume,
  linkedin,
  github,
  html,
  css,
  javascript,
  typescript,
  redux,
  tailwind,
  mongodb,
  express,
  reactjs,
  linktree,
  python,
  nodejs,
  git,
  nextjs,
  carrent,
  jobit,
  tripguide,
  issgroup,
  thecoderschool,
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
    name: 'git',
    icon: git,
  },
  {
    name: 'Next JS',
    icon: nextjs,
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
    name: 'Car Rent',
    description:
      'Web-based platform that allows users to search, book, and manage car rentals from various providers, providing a convenient and efficient solution for transportation needs.',
    tags: [
      {
        name: 'react',
        color: 'blue-text-gradient',
      },
      {
        name: 'mongodb',
        color: 'green-text-gradient',
      },
      {
        name: 'tailwind',
        color: 'pink-text-gradient',
      },
    ],
    image: carrent,
    source_code_link: 'https://github.com/',
  },
  {
    name: 'Job IT',
    description:
      'Web application that enables users to search for job openings, view estimated salary ranges for positions, and locate available jobs based on their current location.',
    tags: [
      {
        name: 'react',
        color: 'blue-text-gradient',
      },
      {
        name: 'restapi',
        color: 'green-text-gradient',
      },
      {
        name: 'scss',
        color: 'pink-text-gradient',
      },
    ],
    image: jobit,
    source_code_link: 'https://github.com/',
  },
  {
    name: 'Trip Guide',
    description:
      'A comprehensive travel booking platform that allows users to book flights, hotels, and rental cars, and offers curated recommendations for popular destinations.',
    tags: [
      {
        name: 'nextjs',
        color: 'blue-text-gradient',
      },
      {
        name: 'supabase',
        color: 'green-text-gradient',
      },
      {
        name: 'css',
        color: 'pink-text-gradient',
      },
    ],
    image: tripguide,
    source_code_link: 'https://github.com/',
  },
];

export { services, technologies, experiences, testimonials, projects };
