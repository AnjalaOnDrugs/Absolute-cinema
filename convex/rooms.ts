import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Create a new room (admin only functionality)
export const createRoom = mutation({
    args: {
        token: v.string(),
        name: v.string(),
        movieTitle: v.string(),
        movieFileName: v.string(),
        tmdbId: v.optional(v.number()),
        moviePoster: v.optional(v.string()),
        isPublic: v.boolean(),
        everyoneCanControl: v.boolean(),
    },
    handler: async (ctx, args) => {
        // Verify session
        const session = await ctx.db
            .query("sessions")
            .withIndex("by_token", (q) => q.eq("token", args.token))
            .first();

        if (!session || session.expiresAt < Date.now()) {
            throw new Error("Invalid session");
        }

        console.log("Creating room for TMDB ID:", args.tmdbId);

        // Create the room
        const roomId = await ctx.db.insert("rooms", {
            name: args.name,
            movieTitle: args.movieTitle,
            movieFileName: args.movieFileName,
            tmdbId: args.tmdbId,
            moviePoster: args.moviePoster,
            adminId: session.userId,
            isPublic: args.isPublic,
            everyoneCanControl: args.everyoneCanControl,
            createdAt: Date.now(),
        });

        // Create initial sync state for the room
        await ctx.db.insert("syncState", {
            roomId,
            isPlaying: false,
            currentTime: 0,
            playbackRate: 1,
            lastUpdatedBy: session.userId,
            lastUpdatedAt: Date.now(),
        });

        // Add admin as first member
        await ctx.db.insert("roomMembers", {
            roomId,
            userId: session.userId,
            isReady: false,
            joinedAt: Date.now(),
        });

        // Update user's current room
        await ctx.db.patch(session.userId, { currentRoomId: roomId });

        return roomId;
    },
});

// Get all public rooms
export const listPublicRooms = query({
    args: {},
    handler: async (ctx) => {
        const rooms = await ctx.db
            .query("rooms")
            .collect();

        // Get admin info for each room
        const roomsWithAdmin = await Promise.all(
            rooms.map(async (room) => {
                const admin = await ctx.db.get(room.adminId);
                const memberCount = await ctx.db
                    .query("roomMembers")
                    .withIndex("by_room", (q) => q.eq("roomId", room._id))
                    .collect();

                return {
                    ...room,
                    adminName: admin?.displayName || "Unknown",
                    memberCount: memberCount.length,
                };
            })
        );

        return roomsWithAdmin;
    },
});

// Get rooms created by user
export const listMyRooms = query({
    args: {
        token: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        if (!args.token) return [];

        const session = await ctx.db
            .query("sessions")
            .withIndex("by_token", (q) => q.eq("token", args.token!))
            .first();

        if (!session) return [];

        const rooms = await ctx.db
            .query("rooms")
            .withIndex("by_admin", (q) => q.eq("adminId", session.userId))
            .collect();

        const roomsWithMembers = await Promise.all(
            rooms.map(async (room) => {
                const memberCount = await ctx.db
                    .query("roomMembers")
                    .withIndex("by_room", (q) => q.eq("roomId", room._id))
                    .collect();

                return {
                    ...room,
                    memberCount: memberCount.length,
                };
            })
        );

        return roomsWithMembers;
    },
});

// Get single room details
export const getRoom = query({
    args: {
        roomId: v.id("rooms"),
    },
    handler: async (ctx, args) => {
        const room = await ctx.db.get(args.roomId);
        if (!room) return null;

        const admin = await ctx.db.get(room.adminId);

        return {
            ...room,
            adminName: admin?.displayName || "Unknown",
        };
    },
});

// Delete a room (admin only)
export const deleteRoom = mutation({
    args: {
        token: v.string(),
        roomId: v.id("rooms"),
    },
    handler: async (ctx, args) => {
        const session = await ctx.db
            .query("sessions")
            .withIndex("by_token", (q) => q.eq("token", args.token))
            .first();

        if (!session) {
            throw new Error("Invalid session");
        }

        const room = await ctx.db.get(args.roomId);
        if (!room) {
            throw new Error("Room not found");
        }

        if (room.adminId !== session.userId) {
            throw new Error("Only the admin can delete this room");
        }

        // Delete all room members and clear their currentRoomId
        const members = await ctx.db
            .query("roomMembers")
            .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
            .collect();

        for (const member of members) {
            // Update user's current room
            await ctx.db.patch(member.userId, { currentRoomId: undefined });
            // Delete membership
            await ctx.db.delete(member._id);
        }

        // Delete sync state
        const syncState = await ctx.db
            .query("syncState")
            .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
            .first();

        if (syncState) {
            await ctx.db.delete(syncState._id);
        }

        // Delete the room
        await ctx.db.delete(args.roomId);
    },
});
