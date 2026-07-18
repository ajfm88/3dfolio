import { useState } from "react";
import { Link } from "react-router-dom";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react";
import { alejandroBlog } from "../../assets";
import { useIsAdmin } from "../lib/useIsAdmin";

const BlogNavbar = () => {
  const [open, setOpen] = useState(false);
  const isAdmin = useIsAdmin();

  return (
    <div className="w-full h-16 md:h-20 flex items-center justify-between">
      {/* LOGO */}
      <Link to="/blog" className="flex items-center">
        <img src={alejandroBlog} alt="Alejandro" className="h-10 md:h-14 w-auto object-contain invert" />
      </Link>

      {/* MOBILE MENU */}
      <div className="md:hidden">
        <div className="cursor-pointer text-4xl" onClick={() => setOpen((prev) => !prev)}>
          <div className="flex flex-col gap-[5.4px]">
            <div className={`h-[3px] rounded-md w-6 bg-black origin-left transition-all ease-in-out ${open ? "rotate-45" : ""}`} />
            <div className={`h-[3px] rounded-md w-6 bg-black transition-all ease-in-out ${open ? "opacity-0" : ""}`} />
            <div className={`h-[3px] rounded-md w-6 bg-black origin-left transition-all ease-in-out ${open ? "-rotate-45" : ""}`} />
          </div>
        </div>
        <div
          className={`w-full h-screen bg-[#e6e6ff] flex flex-col items-center justify-center gap-8 font-medium text-lg absolute top-16 transition-all ease-in-out ${
            open ? "-right-0" : "-right-[100%]"
          }`}
        >
          <Link to="/blog" onClick={() => setOpen(false)}>Home</Link>
          <Link to="/blog/posts?sort=trending" onClick={() => setOpen(false)}>Trending</Link>
          <Link to="/blog/posts?sort=popular" onClick={() => setOpen(false)}>Most Popular</Link>
          {isAdmin && (
            <Link to="/blog/write" onClick={() => setOpen(false)}>Write</Link>
          )}
          <SignedOut>
            <SignInButton mode="modal" />
          </SignedOut>
          <SignedIn>
            <UserButton />
          </SignedIn>
        </div>
      </div>

      {/* DESKTOP MENU */}
      <div className="hidden md:flex items-center gap-8 xl:gap-12 font-medium">
        <Link to="/blog">Home</Link>
        <Link to="/blog/posts?sort=trending">Trending</Link>
        <Link to="/blog/posts?sort=popular">Most Popular</Link>
        {isAdmin && <Link to="/blog/write">Write</Link>}
        <SignedOut>
          <SignInButton mode="modal" />
        </SignedOut>
        <SignedIn>
          <UserButton />
        </SignedIn>
      </div>
    </div>
  );
};

export default BlogNavbar;
