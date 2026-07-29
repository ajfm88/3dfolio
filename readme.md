<div align="center">
  <br />
    <a href="https://3dfolio-ajfm88.vercel.app">
      <img src="https://github-production-user-asset-6210df.s3.amazonaws.com/151519281/292722498-4722160a-8e61-403f-a905-728feae1f7e6.png" alt="Project Banner">
    </a>
  <br />

  <div>
    <a href="https://react.dev">
      <img src="https://img.shields.io/badge/-React_JS-black?style=for-the-badge&logoColor=white&logo=react&color=61DAFB" alt="react.js" />
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
    <a href="https://expressjs.com">
      <img src="https://img.shields.io/badge/-Express-black?style=for-the-badge&logoColor=white&logo=express&color=000000" alt="express" />
    </a>
    <a href="https://framer.com/motion">
      <img src="https://img.shields.io/badge/-Framer_Motion-black?style=for-the-badge&logoColor=white&logo=framer&color=0055FF" alt="framer motion" />
    </a>
    <a href="https://socket.io">
      <img src="https://img.shields.io/badge/-Socket.io-black?style=for-the-badge&logoColor=white&logo=socketdotio&color=010101" alt="socket.io" />
    </a>
    <a href="https://firebase.google.com">
      <img src="https://img.shields.io/badge/-Firebase-black?style=for-the-badge&logoColor=white&logo=firebase&color=DD2C00" alt="firebase" />
    </a>
    <a href="https://clerk.com">
      <img src="https://img.shields.io/badge/-Clerk-black?style=for-the-badge&logoColor=white&logo=clerk&color=6C47FF" alt="clerk" />
    </a>
    <a href="https://www.mongodb.com">
      <img src="https://img.shields.io/badge/-MongoDB-black?style=for-the-badge&logoColor=white&logo=mongodb&color=47A248" alt="mongodb" />
    </a>
    <a href="https://imagekit.io">
      <img src="https://img.shields.io/badge/-ImageKit-black?style=for-the-badge&logoColor=white&logo=imagekit&color=1E7CF5" alt="imagekit" />
    </a>
  </div>

  <h3 align="center">3D Personal Portfolio Website</h3>
</div>

## 📋 <a name="table">Table of Contents</a>

1.  🤖 [Introduction](#introduction)
2.  🏗️ [Architecture](#architecture)
3.  ⚙️ [Tech Stack](#tech-stack)
4.  🔋 [Features](#features)
5.  🤸 [Quick Start](#quick-start)

## 🤖 <a name="introduction">Introduction</a>

Personal website of Alejandro J. Foucault (ajfm88) — a 3D React portfolio front end, alongside three extra tools that share the same domain: a **GitHub Follower Tracker** (`/gft`), a **blog** (`/blog`), and a **real-time chat** (`/chat`). To see a live demo of this project, please [click here](https://3dfolio-ajfm88.vercel.app) or on the banner above.

## 🏗️ <a name="architecture">Architecture</a>

This repo runs **two backends on purpose, not by accident:**

- **This root project** — the static Vite/React SPA documented here. The 3D portfolio, `/gft`, and a private admin panel run on **Firebase** (Firestore, Storage, Auth): simple, single-author content read over plain REST calls, with no server to run or keep alive.
- **[`server/`](server/README.md)** — a separate, committed Express + MongoDB + Clerk + Socket.io + ImageKit API, deployed on its own (Render), that powers `/blog` and `/chat`. Those two need relational data (users ↔ posts ↔ comments ↔ messages) and a real WebSocket server for presence and delivery — a job Firestore's document model doesn't fit as naturally. Rather than force everything onto one platform, that part of the app gets the tool that actually fits.

Every feature route is lazy-loaded, so Clerk, Axios, Zustand and socket.io-client never touch the main portfolio bundle. See **[`server/README.md`](server/README.md)** for the full write-up of the split, and of how blog and chat share one auth system, one database and one deployment instead of standing up two.

## ⚙️ <a name="tech-stack">Tech Stack</a>

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
- 🕒 [timeago.js](https://timeago.org)

**Backend ([`server/`](server/README.md), deployed separately on Render):**

- 🚂 [Express](https://expressjs.com)
- 🍃 [MongoDB Atlas](https://www.mongodb.com/atlas)
- 🧬 [Mongoose](https://mongoosejs.com)
- 🔐 [Clerk](https://clerk.com)
- 🔌 [Socket.io](https://socket.io)
- 🖼️ [ImageKit](https://imagekit.io)
- 📤 [Multer](https://github.com/expressjs/multer)

Full architecture, API surface and design rationale live in **[`server/README.md`](server/README.md)**.

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
- **`VITE_API_URL`** — base URL of the [`server/`](server/README.md) API including its `/api` prefix, either a locally-running instance or a deployed one.
- **`VITE_IK_*`** — ImageKit dashboard, under **Developers → API keys**, plus the URL endpoint. Lets the browser upload blog cover images directly; these are the public-safe half of the same account `server/` uses, and the ImageKit **private** key stays on the backend and is never exposed here.
- **`VITE_APP_GETFORM_DOT_IO_ENDPOINT`** — [Getform](https://getform.io) endpoint that receives the portfolio's contact form submissions.

**Running the Project**

```bash
npm run dev
```

This runs the frontend only — the 3D portfolio, `/gft` and the admin panel work standalone. `/blog` and `/chat` also need the separate [`server/`](server/README.md) API reachable at `VITE_API_URL`: either run it locally (`cd server && npm install && npm run dev`, see its README for setup) or point at a deployed instance.

Open [http://localhost:5173](http://localhost:5173) in your browser to view the project.
