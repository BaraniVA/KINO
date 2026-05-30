async function toJson(response) {
  const raw = await response.text();
  let data = null;

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    if (!response.ok) {
      throw new Error(`Request failed (${response.status}): ${raw.slice(0, 180) || "Non-JSON response"}`);
    }

    throw new Error("Server returned invalid JSON.");
  }

  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

export async function fetchRecommendations(mood, excludeImdbIDs = []) {
  const response = await fetch("/api/recommend", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ mood, excludeImdbIDs })
  });

  return toJson(response);
}

export async function fetchMovieDetails(imdbID) {
  const response = await fetch(`/api/movie/${imdbID}`);
  return toJson(response);
}
