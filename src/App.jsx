import { BrowserRouter } from "react-router-dom";

import { About, Contact, Experience, Hero, Navbar, Tech, Works, StarsCanvas } from "./components";

const App = () => {
  return (
    <BrowserRouter>
      <div className='relative z-0 bg-primary'>
        <StarsCanvas />
        <div className="fixed inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(88, 28, 135, 0.15) 0%, transparent 70%)', zIndex: 0 }} />
        <div className='bg-hero-pattern bg-cover bg-no-repeat bg-center'>
          <Navbar />
          <Hero />
        </div>
        <About />
        <Experience />
        <Tech />
        <Works />
        <div className='relative z-0'>
          <Contact />
        </div>
      </div>
    </BrowserRouter>
  );
};

export default App;