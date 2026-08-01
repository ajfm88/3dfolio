import { useState } from "react";
import { Link } from "react-router-dom";

import { navLinks } from "../constants";
import { menu, close } from "../assets";
import { LOGO_SRC, LOGO_ALT } from "../constants/brand";

const Navbar = () => {
  const [active, setActive] = useState("");
  const [toggle, setToggle] = useState(false);

  return (
    <nav className="w-full h-[65px] fixed top-0 z-50 shadow-lg shadow-[#2A0E61]/50 bg-[#03001427] backdrop-blur-md px-6 sm:px-10">
      <div className="w-full h-full flex items-center justify-between max-w-7xl mx-auto">
        {/* Logo + Name */}
        <div className="flex items-center gap-2">
          <Link
            to="https://linktr.ee/ajfm88"
            target="_blank"
            onClick={() => {
              setActive("");
              window.scrollTo(0, 0);
            }}
          >
            <img
              src={LOGO_SRC}
              alt={LOGO_ALT}
              className="w-15 h-10 object-contain transition-all duration-300 hover:[filter:brightness(0)_saturate(100%)_invert(60%)_sepia(90%)_saturate(500%)_hue-rotate(58deg)_brightness(1.1)]"
            />
          </Link>
          <a
            href="https://home.ajfm88.com"
            target="_blank"
            rel="noreferrer"
            className="text-white text-[18px] font-bold cursor-pointer flex items-center whitespace-nowrap"
          >
            &nbsp;| &nbsp;
            {/* One word, one hover — the wordmark reads as a logo beside the
                image logo rather than as six letters that each do their own
                thing. The span rather than the anchor carries the hover so the
                divider bar stays out of it. */}
            <span className="transition-colors duration-300 hover:text-[#26a7de]">
              ajfm88
            </span>
          </a>
        </div>

        {/* Desktop Nav — pill glass container.
            Spacing tightens below 1080px because the pill turns on at 810px but
            needs closer to 1000px to lay out at full size, and the shortfall used
            to be paid in wrapped labels: a two-line pill outgrows the navbar's
            fixed 65px and gets its border sliced off. Every link is nowrap so the
            failure can never take that shape again, and shrink-0 keeps the pill at
            its content width so a squeeze lands on the logo instead. */}
        <div className="hidden min-[810px]:flex shrink-0 items-center border border-[rgba(112,66,248,0.38)] bg-[rgba(3,0,20,0.37)] px-4 min-[1080px]:px-6 py-2.5 rounded-full gap-4 min-[1080px]:gap-8 text-gray-200">
          {navLinks.map((nav) => (
            <a
              key={nav.id}
              href={`#${nav.id}`}
              onClick={() => setActive(nav.title)}
              className={`${
                active === nav.title ? "text-white" : "text-gray-300"
              } hover:text-[rgb(112,66,248)] transition-colors duration-200 whitespace-nowrap text-[13px] min-[1080px]:text-[15px] font-medium cursor-pointer`}
            >
              {nav.title}
            </a>
          ))}
          <Link
            to="/blog"
            onClick={() => setActive("")}
            className="text-gray-300 hover:text-[rgb(112,66,248)] transition-colors duration-200 whitespace-nowrap text-[13px] min-[1080px]:text-[15px] font-medium cursor-pointer"
          >
            Blog
          </Link>
          <Link
            to="/chat"
            onClick={() => setActive("")}
            className="text-gray-300 hover:text-[rgb(112,66,248)] transition-colors duration-200 whitespace-nowrap text-[13px] min-[1080px]:text-[15px] font-medium cursor-pointer"
          >
            Chat
          </Link>
        </div>

        {/* Mobile hamburger */}
        <div className="min-[810px]:hidden flex items-center">
          <img
            src={toggle ? close : menu}
            alt="menu"
            className="w-[28px] h-[28px] object-contain cursor-pointer"
            onClick={() => setToggle(!toggle)}
          />

          {toggle && (
            <div className="absolute top-[65px] right-0 w-full bg-[#030014] border-t border-[rgba(112,66,248,0.38)] p-6 flex flex-col items-center gap-5">
              {navLinks.map((nav) => (
                <a
                  key={nav.id}
                  href={`#${nav.id}`}
                  onClick={() => {
                    setToggle(false);
                    setActive(nav.title);
                  }}
                  className={`${
                    active === nav.title ? "text-white" : "text-gray-300"
                  } hover:text-[rgb(112,66,248)] transition-colors duration-200 text-[16px] font-medium cursor-pointer`}
                >
                  {nav.title}
                </a>
              ))}
              <Link
                to="/blog"
                onClick={() => {
                  setToggle(false);
                  setActive("");
                }}
                className="text-gray-300 hover:text-[rgb(112,66,248)] transition-colors duration-200 text-[16px] font-medium cursor-pointer"
              >
                Blog
              </Link>
              <Link
                to="/chat"
                onClick={() => {
                  setToggle(false);
                  setActive("");
                }}
                className="text-gray-300 hover:text-[rgb(112,66,248)] transition-colors duration-200 text-[16px] font-medium cursor-pointer"
              >
                Chat
              </Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
