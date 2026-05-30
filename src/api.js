async function toJson(response) {
  const data = await response.json();
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
