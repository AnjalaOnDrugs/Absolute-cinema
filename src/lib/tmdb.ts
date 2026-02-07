import { TMDBMovie } from '../types';

const TMDB_API_KEY = '23221d145226583a27d6557f464ece5b';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

export { type TMDBMovie };

export const searchMovies = async (query: string): Promise<TMDBMovie[]> => {
    if (query.length < 4) return [];

    const response = await fetch(
        `${BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=en-US&page=1`
    );
    const data = await response.json();
    return data.results || [];
};

export const getPopularMovies = async (): Promise<TMDBMovie[]> => {
    const response = await fetch(
        `${BASE_URL}/movie/popular?api_key=${TMDB_API_KEY}&language=en-US&page=1`
    );
    const data = await response.json();
    return data.results || [];
};

export const getImageUrl = (path: string | null | undefined) => {
    if (!path) return 'https://via.placeholder.com/500x750?text=No+Poster';
    // If it's already a full URL or base64 data URL, return as-is
    if (path.startsWith('http') || path.startsWith('data:')) return path;
    return `${IMAGE_BASE_URL}${path}`;
};
