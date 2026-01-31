import { ActionCtx, action } from "./_generated/server";
import { v } from "convex/values";

const API_KEY = 'PUDav6UV8fUj95ko8eZczqpgXlnFDARm';
const BASE_URL = 'https://api.opensubtitles.com/api/v1';

export const searchSubtitles = action({
    args: {
        query: v.string(),
        languages: v.optional(v.string()),
        tmdbId: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const url = new URL(`${BASE_URL}/subtitles`);
        if (args.tmdbId) {
            url.searchParams.append('tmdb_id', args.tmdbId.toString());
        } else {
            url.searchParams.append('query', args.query);
        }
        url.searchParams.append('languages', args.languages || 'en');

        const response = await fetch(url.toString(), {
            headers: {
                'Api-Key': API_KEY,
                'User-Agent': 'AbsoluteCinema v1.0.0',
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('OpenSubtitles API error:', errorText);
            throw new Error(`Failed to search subtitles: ${response.status} ${response.statusText}`);
        }

        return await response.json();
    },
});

export const getDownloadLink = action({
    args: {
        fileId: v.number(),
    },
    handler: async (ctx, args) => {
        const response = await fetch(`${BASE_URL}/download`, {
            method: 'POST',
            headers: {
                'Api-Key': API_KEY,
                'User-Agent': 'AbsoluteCinema v1.0.0',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                file_id: args.fileId,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to get download link');
        }

        return await response.json();
    },
});

export const fetchSubtitleContent = action({
    args: {
        url: v.string(),
    },
    handler: async (ctx, args) => {
        const response = await fetch(args.url);
        if (!response.ok) {
            throw new Error(`Failed to fetch subtitle content: ${response.status} ${response.statusText}`);
        }
        return await response.text();
    },
});
