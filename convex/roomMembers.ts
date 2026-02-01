import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Join a room
export const joinRoom = mutation({
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

        const room = await ctx.db.get(args.roomId);
        if (!room) {
            throw new Error("Room not found");
        }

        // Check if already a member
        const existingMember = await ctx.db
            .query("roomMembers")
            .withIndex("by_room_and_user", (q) =>
                q.eq("roomId", args.roomId).eq("userId", session.userId)
            )
            .first();

        if (existingMember) {
            // Already a member, just update current room
            await ctx.db.patch(session.userId, { currentRoomId: args.roomId });
            return existingMember._id;
        }

        // Add as new member
        const memberId = await ctx.db.insert("roomMembers", {
            roomId: args.roomId,
            userId: session.userId,
            isReady: false,
            joinedAt: Date.now(),
        });

        // Update user's current room
        await ctx.db.patch(session.userId, { currentRoomId: args.roomId });

        return memberId;
    },
});

// Leave a room
export const leaveRoom = mutation({
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

        // Find and delete membership
        const member = await ctx.db
            .query("roomMembers")
            .withIndex("by_room_and_user", (q) =>
                q.eq("roomId", args.roomId).eq("userId", session.userId)
            )
            .first();

        if (member) {
            await ctx.db.delete(member._id);
        }

        // Clear current room
        await ctx.db.patch(session.userId, { currentRoomId: undefined });
    },
});

// Get all members in a room
export const getRoomMembers = query({
    args: {
        roomId: v.id("rooms"),
    },
    handler: async (ctx, args) => {
        const members = await ctx.db
            .query("roomMembers")
            .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
            .collect();

        // Get user details for each member
        const membersWithDetails = await Promise.all(
            members.map(async (member) => {
                const user = await ctx.db.get(member.userId);
                const room = await ctx.db.get(args.roomId);

                return {
                    _id: member._id,
                    userId: member.userId,
                    displayName: user?.displayName || "Unknown",
                    username: user?.username || "unknown",
                    profilePicture: user?.profilePicture,
                    isOnline: user?.isOnline || false,
                    isReady: member.isReady,
                    isAdmin: room?.adminId === member.userId,
                    joinedAt: member.joinedAt,
                };
            })
        );

        return membersWithDetails;
    },
});

// Set file path and ready status
export const setFilePath = mutation({
    args: {
        token: v.string(),
        roomId: v.id("rooms"),
        localFilePath: v.string(),
    },
    handler: async (ctx, args) => {
        const session = await ctx.db
            .query("sessions")
            .withIndex("by_token", (q) => q.eq("token", args.token))
            .first();

        if (!session) {
            throw new Error("Invalid session");
        }

        // Find membership
        const member = await ctx.db
            .query("roomMembers")
            .withIndex("by_room_and_user", (q) =>
                q.eq("roomId", args.roomId).eq("userId", session.userId)
            )
            .first();

        if (!member) {
            throw new Error("Not a member of this room");
        }

        // Get room to validate filename
        const room = await ctx.db.get(args.roomId);
        if (!room) {
            throw new Error("Room not found");
        }

        // Extract filename from path - handle Windows and Unix paths
        // Also handle potential URL encoding from Tauri
        let normalizedPath = args.localFilePath;
        try {
            // Decode URI components if the path was encoded
            normalizedPath = decodeURIComponent(normalizedPath);
        } catch {
            // Path wasn't encoded, use as-is
        }

        const fileName = normalizedPath.split(/[/\\]/).pop()?.trim() || "";
        const expectedFileName = room.movieFileName.trim();

        // Debug logging
        console.log("File comparison:", {
            selectedPath: args.localFilePath,
            normalizedPath,
            extractedFileName: fileName,
            expectedFileName: expectedFileName,
            selectedLower: fileName.toLowerCase(),
            expectedLower: expectedFileName.toLowerCase(),
        });

        // Check if filename matches expected (case-insensitive)
        const isValidFile = fileName.toLowerCase() === expectedFileName.toLowerCase();

        await ctx.db.patch(member._id, {
            localFilePath: args.localFilePath,
            isReady: isValidFile,
        });

        return { isValid: isValidFile, expectedFileName: expectedFileName, actualFileName: fileName };
    },
});

// Get my membership in a room
export const getMyMembership = query({
    args: {
        token: v.optional(v.string()),
        roomId: v.id("rooms"),
    },
    handler: async (ctx, args) => {
        if (!args.token) return null;

        const session = await ctx.db
            .query("sessions")
            .withIndex("by_token", (q) => q.eq("token", args.token!))
            .first();

        if (!session) return null;

        const member = await ctx.db
            .query("roomMembers")
            .withIndex("by_room_and_user", (q) =>
                q.eq("roomId", args.roomId).eq("userId", session.userId)
            )
            .first();

        return member;
    },
});
