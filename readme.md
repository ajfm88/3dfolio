<div align="center">
  <br />
    <a href="https://3dfolio-ajfm88.vercel.app">
      <img src="https://github-production-user-asset-6210df.s3.amazonaws.com/151519281/292722498-4722160a-8e61-403f-a905-728feae1f7e6.png" alt="Project Banner">
    </a>
  <br />

  <div>
    <a href="https://www.mongodb.com">
      <img src="https://img.shields.io/badge/-MongoDB-black?style=for-the-badge&logoColor=white&logo=mongodb&color=47A248" alt="mongodb" />
    </a>
    <a href="https://expressjs.com">
      <img src="https://img.shields.io/badge/-Express-black?style=for-the-badge&logoColor=white&logo=express&color=000000" alt="express" />
    </a>
    <a href="https://react.dev">
      <img src="https://img.shields.io/badge/-React_JS-black?style=for-the-badge&logoColor=white&logo=react&color=61DAFB" alt="react.js" />
    </a>
    <a href="https://nodejs.org">
      <img src="https://img.shields.io/badge/-Node_JS-black?style=for-the-badge&logoColor=white&logo=nodedotjs&color=5FA04E" alt="node.js" />
    </a>
    <a href="https://threejs.org">
      <img src="https://img.shields.io/badge/-Three_JS-black?style=for-the-badge&logoColor=white&logo=threedotjs&color=000000" alt="three.js" />
    </a>
    <a href="https://vitejs.dev">
      <img src="https://img.shields.io/badge/-Vite-black?style=for-the-badge&logoColor=white&logo=vite&color=646CFF" alt="vite" />
    </a>
    <a href="https://r3f.docs.pmnd.rs">
      <img src="https://img.shields.io/badge/-React_Three_Fiber-black?style=for-the-badge&logoColor=white&logo=threedotjs&color=000000" alt="react three fiber" />
    </a>
    <a href="https://reactrouter.com">
      <img src="https://img.shields.io/badge/-React_Router-black?style=for-the-badge&logoColor=white&logo=reactrouter&color=CA4245" alt="react router" />
    </a>
    <a href="https://drei.pmnd.rs">
      <img src="https://img.shields.io/badge/-React_Three_Drei-black?style=for-the-badge&logoColor=white&logo=threedotjs&color=000000" alt="react three drei" />
    </a>
    <a href="https://tailwindcss.com">
      <img src="https://img.shields.io/badge/-Tailwind_CSS-black?style=for-the-badge&logoColor=white&logo=tailwindcss&color=06B6D4" alt="tailwindcss" />
    </a>
    <a href="https://firebase.google.com">
      <img src="https://img.shields.io/badge/-Firebase-black?style=for-the-badge&logoColor=white&logo=firebase&color=DD2C00" alt="firebase" />
    </a>
    <a href="https://framer.com/motion">
      <img src="https://img.shields.io/badge/-Framer_Motion-black?style=for-the-badge&logoColor=white&logo=framer&color=0055FF" alt="framer motion" />
    </a>
    <a href="https://socket.io">
      <img src="https://img.shields.io/badge/-Socket.io-black?style=for-the-badge&logoColor=white&logo=socketdotio&color=010101" alt="socket.io" />
    </a>
    <a href="https://clerk.com">
      <img src="https://img.shields.io/badge/-Clerk-black?style=for-the-badge&logoColor=white&logo=clerk&color=6C47FF" alt="clerk" />
    </a>
    <a href="https://imagekit.io">
      <img src="https://img.shields.io/badge/-ImageKit-black?style=for-the-badge&logoColor=white&logo=imagekit&color=1E7CF5" alt="imagekit" />
    </a>
  </div>

  <h3 align="center">3D Personal Portfolio Website</h3>
</div>

## 📋 <a name="table">Table of Contents</a>

1.  🤖 [Introduction](#introduction)
2.  🚀 [Live App](#live-app)
3.  🏗️ [Architecture](#architecture)
4.  ⚙️ [Tech Stack](#tech-stack)
5.  🔋 [Features](#features)
6.  🗂️ [Project Structure](#project-structure)
7.  🧭 [Pages and Routes](#pages-and-routes)
8.  🤸 [Quick Start](#quick-start)

## 🤖 <a name="introduction">Introduction</a>

Personal website of Alejandro J. Foucault (ajfm88) — a 3D React portfolio front end, alongside three extra tools that share the same domain: a **GitHub Follower Tracker** (`/gft`), a **blog** (`/blog`), and a **real-time chat** (`/chat`).

## 🚀 <a name="live-app">Live App</a>

<a href="https://3dfolio-ajfm88.vercel.app"><img src="https://img.shields.io/badge/Frontend-Vercel-000000?style=for-the-badge&logo=vercel"/></a>
<a href="https://3dfolio-ajfm88-server.onrender.com"><img src="https://img.shields.io/badge/Backend-Render-46E3B7?style=for-the-badge&logo=render"/></a>

## 🏗️ <a name="architecture">Architecture</a>

The site runs on two backends, each serving the half of the app it fits.

| Layer                         | Backend                                      | Powers                                        | Hosting |
| ----------------------------- | -------------------------------------------- | --------------------------------------------- | ------- |
| This root project             | Firebase — Firestore, Storage, Auth          | The 3D portfolio, `/gft`, and the admin panel | Vercel  |
| [`server/`](server/readme.md) | Express, MongoDB, Clerk, Socket.io, ImageKit | `/blog` and `/chat`                           | Render  |

Firebase serves single-author content over plain REST calls, with no server to run or keep alive. The blog and chat need relational references between users, posts, comments, and messages, plus a WebSocket server for presence and message delivery, so they run against a separate API committed in [`server/`](server/readme.md). Both features share one auth system, one database, and one deployment rather than standing up two.

Every feature route is lazy-loaded, so Clerk, Axios, Zustand, and socket.io-client never reach the main portfolio bundle. The full API surface, schema, and socket events are documented in [`server/readme.md`](server/readme.md).

## ⚙️ <a name="tech-stack">Tech Stack</a>

<div align="center">
  <img src="./mern.png" alt="MERN stack — MongoDB, Express, React, Node" width="600">
</div>

**Frontend — core (this repo, `src/`):**

- ⚛️ [React](https://react.dev)
- ⚡ [Vite](https://vitejs.dev)
- 🧭 [React Router](https://reactrouter.com)
- 🌬️ [Tailwind CSS](https://tailwindcss.com)

**Frontend — 3D and motion:**

- 🔺 [Three.js](https://threejs.org)
- 🧵 [React Three Fiber](https://r3f.docs.pmnd.rs)
- 🔧 [React Three Drei](https://drei.pmnd.rs)
- 🎞️ [Framer Motion](https://framer.com/motion)

**Frontend — data, auth and content:**

- 🔥 [Firebase](https://firebase.google.com)
- 🔐 [Clerk](https://clerk.com)
- 🔄 [TanStack Query](https://tanstack.com/query)
- 📡 [Axios](https://axios-http.com)
- 🐻 [Zustand](https://zustand.docs.pmnd.rs)
- 🔌 [Socket.io Client](https://socket.io)
- ✍️ [React Quill](https://github.com/VaguelySerious/react-quill)
- 🖼️ [ImageKit](https://imagekit.io)
- 🔔 [React Toastify](https://fkhadra.github.io/react-toastify)
- 🕒 [timeago.js](https://timeago.ling.pub)

**Backend ([`server/`](server/readme.md), deployed separately on Render):**

- 🟢 [Node.js](https://nodejs.org)
- 🚂 [Express](https://expressjs.com)
- 🍃 [MongoDB Atlas](https://www.mongodb.com/atlas)
- 🧬 [Mongoose](https://mongoosejs.com)
- 🔐 [Clerk](https://clerk.com)
- 🔌 [Socket.io](https://socket.io)
- 🖼️ [ImageKit](https://imagekit.io)
- 📤 [Multer](https://github.com/expressjs/multer)

Full architecture, API surface and design rationale live in **[`server/readme.md`](server/readme.md)**.

## 🔋 <a name="features">Features</a>

🎨 **Interactive Experience and Work Sections:** Utilizes animations powered by Framer Motion for engaging user experience.

💡 **3D Skills Section:** Showcases skills using 3D geometries through Three.js and React Three Fiber.

🎬 **Animated Projects:** Features animated sections using Framer Motion for projects.

🌍 **Contact Section with 3D Earth Model:** Integrates a rotatable 3D earth model with email functionality.

✨ **3D Stars:** Generates stars progressively at random positions using Three.js for background display.

🎞️ **Consistent Animations:** Implements cohesive animations throughout the website using Framer Motion.

📱 **Responsive Design:** Ensures optimal display and functionality across all devices.

🖌️ **Tailwind CSS Styling:** Styled with Tailwind CSS for a modern and responsive design.

🔥 **Firebase-Powered Admin Panel:** Edits site content from a private, Google-authenticated dashboard backed by Firestore and Firebase Storage.

🔎 **GitHub Follower Tracker (`/gft`):** Compares snapshots of any account's followers over time to reveal new follows and unfollows, entirely client-side.

✍️ **Blog Authoring (`/blog`):** Publishes rich-text posts with cover images uploaded straight from the browser to ImageKit.

🗂️ **Blog Browsing:** Filters posts by category, author, search and sort — including visit-backed Popular and Trending — through shareable URLs.

💬 **Blog Comments:** Opens every post to any signed-in reader, while authoring stays restricted to the owner and enforced at the API.

⚡ **Real-Time Chat (`/chat`):** Delivers messages instantly between signed-in accounts over Socket.io, with no polling.

🖼️ **Chat Media:** Sends images and videos with optional captions, expanding inline through a lightbox or a native video player.

🟢 **Chat Presence and Sounds:** Tracks who is online, badges unread conversations, and chimes on arrival behind a sound toggle.

🧩 **Lazy Feature Routes:** Loads the admin panel, blog and chat as separate bundles so none of them weigh down the 3D portfolio.

## 🗂️ <a name="project-structure">Project Structure</a>

```
3dfolio/
├── public/                                 # Served as-is, filenames stable across builds
│   ├── models/                             # Draco-compressed .glb models for the rotating cube
│   ├── planet/                             # glTF earth model used by the contact section
│   ├── sounds/                             # Chat keystroke and notification audio
│   ├── ajfm88-alejandro-foucault.png       # Wordmark used by the portfolio and chat navbars
│   ├── ajfm88-alejandro-foucault-blog.png  # Dark-on-light wordmark for the blog navbar
│   ├── favicon.png
│   ├── hero-bg.svg
│   ├── og-image.png                        # 1200x630 link-preview card
│   ├── robots.txt
│   ├── sitemap.xml
│   └── skills-bg.webm
├── server/                                 # Express + MongoDB + Socket.io API — see server/readme.md
├── src/
│   ├── admin/
│   │   ├── AdminLogin.jsx                  # Google sign-in screen for the panel
│   │   ├── AdminShell.jsx                  # Panel frame and navigation between managers
│   │   ├── useAuth.js                      # Firebase auth state and owner-account check
│   │   ├── AboutManager.jsx                # Editor for the About section
│   │   ├── aboutApi.js                     # Firestore reads and writes for About
│   │   ├── ExperienceManager.jsx           # List view for timeline entries
│   │   ├── ExperienceForm.jsx              # Create and edit form for one entry
│   │   ├── experiencesApi.js               # Firestore reads and writes for Experience
│   │   ├── HeroManager.jsx                 # Editor for the hero tagline
│   │   ├── heroApi.js                      # Firestore reads and writes for Hero
│   │   ├── ProjectManager.jsx              # List view for projects
│   │   ├── ProjectForm.jsx                 # Create and edit form for one project
│   │   ├── projectsApi.js                  # Firestore reads and writes for Projects
│   │   ├── TechManager.jsx                 # Editor for the six rotating cube faces
│   │   └── techApi.js                      # Firestore reads and writes for Tech
│   ├── assets/
│   │   ├── tech/                           # Technology logos for the cube fallback data
│   │   ├── close.svg                       # Mobile menu close icon
│   │   ├── github.png                      # Source link icon on project cards
│   │   ├── index.js                        # Asset barrel export
│   │   └── menu.svg                        # Mobile menu open icon
│   ├── blog/
│   │   ├── components/
│   │   │   ├── BlogNavbar.jsx              # Blog header with search and auth controls
│   │   │   ├── Comment.jsx                 # A single comment row
│   │   │   ├── Comments.jsx                # Comment list and composer
│   │   │   ├── FeaturedPosts.jsx           # Featured section on the blog homepage
│   │   │   ├── Image.jsx                   # ImageKit-backed responsive image
│   │   │   ├── MainCategories.jsx          # Category bar with inline search
│   │   │   ├── PostList.jsx                # Infinite-scrolling post list
│   │   │   ├── PostListItem.jsx            # A single post card
│   │   │   ├── PostMenuActions.jsx         # Feature and delete actions for the owner
│   │   │   ├── Search.jsx                  # Search input writing to the query string
│   │   │   ├── SideMenu.jsx                # Filter and sort sidebar
│   │   │   └── Upload.jsx                  # Direct browser-to-ImageKit upload wrapper
│   │   ├── layouts/
│   │   │   └── BlogLayout.jsx              # Light-theme page frame and blog-root scope
│   │   ├── lib/
│   │   │   ├── axios.js                    # Blog axios instance with optional bearer token
│   │   │   ├── useBlogUsername.js          # Resolves the display handle for an author
│   │   │   └── useIsAdmin.js               # Reads the owner role off the Clerk session
│   │   ├── routes/
│   │   │   ├── Homepage.jsx                # Blog landing page
│   │   │   ├── PostListPage.jsx            # Full post list with filters
│   │   │   ├── SinglePostPage.jsx          # One post, its author, and its comments
│   │   │   └── Write.jsx                   # Rich-text editor, owner only
│   │   └── blog.css                        # Styles for editor chrome and rendered post HTML
│   ├── chat/
│   │   ├── components/
│   │   │   ├── AvatarWithOnlineIndicator.jsx  # Avatar with a presence dot
│   │   │   ├── ChatComposer.jsx            # Message input, media picker, typing relay
│   │   │   ├── ChatHeader.jsx              # Active conversation header
│   │   │   ├── ChatSidebar.jsx             # Conversation and contact list
│   │   │   ├── ConversationRow.jsx         # A single sidebar row with unread badge
│   │   │   ├── MessageBubble.jsx           # One message, with media and caption
│   │   │   └── MessageList.jsx             # Scrolling thread with typing indicator
│   │   ├── hooks/
│   │   │   ├── useKeyboardSound.js         # Keystroke click playback
│   │   │   ├── useMediaQuery.js            # Breakpoint matching for the mobile layout
│   │   │   ├── useScrollToBottom.js        # Keeps the thread pinned to the newest message
│   │   │   └── useVisualViewportHeight.js  # Tracks the on-screen keyboard on mobile
│   │   ├── lib/
│   │   │   ├── axios.js                    # Chat axios instance with bearer token
│   │   │   ├── notificationSound.js        # Incoming-message chime
│   │   │   └── utils.js                    # Timestamp and grouping helpers
│   │   ├── routes/
│   │   │   ├── ChatAuthGate.jsx            # Sign-in screen for signed-out visitors
│   │   │   └── ChatPage.jsx                # Sidebar plus thread layout
│   │   ├── store/
│   │   │   ├── useAuthStore.js             # Auth check, socket connection, presence
│   │   │   └── useChatStore.js             # Conversations, messages, unread state
│   │   └── chat.css                        # Chat-scoped styles
│   ├── components/
│   │   ├── canvas/
│   │   │   ├── Ball.jsx                    # Floating tech sphere
│   │   │   ├── Earth.jsx                   # Rotatable earth in the contact section
│   │   │   ├── Particles.jsx               # Particle background
│   │   │   ├── Stars.jsx                   # Procedural starfield
│   │   │   ├── TechIconCard.jsx            # 3D model card for one technology
│   │   │   └── index.js                    # Canvas barrel export
│   │   ├── About.jsx                       # About section, content from Firestore
│   │   ├── AnimatedLetters.jsx             # Per-letter hover animation
│   │   ├── Contact.jsx                     # Contact form and social links
│   │   ├── ErrorBoundary.jsx               # Catches a failed lazy route
│   │   ├── Experience.jsx                  # Vertical timeline, content from Firestore
│   │   ├── Hero.jsx                        # Landing hero and tagline
│   │   ├── Loader.jsx                      # Canvas loading indicator
│   │   ├── Navbar.jsx                      # Portfolio navigation
│   │   ├── RotatingCube.jsx                # Six-faced tech cube, content from Firestore
│   │   ├── RotatingCube.css                # Cube face geometry and spin keyframes
│   │   ├── Tech.jsx                        # Tech stack section
│   │   ├── Works.jsx                       # Project cards, content from Firestore
│   │   └── index.js                        # Component barrel export
│   ├── constants/
│   │   ├── about.js                        # Seed and fallback copy for About
│   │   ├── brand.js                        # Wordmark paths and shared alt text
│   │   ├── hero.js                         # Seed and fallback copy for the hero
│   │   ├── index.js                        # Navigation links and timeline icons
│   │   └── tech.js                         # Seed and fallback data for the cube
│   ├── hoc/
│   │   ├── SectionWrapper.jsx              # Shared section padding and scroll anchor
│   │   └── index.js                        # HOC barrel export
│   ├── pages/
│   │   ├── Admin.jsx                       # Admin panel route root, private
│   │   ├── Blog.jsx                        # Blog route root, providers and nested routes
│   │   ├── Chat.jsx                        # Chat route root, providers and bootstrap
│   │   └── GithubFollowerTracker.jsx       # Follower comparison tool
│   ├── utils/
│   │   ├── firestoreRest.js                # Firestore REST reads for public content
│   │   ├── motion.js                       # Shared Framer Motion variants
│   │   └── richText.jsx                    # Renders stored rich text safely
│   ├── App.jsx                             # Router, lazy routes, error boundaries
│   ├── firebase.js                         # Firebase app initialization
│   ├── index.css                           # Global styles and Tailwind directives
│   ├── main.jsx                            # React entry point
│   └── styles.js                           # Shared Tailwind class groups
├── .env                                    # Environment variables
├── .env.example
├── index.html                              # SEO, Open Graph, and Twitter card tags
├── mern.png
├── package.json
├── postcss.config.cjs
├── readme.md
├── tailwind.config.cjs
├── vercel.json                             # SPA rewrite so deep links resolve
└── vite.config.js
```

## 🧭 <a name="pages-and-routes">Pages and Routes</a>

| Route         | Page                    | Bundle | Access    |
| ------------- | ----------------------- | ------ | --------- |
| `/`           | 3D portfolio            | Main   | Public    |
| `/gft`        | GitHub Follower Tracker | Lazy   | Public    |
| `/blog`       | Blog homepage           | Lazy   | Public    |
| `/blog/posts` | Full post list          | Lazy   | Public    |
| `/blog/:slug` | Single post             | Lazy   | Public    |
| `/blog/write` | Rich-text editor        | Lazy   | Owner     |
| `/chat`       | Real-time chat          | Lazy   | Signed in |

Only `/` ships in the main bundle. Every other route is code-split, so a visitor who never opens the blog or chat never downloads Clerk, Axios, Zustand, or socket.io-client.

`/blog` is publicly readable and any signed-in reader can comment, but authoring is restricted to the owner account and enforced by the API rather than by hiding the UI. `/chat` shows a sign-in screen to signed-out visitors.

## 🤸 <a name="quick-start">Quick Start</a>

Follow these steps to set up the project locally on your machine.

**Prerequisites**

Make sure you have the following installed on your machine:

- 🌳 [Git](https://git-scm.com)
- 🟢 [Node.js](https://nodejs.org)
- 📦 [npm](https://npmjs.com)

**Cloning the Repository**

```bash
git clone https://github.com/ajfm88/3dfolio.git
cd 3dfolio
```

**Installation**

Install the project dependencies using npm:

```bash
npm install
```

**Set Up Environment Variables**

Create a `.env` file in the project root (copy `.env.example`) and fill in the values:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

VITE_CLERK_PUBLISHABLE_KEY=
VITE_API_URL=

VITE_IK_URL_ENDPOINT=
VITE_IK_PUBLIC_KEY=

VITE_APP_GETFORM_DOT_IO_ENDPOINT=
```

Where each one comes from:

- **`VITE_FIREBASE_*`** — Firebase console, under **Project settings → Your apps → Web app**. Backs the admin panel and the content it serves.
- **`VITE_CLERK_PUBLISHABLE_KEY`** — Clerk dashboard, under **Developers → API keys**. Signs users in to `/blog` and `/chat`.
- **`VITE_API_URL`** — base URL of the [`server/`](server/readme.md) API including its `/api` prefix, either a locally-running instance or a deployed one.
- **`VITE_IK_*`** — ImageKit dashboard, under **Developers → API keys**, plus the URL endpoint. Lets the browser upload blog cover images directly; these are the public-safe half of the same account `server/` uses, and the ImageKit **private** key stays on the backend and is never exposed here.
- **`VITE_APP_GETFORM_DOT_IO_ENDPOINT`** — [Getform](https://getform.io) endpoint that receives the portfolio's contact form submissions.

**Running the Project**

```bash
npm run dev
```

This runs the frontend only — the 3D portfolio, `/gft` and the admin panel work standalone. `/blog` and `/chat` also need the separate [`server/`](server/readme.md) API reachable at `VITE_API_URL`: either run it locally (`cd server && npm install && npm run dev`, see its README for setup) or point at a deployed instance.

Open [http://localhost:5173](http://localhost:5173) in your browser to view the project.
