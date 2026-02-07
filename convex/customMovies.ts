import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const addCustomMovie = mutation({
  args: {
    token: v.string(),
    title: v.string(),
    poster: v.optional(v.string()),
    year: v.optional(v.number()),
    imdbScore: v.optional(v.number()),
    overview: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!session || session.expiresAt < Date.now()) {
      throw new Error("Invalid session");
    }

    const movieId = await ctx.db.insert("customMovies", {
      title: args.title,
      poster: args.poster,
      year: args.year,
      imdbScore: args.imdbScore,
      overview: args.overview,
      addedBy: session.userId,
      createdAt: Date.now(),
    });

    return movieId;
  },
});

export const searchCustomMovies = query({
  args: {
    query: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.query.length < 2) return [];

    const results = await ctx.db
      .query("customMovies")
      .withSearchIndex("by_title", (q) => q.search("title", args.query))
      .take(10);

    return results;
  },
});

export const updateCustomMovie = mutation({
  args: {
    token: v.string(),
    movieId: v.id("customMovies"),
    title: v.string(),
    poster: v.optional(v.string()),
    year: v.optional(v.number()),
    imdbScore: v.optional(v.number()),
    overview: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!session || session.expiresAt < Date.now()) {
      throw new Error("Invalid session");
    }

    const movie = await ctx.db.get(args.movieId);
    if (!movie) {
      throw new Error("Movie not found");
    }

    if (movie.addedBy !== session.userId) {
      throw new Error("Only the user who added this movie can edit it");
    }

    await ctx.db.patch(args.movieId, {
      title: args.title,
      poster: args.poster,
      year: args.year,
      imdbScore: args.imdbScore,
      overview: args.overview,
    });
  },
});

export const deleteCustomMovie = mutation({
  args: {
    token: v.string(),
    movieId: v.id("customMovies"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!session || session.expiresAt < Date.now()) {
      throw new Error("Invalid session");
    }

    const movie = await ctx.db.get(args.movieId);
    if (!movie) {
      throw new Error("Movie not found");
    }

    if (movie.addedBy !== session.userId) {
      throw new Error("Only the user who added this movie can delete it");
    }

    await ctx.db.delete(args.movieId);
  },
});

export const listCustomMovies = query({
  args: {},
  handler: async (ctx) => {
    const movies = await ctx.db
      .query("customMovies")
      .order("desc")
      .take(50);

    return movies;
  },
});
