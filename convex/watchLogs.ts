import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const addWatchLog = mutation({
    args: {
        token: v.string(),
        movieTitle: v.string(),
        moviePoster: v.optional(v.string()),
        rating: v.number(),
        review: v.optional(v.string()),
        participants: v.array(v.string()),
        tmdbId: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const session = await ctx.db
            .query("sessions")
            .withIndex("by_token", (q) => q.eq("token", args.token))
            .unique();

        if (!session || session.expiresAt < Date.now()) {
            throw new Error("Invalid or expired session");
        }

        const { token, ...logData } = args;

        return await ctx.db.insert("watchLogs", {
            ...logData,
            userId: session.userId,
            watchedAt: Date.now(),
        });
    },
});

export const getWatchLogs = query({
    args: { token: v.string() },
    handler: async (ctx, args) => {
        const session = await ctx.db
            .query("sessions")
            .withIndex("by_token", (q) => q.eq("token", args.token))
            .unique();

        if (!session || session.expiresAt < Date.now()) {
            return [];
        }

        return await ctx.db
            .query("watchLogs")
            .withIndex("by_user", (q) => q.eq("userId", session.userId))
            .order("desc")
            .collect();
    },
});

export const getWatchLogsByUser = query({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("watchLogs")
            .withIndex("by_user", (q) => q.eq("userId", args.userId))
            .order("desc")
            .collect();
    },
});
