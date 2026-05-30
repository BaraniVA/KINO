import { useEffect, useMemo, useState } from "react";
import { fetchMovieDetails, fetchRecommendations } from "./api";

const quickMoods = [
  "dreamy",
  "nostalgic",
  "romantic",
  "melancholic",
  "hopeful",
  "calm"
];

const NAV_ITEMS = ["Discover", "Watchlist", "Watched"];

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadJson(key) {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function loadTheme() {
  const storedTheme = localStorage.getItem("kino_theme");

  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }

  return "light";
}

function createFallbackPoster(title, year) {
  const safeTitle = String(title || "KINO").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeYear = String(year || "");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" width="800" height="1000">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#eff9ff" />
          <stop offset="52%" stop-color="#c6e7ff" />
          <stop offset="100%" stop-color="#8cc8ff" />
        </linearGradient>
        <radialGradient id="glow" cx="50%" cy="32%" r="60%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95" />
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
        </radialGradient>
      </defs>
      <rect width="800" height="1000" rx="48" fill="url(#bg)" />
      <circle cx="400" cy="240" r="230" fill="url(#glow)" />
      <rect x="56" y="68" width="688" height="864" rx="40" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="6" />
      <text x="400" y="470" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="72" font-weight="700" letter-spacing="4">${safeTitle}</text>
      <text x="400" y="550" text-anchor="middle" fill="#f4fbff" font-family="Arial, sans-serif" font-size="30" letter-spacing="8">${safeYear}</text>
      <text x="400" y="720" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="28" opacity="0.92">KINO SKY POSTER</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function PosterArt({ title, year, poster, className = "" }) {
  const [src, setSrc] = useState(() => poster || createFallbackPoster(title, year));

  useEffect(() => {
    setSrc(poster || createFallbackPoster(title, year));
  }, [poster, title, year]);

  return (
    <img
      className={className}
      src={src}
      alt={title}
      onError={() => setSrc(createFallbackPoster(title, year))}
    />
  );
}

function MovieCard({ movie, onOpen, onAddWatchlist, onAddWatched, watchlist, watched }) {
  const inWatchlist = watchlist.some((m) => m.imdbID === movie.imdbID);
  const isWatched = watched.some((m) => m.imdbID === movie.imdbID);

  return (
    <article className="movie-card">
      <button className="poster-wrap" onClick={() => onOpen(movie.imdbID)}>
        <PosterArt title={movie.title} year={movie.year} poster={movie.poster} className="poster-image" />
      </button>
      <div className="card-body">
        <h3>{movie.title}</h3>
        <p className="meta">{movie.year} · {movie.runtime || "Runtime N/A"} · ★ {movie.imdbRating || "-"}</p>
        {movie.vibeReason ? <p className="reason">MOOD MATCH: {movie.vibeReason}</p> : null}
        <div className="actions">
          <button onClick={() => onAddWatchlist(movie)} disabled={inWatchlist}>{inWatchlist ? "IN WATCHLIST" : "+ WATCHLIST"}</button>
          <button onClick={() => onAddWatched(movie)} disabled={isWatched}>{isWatched ? "WATCHED" : "✓ WATCHED"}</button>
        </div>
      </div>
    </article>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState("Discover");
  const [theme, setTheme] = useState(() => loadTheme());
  const [mood, setMood] = useState("");
  const [movies, setMovies] = useState([]);
  const [watchlist, setWatchlist] = useState(() => loadJson("kino_watchlist"));
  const [watched, setWatched] = useState(() => loadJson("kino_watched"));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [relatedMovies, setRelatedMovies] = useState([]);

  useEffect(() => {
    saveJson("kino_watchlist", watchlist);
  }, [watchlist]);

  useEffect(() => {
    saveJson("kino_watched", watched);
  }, [watched]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("kino_theme", theme);
  }, [theme]);

  const excludedIds = useMemo(() => {
    const ids = new Set();
    watchlist.forEach((m) => ids.add(m.imdbID));
    watched.forEach((m) => ids.add(m.imdbID));
    return [...ids];
  }, [watchlist, watched]);

  const addToWatchlist = (movie) => {
    setWatchlist((prev) => {
      if (prev.some((m) => m.imdbID === movie.imdbID)) {
        return prev;
      }
      return [movie, ...prev];
    });
  };

  const addToWatched = (movie) => {
    setWatched((prev) => {
      if (prev.some((m) => m.imdbID === movie.imdbID)) {
        return prev;
      }
      return [movie, ...prev];
    });

    setWatchlist((prev) => prev.filter((m) => m.imdbID !== movie.imdbID));
  };

  const runDiscover = async () => {
    if (!mood.trim()) {
      setError("Describe your current mood first.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await fetchRecommendations(mood.trim(), excludedIds);
      setMovies(data.movies || []);
      if (!data.movies?.length) {
        setError("No matches were found this round. Try a different mood.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const openMovieDetails = async (imdbID) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError("");
    setSelectedMovie(null);
    setRelatedMovies([]);

    try {
      const data = await fetchMovieDetails(imdbID);
      setSelectedMovie(data.movie || null);
      setRelatedMovies(data.related || []);
    } catch (err) {
      setDetailError(err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const renderList = (list) => {
    if (!list.length) {
      return <div className="empty">NO FILMS HERE YET.</div>;
    }

    return (
      <div className="grid">
        {list.map((movie) => (
          <MovieCard
            key={movie.imdbID}
            movie={movie}
            onOpen={openMovieDetails}
            onAddWatchlist={addToWatchlist}
            onAddWatched={addToWatched}
            watchlist={watchlist}
            watched={watched}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">KINO</div>
        <button className="theme-toggle" onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}>
          {theme === "dark" ? "LIGHT MODE" : "NIGHT MODE"}
        </button>
        <nav>
          {NAV_ITEMS.map((item) => (
            <button
              key={item}
              className={item === activeTab ? "nav-item active" : "nav-item"}
              onClick={() => setActiveTab(item)}
            >
              {item}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main">
        <header className="hero-shell">
          <div className="hero-copy">
            <span className="eyebrow">Y2K SKY EDITION</span>
            <h1>KINO</h1>
            <p>Movie picks by current mood.</p>
          </div>
        </header>

        {activeTab === "Discover" ? (
          <section>
            <div className="discover-panel">
              <textarea
                placeholder="What’s your current mood?"
                value={mood}
                onChange={(event) => setMood(event.target.value)}
              />
              <div className="chips">
                {quickMoods.map((item) => (
                  <button key={item} onClick={() => setMood(item)}>{item}</button>
                ))}
              </div>
              <button className="find-btn" onClick={runDiscover} disabled={loading}>
                {loading ? "SCANNING SIGNAL..." : "FIND 5 FILMS"}
              </button>
              {error ? <p className="error">{error}</p> : null}
            </div>
            {renderList(movies)}
          </section>
        ) : null}

        {activeTab === "Watchlist" ? <section>{renderList(watchlist)}</section> : null}
        {activeTab === "Watched" ? <section>{renderList(watched)}</section> : null}
      </main>

      {detailOpen ? (
        <div className="detail-overlay" onClick={() => setDetailOpen(false)}>
          <div className="detail-modal" onClick={(event) => event.stopPropagation()}>
            <button className="close" onClick={() => setDetailOpen(false)}>X</button>
            {detailLoading ? <div className="empty">LOADING TRANSMISSION...</div> : null}
            {detailError ? <p className="error">{detailError}</p> : null}
            {selectedMovie ? (
              <>
                <h2>{selectedMovie.title} ({selectedMovie.year})</h2>
                <p className="meta">{selectedMovie.genre} · {selectedMovie.runtime} · ★ {selectedMovie.imdbRating}</p>
                <p className="plot">{selectedMovie.plot}</p>
                <div className="actions">
                  <button onClick={() => addToWatchlist(selectedMovie)}>+ WATCHLIST</button>
                  <button onClick={() => addToWatched(selectedMovie)}>✓ WATCHED</button>
                </div>

                <h3 className="related-title">3 RELATED SIGNALS</h3>
                <div className="related-grid">
                  {relatedMovies.map((movie) => (
                    <article className="related-card" key={movie.imdbID}>
                      <PosterArt title={movie.title} year={movie.year} poster={movie.poster} className="poster-image" />
                      <div>
                        <h4>{movie.title}</h4>
                        <p>{movie.year} · ★ {movie.imdbRating || "-"}</p>
                        <p className="reason">{movie.vibeReason}</p>
                        <button onClick={() => openMovieDetails(movie.imdbID)}>OPEN</button>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default App;
