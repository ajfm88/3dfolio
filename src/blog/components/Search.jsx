import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

// Search box used by MainCategories (and later the post-list SideMenu). Pressing
// Enter routes to /blog/posts?search=…: if already on the list page it merges the
// query into the existing params, otherwise it navigates there. Paths are
// /blog-prefixed to match this app's nested route mount.
const Search = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const handleKeyPress = (e) => {
    if (e.key !== "Enter") return;

    const query = e.target.value.trim();
    const params = { ...Object.fromEntries(searchParams) };

    // An emptied box clears the filter instead of searching for "".
    if (query) {
      params.search = query;
    } else {
      delete params.search;
    }

    if (location.pathname === "/blog/posts") {
      setSearchParams(params);
    } else {
      // Built through URLSearchParams so a query containing &, +, # or a space
      // survives the trip instead of being read as more parameters.
      const qs = new URLSearchParams(params).toString();
      navigate(qs ? `/blog/posts?${qs}` : "/blog/posts");
    }
  };

  return (
    <div className="bg-gray-100 p-2 rounded-full flex items-center gap-2">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="gray"
      >
        <circle cx="10.5" cy="10.5" r="7.5" />
        <line x1="16.5" y1="16.5" x2="22" y2="22" />
      </svg>
      <input
        type="text"
        placeholder="search a post..."
        className="bg-transparent"
        onKeyDown={handleKeyPress}
      />
    </div>
  );
};

export default Search;
