import { useState } from "react";
import { Link } from "react-router-dom";

import "./GithubFollowerTracker.css";

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

function EntryList({ items, className }) {
  return items.map((item) => (
    <li key={item.id}>
      <a href={item.html_url} target="_blank" rel="noreferrer">
        <div className={`entry${className ? ` ${className}` : ""}`}>
          <img src={item.avatar_url} alt={item.login} style={{ height: 40, width: 40 }} />
          <p className="name">{item.login}</p>
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

  return (
    <div className="gft-page">
      <Link to="/" className="gft-back">
        ← ajfm88.com
      </Link>
      <main>
        <h1>GitHub username:</h1>
        <form id="inputs" onSubmit={runSearch}>
          <input
            type="text"
            value={usernameInput}
            onChange={(e) => setUsernameInput(e.target.value)}
          />
          <input type="submit" id="searchbtn" value={loading ? "Searching..." : "Search"} disabled={loading} />
        </form>
        <div id="fold">
          <input
            type="button"
            className="gft-btn"
            value="All"
            disabled={!hasData}
            onClick={() => setView("all")}
          />
          <input
            type="button"
            className="gft-btn"
            value="Changes"
            disabled={!hasData || !changes}
            onClick={() => setView("changes")}
          />
          <input
            type="button"
            className="gft-btn"
            value="Save"
            disabled={!hasData}
            onClick={handleSave}
          />
        </div>
        <div id="msg">{message}</div>
        <section id="grid">
          <div id="followers" className="box">
            <ul>
              <li>
                <h2>Followers: {hasData ? followersCount : ""}</h2>
              </li>
              {hasData && view === "all" && <EntryList items={followersList} />}
              {hasData && view === "changes" && changes && (
                <>
                  <EntryList items={changes.deletedFollowers} className="deleted" />
                  <EntryList items={changes.addedFollowers} className="added" />
                </>
              )}
            </ul>
          </div>
          <div id="following" className="box">
            <ul>
              <li>
                <h2>Following: {hasData ? followingCount : ""}</h2>
              </li>
              {hasData && view === "all" && <EntryList items={followingList} />}
              {hasData && view === "changes" && changes && (
                <>
                  <EntryList items={changes.deletedFollowing} className="deleted" />
                  <EntryList items={changes.addedFollowing} className="added" />
                </>
              )}
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
};

export default GithubFollowerTracker;
