import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Users table - stores user account information
  users: defineTable({
    username: v.string(),
    email: v.string(),
    displayName: v.string(),
    passwordHash: v.string(),
    isOnline: v.boolean(),
    currentRoomId: v.optional(v.id("rooms")),
    createdAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_username", ["username"]),

  // Rooms table - stores movie watching rooms
  rooms: defineTable({
    name: v.string(),
    movieTitle: v.string(),
    movieFileName: v.string(), // Expected filename for validation
    adminId: v.id("users"),
    isPublic: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_admin", ["adminId"])
    .index("by_public", ["isPublic"]),

  // Room members table - tracks who is in which room
  roomMembers: defineTable({
    roomId: v.id("rooms"),
    userId: v.id("users"),
    localFilePath: v.optional(v.string()), // User's local movie file path
    isReady: v.boolean(), // Has selected valid file
    joinedAt: v.number(),
  })
    .index("by_room", ["roomId"])
    .index("by_user", ["userId"])
    .index("by_room_and_user", ["roomId", "userId"]),

  // Sync state table - real-time playback synchronization
  syncState: defineTable({
    roomId: v.id("rooms"),
    isPlaying: v.boolean(),
    currentTime: v.number(), // in seconds
    playbackRate: v.number(),
    lastUpdatedBy: v.id("users"),
    lastUpdatedAt: v.number(),
  }).index("by_room", ["roomId"]),

  // Sessions table - for authentication
  sessions: defineTable({
    userId: v.id("users"),
    token: v.string(),
    expiresAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_user", ["userId"]),
});
