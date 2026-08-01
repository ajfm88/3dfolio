import { Link } from "react-router-dom";
import MainCategories from "../components/MainCategories";
import FeaturedPosts from "../components/FeaturedPosts";
import PostList from "../components/PostList";

// The blog landing page: hero + "write" call-to-action, the category bar, the
// featured section, and the recent-posts list. Links are /blog-prefixed (nested
// route mount); the breadcrumb "Home" points at the portfolio root (/), which is
// the real home in this app.
const Homepage = () => {
  return (
    <div className="mt-4 flex flex-col gap-4">
      {/* BREADCRUMB */}
      <div className="flex gap-4">
        <Link to="/">Home</Link>
        <span>•</span>
        <span className="text-blue-800">Blogs and Articles</span>
      </div>
      {/* INTRODUCTION */}
      <div className="flex items-center justify-between">
        {/* titles */}
        <div className="">
          <h1 className="text-gray-800 text-2xl md:text-5xl lg:text-6xl font-bold">
            Notes on code, design, and building for the web.
          </h1>
          <p className="mt-8 text-md md:text-xl">
            Longer-form writing from the same desk as the portfolio — project
            deep dives, experiments, and things worth writing down.
          </p>
        </div>
        {/* animated button */}
        <Link to="/blog/write" className="write-cta hidden md:block relative">
          <svg
            viewBox="0 0 200 200"
            width="200"
            height="200"
            className="write-cta-ring text-lg tracking-widest"
          >
            <path
              id="circlePath"
              fill="none"
              d="M 100, 100 m -75, 0 a 75,75 0 1,1 150,0 a 75,75 0 1,1 -150,0"
            />
            {/* Phrase, bullet, phrase, bullet, each centred on its own offset
                via text-anchor. The bullets are separate textPaths rather than
                characters trailing a phrase, which is what let one hug the
                phrase it belonged to and sit a half-circle from the other.

                The phrases are a half-turn apart, but the bullets are not on
                the quarter-turns between them: the two phrases do not render to
                the same width, so quarter-turns leave each bullet nearer the
                wider one. 44.4% and 95.6% are the midpoints of the gaps as they
                actually render, which puts 26px of arc on all four sides.
                Re-measure if the copy or the type scale changes. Offsets start
                at 20% rather than 0% to keep the first phrase across the top of
                the ring, where it has always sat. */}
            <text textAnchor="middle">
              <textPath href="#circlePath" startOffset="20%">
                Write your story
              </textPath>
              <textPath href="#circlePath" startOffset="44.4%">
                ●
              </textPath>
              <textPath href="#circlePath" startOffset="70%">
                Share your ideas
              </textPath>
              <textPath href="#circlePath" startOffset="95.6%">
                ●
              </textPath>
            </text>
          </svg>
          <button className="write-cta-arrow absolute top-0 left-0 right-0 bottom-0 m-auto w-20 h-20 bg-blue-800 rounded-full flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width="50"
              height="50"
              fill="none"
              stroke="white"
              strokeWidth="2"
            >
              <line x1="6" y1="18" x2="18" y2="6" />
              <polyline points="9 6 18 6 18 15" />
            </svg>
          </button>
        </Link>
      </div>
      {/* CATEGORIES */}
      <MainCategories />
      {/* FEATURED POSTS */}
      <FeaturedPosts />
      {/* POST LIST */}
      <div className="">
        <h1 className="my-8 text-2xl text-gray-600">Recent Posts</h1>
        <PostList />
      </div>
    </div>
  );
};

export default Homepage;
