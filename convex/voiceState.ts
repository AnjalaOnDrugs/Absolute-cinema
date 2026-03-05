import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Join voice chat in a room
export const joinVoice = mutation({
    args: {
        token: v.string(),
        roomId: v.id("rooms"),
    },
    handler: async (ctx, args) => {
        const session = await ctx.db
            .query("sessions")
            .withIndex("by_token", (q) => q.eq("token", args.token))
            .first();

        if (!session || session.expiresAt < Date.now()) {
            throw new Error("Invalid session");
        }

        // Check if already in voice
        const existing = await ctx.db
            .query("voiceState")
            .withIndex("by_room_and_user", (q) =>
                q.eq("roomId", args.roomId).eq("userId", session.userId)
            )
            .first();

        if (existing) {
            return existing._id;
        }

        return await ctx.db.insert("voiceState", {
            roomId: args.roomId,
            userId: session.userId,
            isMuted: false,
            joinedAt: Date.now(),
        });
    },
});

// Leave voice chat in a room
export const leaveVoice = mutation({
    args: {
        token: v.string(),
        roomId: v.id("rooms"),
    },
    handler: async (ctx, args) => {
        const session = await ctx.db
            .query("sessions")
            .withIndex("by_token", (q) => q.eq("token", args.token))
            .first();

        if (!session || session.expiresAt < Date.now()) {
            throw new Error("Invalid session");
        }

        const voiceEntry = await ctx.db
            .query("voiceState")
            .withIndex("by_room_and_user", (q) =>
                q.eq("roomId", args.roomId).eq("userId", session.userId)
            )
            .first();

        if (voiceEntry) {
            await ctx.db.delete(voiceEntry._id);
        }
    },
});

// Update mute status
export const setMuted = mutation({
    args: {
        token: v.string(),
        roomId: v.id("rooms"),
        isMuted: v.boolean(),
    },
    handler: async (ctx, args) => {
        const session = await ctx.db
            .query("sessions")
            .withIndex("by_token", (q) => q.eq("token", args.token))
            .first();

        if (!session || session.expiresAt < Date.now()) {
            throw new Error("Invalid session");
        }

        const voiceEntry = await ctx.db
            .query("voiceState")
            .withIndex("by_room_and_user", (q) =>
                q.eq("roomId", args.roomId).eq("userId", session.userId)
            )
            .first();

        if (voiceEntry) {
            await ctx.db.patch(voiceEntry._id, { isMuted: args.isMuted });
        }
    },
});

// Get all voice chat members in a room (with user details)
export const getVoiceMembers = query({
    args: {
        roomId: v.id("rooms"),
    },
    handler: async (ctx, args) => {
        const voiceEntries = await ctx.db
            .query("voiceState")
            .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
            .collect();

        const members = await Promise.all(
            voiceEntries.map(async (entry) => {
                const user = await ctx.db.get(entry.userId);
                return {
                    _id: entry._id,
                    userId: entry.userId,
                    displayName: user?.displayName ?? "Unknown",
                    profilePicture: user?.profilePicture,
                    isMuted: entry.isMuted,
                };
            })
        );

        return members;
    },
});

// Clean up all voice state for a user (called when leaving room)
export const leaveAllVoice = mutation({
    args: {
        token: v.string(),
    },
    handler: async (ctx, args) => {
        const session = await ctx.db
            .query("sessions")
            .withIndex("by_token", (q) => q.eq("token", args.token))
            .first();

        if (!session) {
            return;
        }

        // Find all voice entries for this user across all rooms
        const allVoice = await ctx.db
            .query("voiceState")
            .filter((q) => q.eq(q.field("userId"), session.userId))
            .collect();

        for (const entry of allVoice) {
            await ctx.db.delete(entry._id);
        }
    },
});
