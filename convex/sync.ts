import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Get current sync state for a room
export const getSyncState = query({
    args: {
        roomId: v.id("rooms"),
    },
    handler: async (ctx, args) => {
        const syncState = await ctx.db
            .query("syncState")
            .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
            .first();

        if (!syncState) return null;

        const lastUpdater = await ctx.db.get(syncState.lastUpdatedBy);

        return {
            ...syncState,
            lastUpdaterName: lastUpdater?.displayName || "Unknown",
            lastUpdaterProfilePicture: lastUpdater?.profilePicture,
        };
    },
});

// Update sync state (play/pause/seek)
export const updateSyncState = mutation({
    args: {
        token: v.string(),
        roomId: v.id("rooms"),
        isPlaying: v.optional(v.boolean()),
        currentTime: v.optional(v.number()),
        playbackRate: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        console.log("updateSyncState called", args);
        const session = await ctx.db
            .query("sessions")
            .withIndex("by_token", (q) => q.eq("token", args.token))
            .first();

        if (!session || session.expiresAt < Date.now()) {
            console.error("Invalid session");
            throw new Error("Invalid session");
        }

        // Get room to check admin status
        const room = await ctx.db.get(args.roomId);
        if (!room) {
            console.error("Room not found");
            throw new Error("Room not found");
        }

        // Only admin can update sync state, unless everyone control is enabled
        if (room.adminId !== session.userId && !room.everyoneCanControl) {
            console.error("Not admin and everyone control is disabled");
            throw new Error("Only the room admin can control playback");
        }

        // Get current sync state
        const syncState = await ctx.db
            .query("syncState")
            .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
            .first();

        if (!syncState) {
            console.error("Sync state not found");
            throw new Error("Sync state not found");
        }

        // Update with provided values
        const updates: Partial<{
            isPlaying: boolean;
            currentTime: number;
            playbackRate: number;
            lastUpdatedBy: typeof session.userId;
            lastUpdatedAt: number;
        }> = {
            lastUpdatedBy: session.userId,
            lastUpdatedAt: Date.now(),
        };

        if (args.isPlaying !== undefined) {
            updates.isPlaying = args.isPlaying;
        }
        if (args.currentTime !== undefined) {
            updates.currentTime = args.currentTime;
        }
        if (args.playbackRate !== undefined) {
            updates.playbackRate = args.playbackRate;
        }

        await ctx.db.patch(syncState._id, updates);
        console.log("Sync state updated", updates);
    },
});

// Play command
export const play = mutation({
    args: {
        token: v.string(),
        roomId: v.id("rooms"),
        currentTime: v.number(),
    },
    handler: async (ctx, args) => {
        console.log("play called", args);
        const session = await ctx.db
            .query("sessions")
            .withIndex("by_token", (q) => q.eq("token", args.token))
            .first();

        if (!session) {
            console.error("Invalid session");
            throw new Error("Invalid session");
        }

        const room = await ctx.db.get(args.roomId);
        if (!room) {
            console.error("Room not found");
            throw new Error("Room not found");
        }

        if (room.adminId !== session.userId && !room.everyoneCanControl) {
            console.error("Not admin and everyone control is disabled");
            throw new Error("Only the room admin can control playback");
        }

        const syncState = await ctx.db
            .query("syncState")
            .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
            .first();

        if (syncState) {
            await ctx.db.patch(syncState._id, {
                isPlaying: true,
                currentTime: args.currentTime,
                lastUpdatedBy: session.userId,
                lastUpdatedAt: Date.now(),
                lastAction: "play",
            });
            console.log("Play: patch executed");
        } else {
            console.error("Sync state not found in play");
        }
    },
});

// Pause command
export const pause = mutation({
    args: {
        token: v.string(),
        roomId: v.id("rooms"),
        currentTime: v.number(),
    },
    handler: async (ctx, args) => {
        console.log("pause called", args);
        const session = await ctx.db
            .query("sessions")
            .withIndex("by_token", (q) => q.eq("token", args.token))
            .first();

        if (!session) {
            console.error("Invalid session");
            throw new Error("Invalid session");
        }

        const room = await ctx.db.get(args.roomId);
        if (!room) {
            console.error("Room not found");
            throw new Error("Room not found");
        }

        if (room.adminId !== session.userId && !room.everyoneCanControl) {
            console.error("Not admin and everyone control is disabled");
            throw new Error("Only the room admin can control playback");
        }

        const syncState = await ctx.db
            .query("syncState")
            .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
            .first();

        if (syncState) {
            await ctx.db.patch(syncState._id, {
                isPlaying: false,
                currentTime: args.currentTime,
                lastUpdatedBy: session.userId,
                lastUpdatedAt: Date.now(),
                lastAction: "pause",
            });
            console.log("Pause: patch executed");
        } else {
            console.error("Sync state not found in pause");
        }
    },
});

// Seek command
export const seek = mutation({
    args: {
        token: v.string(),
        roomId: v.id("rooms"),
        currentTime: v.number(),
    },
    handler: async (ctx, args) => {
        console.log("seek called", args);
        const session = await ctx.db
            .query("sessions")
            .withIndex("by_token", (q) => q.eq("token", args.token))
            .first();

        if (!session) {
            console.error("Invalid session");
            throw new Error("Invalid session");
        }

        const room = await ctx.db.get(args.roomId);
        if (!room) {
            console.error("Room not found");
            throw new Error("Room not found");
        }

        if (room.adminId !== session.userId && !room.everyoneCanControl) {
            console.error("Not admin and everyone control is disabled");
            throw new Error("Only the room admin can control playback");
        }

        const syncState = await ctx.db
            .query("syncState")
            .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
            .first();

        if (syncState) {
            await ctx.db.patch(syncState._id, {
                currentTime: args.currentTime,
                lastUpdatedBy: session.userId,
                lastUpdatedAt: Date.now(),
                lastAction: "seek",
            });
            console.log("Seek: patch executed");
        } else {
            console.error("Sync state not found in seek");
        }
    },
});
