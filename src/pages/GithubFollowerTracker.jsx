import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Search,
  Loader2,
  Users,
  GitCompare,
  Save,
  UserPlus,
  UserMinus,
} from "lucide-react";

// lucide dropped brand marks, so the GitHub logo is an inline SVG (octicon path).
const GithubMark = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 012-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

const STORAGE_PREFIX = "gft:";
const RESOLVED_PREFIX = "gft:resolved:";

async function fetchGitPage(url, page) {
  const response = await fetch(`${url}${page}`);
  if (response.status === 404) {
    throw new Error("This username doesn't exist.");
  }
  if (response.status === 403) {
    throw new Error("You have exceeded the available number of requests for now.");
  }
  return response.json();
}

async function fetchAllPages(url) {
  let page = 0;
  let result = [];
  let morePages = false;
  do {
    page++;
    const pageData = await fetchGitPage(url, page);
    result = result.concat(pageData);
    morePages = pageData.length === 100;
  } while (morePages);
  return result;
}

function loadPreviousData(username) {
  const raw = localStorage.getItem(`${STORAGE_PREFIX}${username}`);
  return raw ? JSON.parse(raw) : null;
}

function savePreviousData(username, followersList, followingList) {
  const obj = {
    followersList,
    followingList,
    date: new Date().toLocaleString(),
  };
  localStorage.setItem(`${STORAGE_PREFIX}${username}`, JSON.stringify(obj));
}

function diffLists(previous, current) {
  const deleted = previous.filter((p) => !current.some((c) => c.id === p.id));
  const added = current.filter((c) => !previous.some((p) => p.id === c.id));
  return { deleted, added };
}

function loadResolvedIdentity(id) {
  const raw = localStorage.getItem(`${RESOLVED_PREFIX}${id}`);
  return raw ? JSON.parse(raw) : null;
}

function saveResolvedIdentity(id, data) {
  localStorage.setItem(`${RESOLVED_PREFIX}${id}`, JSON.stringify(data));
}

// GitHub user ids are permanent even across username changes, so re-resolving
// by id fixes stale/renamed profiles whose cached login/html_url would 404.
// Once resolved, the result is cached in localStorage so the same id never
// needs to hit the GitHub API again on a later search.
async function resolveCurrentIdentity(entry) {
  const cached = loadResolvedIdentity(entry.id);
  if (cached) return { ...entry, ...cached };

  try {
    const response = await fetch(`https://api.github.com/user/${entry.id}`);
    if (!response.ok) return entry;
    const data = await response.json();
    const resolved = {
      login: data.login,
      avatar_url: data.avatar_url,
      html_url: data.html_url,
    };
    saveResolvedIdentity(entry.id, resolved);
    return { ...entry, ...resolved };
  } catch {
    return entry;
  }
}

function resolveCurrentIdentities(entries) {
  return Promise.all(entries.map(resolveCurrentIdentity));
}

function EntryList({ items, variant }) {
  const tint =
    variant === "added"
      ? "text-green-300"
      : variant === "deleted"
        ? "text-red-300"
        : "text-gray-200";

  return items.map((item) => (
    <li key={item.id}>
      <a href={item.html_url} target="_blank" rel="noreferrer">
        <div className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-gray-700/50 transition-colors min-w-0">
          <img
            src={item.avatar_url}
            alt={item.login}
            className="w-10 h-10 rounded-full flex-shrink-0"
          />
          <span className={`text-sm truncate ${tint}`}>{item.login}</span>
          {variant === "added" && (
            <UserPlus size={16} className="text-green-400 ml-auto flex-shrink-0" />
          )}
          {variant === "deleted" && (
            <UserMinus size={16} className="text-red-400 ml-auto flex-shrink-0" />
          )}
        </div>
      </a>
    </li>
  ));
}

const GithubFollowerTracker = () => {
  const [usernameInput, setUsernameInput] = useState("");
  const [username, setUsername] = useState(null);
  const [followersList, setFollowersList] = useState([]);
  const [followingList, setFollowingList] = useState([]);
  const [changes, setChanges] = useState(null);
  const [view, setView] = useState("all");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasData, setHasData] = useState(false);

  const runSearch = async (e) => {
    e.preventDefault();
    const cleanUsername = usernameInput.trim().toLowerCase();
    if (!cleanUsername) return;

    setLoading(true);
    setHasData(false);
    setMessage("");

    try {
      const followersUrl = `https://api.github.com/users/${cleanUsername}/followers?per_page=100&page=`;
      const followingUrl = `https://api.github.com/users/${cleanUsername}/following?per_page=100&page=`;
      const [newFollowers, newFollowing] = await Promise.all([
        fetchAllPages(followersUrl),
        fetchAllPages(followingUrl),
      ]);

      const previous = loadPreviousData(cleanUsername);
      setUsername(cleanUsername);
      setFollowersList(newFollowers);
      setFollowingList(newFollowing);

      if (previous) {
        const followersDiff = diffLists(previous.followersList, newFollowers);
        const followingDiff = diffLists(previous.followingList, newFollowing);
        const [resolvedDeletedFollowers, resolvedDeletedFollowing] = await Promise.all([
          resolveCurrentIdentities(followersDiff.deleted),
          resolveCurrentIdentities(followingDiff.deleted),
        ]);
        setChanges({
          deletedFollowers: resolvedDeletedFollowers,
          addedFollowers: followersDiff.added,
          deletedFollowing: resolvedDeletedFollowing,
          addedFollowing: followingDiff.added,
        });
        setMessage(`Last entry for this user was on ${previous.date}.`);
        setView("changes");
      } else {
        savePreviousData(cleanUsername, newFollowers, newFollowing);
        setChanges(null);
        setMessage(`The user ${cleanUsername} has been added to your tracker.`);
        setView("all");
      }
      setHasData(true);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    savePreviousData(username, followersList, followingList);
    setMessage("Saved!");
  };

  const followersCount =
    view === "changes" && changes
      ? changes.deletedFollowers.length + changes.addedFollowers.length
      : followersList.length;
  const followingCount =
    view === "changes" && changes
      ? changes.deletedFollowing.length + changes.addedFollowing.length
      : followingList.length;

  const foldBtn = (isActive) =>
    `inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
      isActive ? "bg-indigo-600" : "bg-gray-700 hover:bg-gray-600"
    }`;

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-gray-900 text-gray-100 py-10 px-4">
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 opacity-80" />
        <div className="absolute inset-0 backdrop-blur-sm" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={16} /> ajfm88.com
        </Link>

        <header className="text-center mt-6 mb-8">
          <h1 className="inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xl xs:text-2xl sm:text-3xl font-bold">
            <GithubMark size={28} /> GitHub Follower Tracker
          </h1>
        </header>

        <form onSubmit={runSearch} className="flex flex-col xs:flex-row justify-center gap-2 max-w-md mx-auto">
          <input
            type="text"
            value={usernameInput}
            onChange={(e) => setUsernameInput(e.target.value)}
            placeholder="GitHub username"
            className="flex-1 bg-gray-700 text-white placeholder-gray-400 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 transition-colors px-4 py-2 font-medium"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
            {loading ? "Searching…" : "Search"}
          </button>
        </form>

        <div className="flex justify-center flex-wrap gap-2 mt-6">
          <button
            type="button"
            className={foldBtn(hasData && view === "all")}
            disabled={!hasData}
            onClick={() => setView("all")}
          >
            <Users size={16} /> All
          </button>
          <button
            type="button"
            className={foldBtn(hasData && view === "changes")}
            disabled={!hasData || !changes}
            onClick={() => setView("changes")}
          >
            <GitCompare size={16} /> Changes
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-gray-700 hover:bg-gray-600 px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={!hasData}
            onClick={handleSave}
          >
            <Save size={16} /> Save
          </button>
        </div>

        {message && <p className="text-center text-gray-400 mt-4">{message}</p>}

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-8">
          <div className="bg-gray-800/50 backdrop-blur-md border border-gray-700 rounded-xl p-4 sm:p-6">
            <h2 className="text-xl font-semibold text-gray-100 mb-4">
              Followers{hasData ? `: ${followersCount}` : ""}
            </h2>
            <ul className="space-y-1">
              {hasData && view === "all" && <EntryList items={followersList} />}
              {hasData && view === "changes" && changes && (
                <>
                  <EntryList items={changes.deletedFollowers} variant="deleted" />
                  <EntryList items={changes.addedFollowers} variant="added" />
                </>
              )}
            </ul>
          </div>
          <div className="bg-gray-800/50 backdrop-blur-md border border-gray-700 rounded-xl p-4 sm:p-6">
            <h2 className="text-xl font-semibold text-gray-100 mb-4">
              Following{hasData ? `: ${followingCount}` : ""}
            </h2>
            <ul className="space-y-1">
              {hasData && view === "all" && <EntryList items={followingList} />}
              {hasData && view === "changes" && changes && (
                <>
                  <EntryList items={changes.deletedFollowing} variant="deleted" />
                  <EntryList items={changes.addedFollowing} variant="added" />
                </>
              )}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
};

export default GithubFollowerTracker;
