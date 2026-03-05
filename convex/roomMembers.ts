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

        // Check if room has a youtube URL loaded
        const isYoutubeUrl = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/.test(room.movieFileName.trim());

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

            if (isYoutubeUrl && !existingMember.isReady) {
                await ctx.db.patch(existingMember._id, {
                    localFilePath: room.movieFileName.trim(),
                    isReady: true,
                });
            }
            return existingMember._id;
        }

        // Add as new member
        const memberId = await ctx.db.insert("roomMembers", {
            roomId: args.roomId,
            userId: session.userId,
            isReady: isYoutubeUrl,
            localFilePath: isYoutubeUrl ? room.movieFileName.trim() : undefined,
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

        // Find membership
        const member = await ctx.db
            .query("roomMembers")
            .withIndex("by_room_and_user", (q) =>
                q.eq("roomId", args.roomId).eq("userId", session.userId)
            )
            .first();

        // Handle admin transfer or room deletion BEFORE deleting membership
        const room = await ctx.db.get(args.roomId);
        if (room && room.adminId === session.userId) {
            const allMembers = await ctx.db
                .query("roomMembers")
                .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
                .collect();

            // Filter out the leaving user
            const remainingMembers = allMembers.filter(
                (m) => m.userId !== session.userId
            );

            if (remainingMembers.length > 0) {
                // Transfer admin to the earliest joiner
                const newAdmin = remainingMembers.sort(
                    (a, b) => a.joinedAt - b.joinedAt
                )[0];
                await ctx.db.patch(room._id, { adminId: newAdmin.userId });
            } else {
                // No one left — delete sync state and room
                const syncState = await ctx.db
                    .query("syncState")
                    .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
                    .first();
                if (syncState) {
                    await ctx.db.delete(syncState._id);
                }
                await ctx.db.delete(room._id);
            }
        }

        // Now delete the membership record
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

        // Check for Youtube URL
        const isYoutubeUrl = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/.test(args.localFilePath);

        let isValidFile = false;
        let fileName = "";
        let expectedFileName = room.movieFileName.trim();

        if (isYoutubeUrl) {
            fileName = args.localFilePath;

            if (room.adminId === session.userId) {
                // Admin is setting a YouTube URL. Update the room so everyone expects this URL.
                await ctx.db.patch(room._id, { movieFileName: args.localFilePath });
                expectedFileName = args.localFilePath;

                // Automatically set this URL for all members so they don't have to enter it
                const allMembers = await ctx.db
                    .query("roomMembers")
                    .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
                    .collect();

                for (const m of allMembers) {
                    await ctx.db.patch(m._id, {
                        localFilePath: args.localFilePath,
                        isReady: true,
                    });
                }

                return { isValid: true, expectedFileName: args.localFilePath, actualFileName: args.localFilePath };
            } else {
                // Viewer is setting it (or it's already set by admin)
                isValidFile = args.localFilePath === expectedFileName;
            }
        } else {
            // Extract filename from path - handle Windows and Unix paths
            let normalizedPath = args.localFilePath;
            try {
                // Decode URI components if the path was encoded
                normalizedPath = decodeURIComponent(normalizedPath);
            } catch {
                // Path wasn't encoded, use as-is
            }

            fileName = normalizedPath.split(/[/\\]/).pop()?.trim() || "";
            isValidFile = fileName.toLowerCase() === expectedFileName.toLowerCase();
        }

        // Debug logging
        console.log("File comparison:", {
            selectedPath: args.localFilePath,
            extractedFileName: fileName,
            expectedFileName: expectedFileName,
            isValidFile
        });

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
