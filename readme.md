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
    <a href="https://framer.com/motion">
      <img src="https://img.shields.io/badge/-Framer_Motion-black?style=for-the-badge&logoColor=white&logo=framer&color=0055FF" alt="framer motion" />
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
    <a href="https://vitejs.dev">
      <img src="https://img.shields.io/badge/-Vite-black?style=for-the-badge&logoColor=white&logo=vite&color=646CFF" alt="vite" />
    </a>
    <a href="https://tailwindcss.com">
      <img src="https://img.shields.io/badge/-Tailwind_CSS-black?style=for-the-badge&logoColor=white&logo=tailwindcss&color=06B6D4" alt="tailwindcss" />
    </a>
    <a href="https://firebase.google.com">
      <img src="https://img.shields.io/badge/-Firebase-black?style=for-the-badge&logoColor=white&logo=firebase&color=DD2C00" alt="firebase" />
    </a>
    <a href="https://clerk.com">
      <img src="https://img.shields.io/badge/-Clerk-black?style=for-the-badge&logoColor=white&logo=clerk&color=6C47FF" alt="clerk" />
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

Personal website of Alejandro J. Foucault (ajfm88) — a 3D React portfolio front end, alongside two extra tools that share the same domain: a **GitHub Follower Tracker** (`/gft`) and an **in-development blog** (`/blog`). To see a live demo of this project, please [click here](https://3dfolio-ajfm88.vercel.app) or on the banner above.

## 🏗️ <a name="architecture">Architecture</a>

This repo is intentionally **two backends, on purpose, not by accident:**

- **This root project** — the static Vite/React SPA (this README). The 3D portfolio, `/gft`, and a private admin panel all run on **Firebase** (Firestore, Storage, Auth) for simple, single-author content and client/REST calls — no server to run or keep alive.
- **[`server/`](server/README.md)** — a separate, committed Express + MongoDB + Clerk + Socket.io + ImageKit API, deployed on its own (Render), that powers `/blog` (and an upcoming `/chat`). Those two features need relational data (users ↔ posts ↔ comments ↔ messages) and a real WebSocket server for chat presence — a job Firestore's document model doesn't fit as naturally, so rather than force everything onto one platform, that slice of the app gets the tool that actually fits. See **[`server/README.md`](server/README.md)** for the full write-up of why, and how the two features share one auth system, one database, and one deployment instead of standing up two.

Both frontends (`/blog`, and `/chat` when it lands) are lazy-loaded routes, so Clerk/axios/socket.io-client never touch the main portfolio bundle.

## ⚙️ <a name="tech-stack">Tech Stack</a>

**Frontend (this repo, `src/`):**

- ⚛️ [React.js](https://react.dev)
- 🔺 [Three.js](https://threejs.org)
- 🎞️ [Framer Motion](https://framer.com/motion)
- 🧵 [React Three Fiber](https://r3f.docs.pmnd.rs)
- 🧭 [React Router](https://reactrouter.com)
- 🔧 [React Three Drei](https://drei.pmnd.rs)
- ⚡ [Vite](https://vitejs.dev)
- 🌬️ [Tailwind CSS](https://tailwindcss.com)
- 🔥 [Firebase](https://firebase.google.com) — admin panel content
- 🔐 [Clerk](https://clerk.com) — auth for `/blog` (`@clerk/clerk-react`)
- 🔄 [TanStack Query](https://tanstack.com/query) + [Axios](https://axios-http.com) — data fetching for `/blog` against the Express API
- ✍️ [React Quill](https://github.com/mercycorps/react-quill-new) + [react-toastify](https://fkhadra.github.io/react-toastify) — blog post authoring UI (upcoming)

**Backend (`server/`, separately deployed):** Express 5, MongoDB Atlas + Mongoose, Clerk (`@clerk/express`), Socket.io, ImageKit. Full architecture, API surface, and design rationale in **[`server/README.md`](server/README.md)**.

## 🔋 <a name="features">Features</a>

🎨 **Interactive Experience and Work Sections:** Utilizes animations powered by framer motion for engaging user experience.

💡 **3D Skills Section:** Showcases skills using 3D geometries through Three.js and React Three fiber.

🎬 **Animated Projects:** Features animated sections using framer motion for projects.

🌍 **Contact Section with 3D Earth Model:** Integrates a rotable 3D earth model with email functionality.

✨ **3D Stars:** Generate stars progressively at random positions using Three.js for background display.

🎞️ **Consistent Animations:** Implements cohesive animations throughout the website using Framer Motion.

📱 **Responsive Design:** Ensures optimal display and functionality across all devices.

🖌️ **Tailwind CSS Styling:** Styled with Tailwind CSS for a modern and responsive design.

🔥 **Firebase-Powered Admin Panel:** A secure, Google-authenticated dashboard for editing site content, backed by Cloud Firestore and Firebase Storage.

🔎 **GitHub Follower Tracker (`/gft`):** Look up any GitHub account and compare snapshots of its followers/following over time — who's new, who unfollowed — entirely client-side against the public GitHub REST API, with snapshots persisted in `localStorage`. No backend involved.

📝 **Blog (`/blog`, in active development):** A Clerk-authenticated blog — posts, comments, admin-only authoring, ImageKit-hosted cover images — backed by the dedicated Express/MongoDB API in [`server/`](server/README.md), deployed separately on Render. The data/auth layer and page shell are live; full post authoring/browsing lands over the next several iterations.

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

Create a `.env` file in the project root (copy `.env.example`) and add your Firebase web app config (admin panel + database-driven content) plus the Clerk/API config for `/blog`:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

VITE_CLERK_PUBLISHABLE_KEY=
VITE_API_URL=
```

Grab the Firebase values from your Firebase project settings (**Project settings → Your apps → Web app**). `VITE_CLERK_PUBLISHABLE_KEY` comes from your Clerk dashboard (**Developers → API keys**); `VITE_API_URL` is the base URL of the `server/` API (including its `/api` prefix) — either a locally-running instance or a deployed one.

**Running the Project**

```bash
npm run dev
```

This runs the frontend only (the 3D portfolio, `/gft`, the admin panel, and `/blog`'s UI shell all work). `/blog` also needs the separate [`server/`](server/README.md) API reachable at `VITE_API_URL` above — either run it locally (`cd server && npm install && npm run dev`, see its README for setup) or point at a deployed instance.

Open [http://localhost:5173](http://localhost:5173) in your browser to view the project.
