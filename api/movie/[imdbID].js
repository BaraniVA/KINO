import { handleMovieDetails } from "../_lib.js";

export default async function handler(req, res) {
  req.query = {
    ...(req.query || {}),
    imdbID: req.query?.imdbID || req.query?.["imdbID"]
  };

  return handleMovieDetails(req, res);
}
