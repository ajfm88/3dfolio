import { useSearchParams } from "react-router-dom";
import Search from "./Search";

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "popular", label: "Most Popular" },
  { value: "trending", label: "Trending" },
  { value: "oldest", label: "Oldest" },
];

const CATEGORIES = [
  { value: "", label: "All" },
  { value: "web-design", label: "Web Design" },
  { value: "development", label: "Development" },
  { value: "databases", label: "Databases" },
  { value: "seo", label: "Search Engines" },
  { value: "marketing", label: "Marketing" },
];

// The /blog/posts sidebar: a search box, sort radios, and category filters.
// Selections are written into the URL search params, which PostList reads to
// refetch — so the list, the shareable URL, and these controls all stay in sync.
//
// That sync runs both ways: the controls render *from* the params rather than
// from local state, so arriving at /blog/posts?sort=popular — which is exactly
// what the navbar's Trending and Most Popular links do — shows the matching
// radio already selected instead of an untouched form. Sort falls back to
// newest, the same default the API applies when no sort is given.
//
// "All" clears the category filter rather than selecting a real category; the
// rest map to the same slugs the Write form and MainCategories use.
const SideMenu = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const activeSort = searchParams.get("sort") || "newest";
  const activeCategory = searchParams.get("cat") || "";

  const handleFilterChange = (e) => {
    if (searchParams.get("sort") !== e.target.value) {
      setSearchParams({
        ...Object.fromEntries(searchParams.entries()),
        sort: e.target.value,
      });
    }
  };

  const handleCategoryChange = (category) => {
    const params = Object.fromEntries(searchParams.entries());
    if (category) {
      params.cat = category;
    } else {
      // "All" — drop the filter instead of selecting the real `general` category.
      delete params.cat;
    }
    setSearchParams(params);
  };

  return (
    <div className="px-4 h-max sticky top-8">
      <h1 className="mb-4 text-sm font-medium">Search</h1>
      <Search />
      <h1 className="mt-8 mb-4 text-sm font-medium">Filter</h1>
      <div className="flex flex-col gap-2 text-sm">
        {SORT_OPTIONS.map((option) => (
          <label
            key={option.value}
            className="flex items-center gap-2 cursor-pointer"
          >
            <input
              type="radio"
              name="sort"
              value={option.value}
              checked={activeSort === option.value}
              onChange={handleFilterChange}
              className="appearance-none w-4 h-4 border-[1.5px] border-blue-800 cursor-pointer rounded-sm bg-white checked:bg-blue-800"
            />
            {option.label}
          </label>
        ))}
      </div>
      <h1 className="mt-8 mb-4 text-sm font-medium">Categories</h1>
      <div className="flex flex-col gap-2 text-sm">
        {CATEGORIES.map((category) => (
          <span
            key={category.value || "all"}
            className={`underline cursor-pointer ${
              activeCategory === category.value ? "font-medium text-blue-800" : ""
            }`}
            onClick={() => handleCategoryChange(category.value)}
          >
            {category.label}
          </span>
        ))}
      </div>
    </div>
  );
};

export default SideMenu;
