import Groq from "groq-sdk";

const OMDB_API_KEY = process.env.OMDB_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const groq = GROQ_API_KEY ? new Groq({ apiKey: GROQ_API_KEY }) : null;

function assertApiKeys() {
  if (!OMDB_API_KEY || !GROQ_API_KEY) {
    throw new Error("Missing OMDB_API_KEY or GROQ_API_KEY in environment variables.");
  }
}

async function askGroq(prompt, options = {}) {
  const { temperature = 0.8, maxOutputTokens = 500 } = options;

  if (!groq) {
    throw new Error("Groq SDK is not initialized. Check GROQ_API_KEY.");
  }

  const response = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [
      {
        role: "system",
        content: "You are a film curator. Return only valid JSON and no markdown."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    temperature,
    max_tokens: maxOutputTokens
  });

  const text = response?.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error("Groq response did not include text content.");
  }

  return text;
}

function parseModelJson(rawText) {
  if (!rawText || typeof rawText !== "string") {
    throw new Error("Model returned empty content.");
  }

  const cleaned = rawText.trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Continue with extraction fallbacks.
  }

  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // Continue with structural extraction.
    }
  }

  const start = cleaned.search(/[\[{]/);
  if (start !== -1) {
    const openChar = cleaned[start];
    const closeChar = openChar === "[" ? "]" : "}";
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < cleaned.length; i += 1) {
      const ch = cleaned[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === openChar) {
        depth += 1;
      } else if (ch === closeChar) {
        depth -= 1;
        if (depth === 0) {
          const candidate = cleaned.slice(start, i + 1);
          try {
            return JSON.parse(candidate);
          } catch {
            break;
          }
        }
      }
    }
  }

  throw new Error("Model returned invalid JSON format.");
}

function cleanMovieTitle(title, year) {
  const rawTitle = String(title || "").trim();

  if (!rawTitle) {
    return "Untitled";
  }

  const stripped = rawTitle.replace(/\s*\((?:19|20)\d{2}\)\s*$/u, "").trim();
  const yearText = String(year || "").trim();

  if (yearText && stripped.endsWith(`(${yearText})`)) {
    return stripped.slice(0, -(`(${yearText})`.length)).trim();
  }

  return stripped;
}

async function askGroqForJson(prompt) {
  const raw = await askGroq(prompt);

  try {
    return parseModelJson(raw);
  } catch {
    const repairPrompt = `Convert the text below into valid JSON only.\nRules:\n- Preserve the original data intent.\n- Return only JSON, no markdown, no commentary.\n- Use double quotes for all keys and string values.\n\nTEXT:\n${raw}`;

    const repairedRaw = await askGroq(repairPrompt, {
      temperature: 0,
      maxOutputTokens: 900
    });

    return parseModelJson(repairedRaw);
  }
}

async function omdbByTitle(title, year) {
  const query = new URLSearchParams({
    apikey: OMDB_API_KEY,
    t: title,
    type: "movie"
  });

  if (year) {
    query.set("y", String(year));
  }

  const response = await fetch(`https://www.omdbapi.com/?${query.toString()}`);
  const data = await response.json();

  if (data.Response === "False") {
    return null;
  }

  return data;
}

async function omdbById(imdbID) {
  const query = new URLSearchParams({
    apikey: OMDB_API_KEY,
    i: imdbID,
    plot: "full"
  });

  const response = await fetch(`https://www.omdbapi.com/?${query.toString()}`);
  const data = await response.json();

  if (data.Response === "False") {
    return null;
  }

  return data;
}

function normalizeMovie(raw) {
  const title = raw.Title ?? raw.title ?? raw.MovieTitle ?? raw.name;
  const year = raw.Year ?? raw.year ?? raw.Released?.slice(0, 4) ?? raw.releasedYear;

  return {
    imdbID: raw.imdbID ?? raw.imdbId ?? raw.id ?? "",
    title: cleanMovieTitle(title, year),
    year: year ?? "N/A",
    poster: (raw.Poster ?? raw.poster) && (raw.Poster ?? raw.poster) !== "N/A" ? (raw.Poster ?? raw.poster) : "",
    rated: raw.Rated ?? raw.rated ?? "N/A",
    runtime: raw.Runtime ?? raw.runtime ?? "N/A",
    genre: raw.Genre ?? raw.genre ?? "N/A",
    director: raw.Director ?? raw.director ?? "N/A",
    actors: raw.Actors ?? raw.actors ?? "N/A",
    plot: raw.Plot ?? raw.plot ?? "N/A",
    imdbRating: raw.imdbRating ?? raw.imdbrating ?? raw.rating ?? "N/A"
  };
}

function hasIncompleteDetails(movie) {
  if (!movie) {
    return true;
  }

  const detailFields = [movie.runtime, movie.genre, movie.director, movie.actors, movie.plot, movie.imdbRating];
  const missingCount = detailFields.filter((value) => !value || value === "N/A").length;

  return missingCount >= 3;
}

function readJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  return {};
}

export async function handleRecommend(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    assertApiKeys();

    const body = readJsonBody(req);
    const mood = (body?.mood || "").trim();
    const excludeImdbIDs = Array.isArray(body?.excludeImdbIDs) ? body.excludeImdbIDs : [];

    if (!mood) {
      return res.status(400).json({ error: "Current mood is required." });
    }

    const prompt = `You are a film curator. Return exactly 7 movie suggestions as JSON array with this shape:\n[{"title":"Movie Title","year":1999,"why":"short reason"}]\n\nRules:\n- The user's current mood is: "${mood}"\n- Movies only (no TV, no mini-series)\n- Mix eras and countries when possible\n- Avoid these imdb ids if they are known from memory: ${excludeImdbIDs.join(", ") || "none"}\n- Keep reasons under 18 words\n- Output JSON only`;

    const picks = await askGroqForJson(prompt);

    if (!Array.isArray(picks)) {
      throw new Error("Model output was not an array.");
    }

    const resolved = [];
    const usedIds = new Set(excludeImdbIDs);

    for (const pick of picks) {
      if (!pick?.title) {
        continue;
      }

      const hit = await omdbByTitle(pick.title, pick.year);

      if (!hit || !hit.imdbID || usedIds.has(hit.imdbID)) {
        continue;
      }

      usedIds.add(hit.imdbID);
      resolved.push({
        ...normalizeMovie(hit),
        vibeReason: pick.why || "Matches your current mood."
      });

      if (resolved.length === 5) {
        break;
      }
    }

    return res.status(200).json({ movies: resolved });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to generate recommendations." });
  }
}

export async function handleMovieDetails(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    assertApiKeys();

    const imdbID = req.query?.imdbID;
    let movie = await omdbById(imdbID);

    if (!movie) {
      return res.status(404).json({ error: "Movie not found." });
    }

    if (hasIncompleteDetails(movie) && movie.Title) {
      const fallbackMovie = await omdbByTitle(movie.Title, movie.Year);

      if (fallbackMovie && !hasIncompleteDetails(fallbackMovie)) {
        movie = fallbackMovie;
      }
    }

    const detail = normalizeMovie(movie);
    const prompt = `Recommend exactly 3 movies similar in emotional texture to this movie:\nTitle: ${detail.title}\nYear: ${detail.year}\nGenre: ${detail.genre}\nPlot: ${detail.plot}\n\nReturn JSON array only:\n[{"title":"Movie Title","year":2001,"why":"short reason"}]`;

    const relatedPicks = await askGroqForJson(prompt);

    const related = [];
    const seen = new Set([imdbID]);

    if (Array.isArray(relatedPicks)) {
      for (const pick of relatedPicks) {
        if (!pick?.title) {
          continue;
        }

        const hit = await omdbByTitle(pick.title, pick.year);

        if (!hit || !hit.imdbID || seen.has(hit.imdbID)) {
          continue;
        }

        seen.add(hit.imdbID);
        related.push({
          ...normalizeMovie(hit),
          vibeReason: pick.why || "Matches your current mood."
        });

        if (related.length === 3) {
          break;
        }
      }
    }

    return res.status(200).json({ movie: detail, related });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to fetch movie details." });
  }
}
