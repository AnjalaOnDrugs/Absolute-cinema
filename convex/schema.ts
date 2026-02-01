import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Users table - stores user account information
  users: defineTable({
    username: v.string(),
    email: v.string(),
    displayName: v.string(),
    passwordHash: v.string(),
    profilePicture: v.optional(v.string()), // base64 data URL for profile picture
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
    tmdbId: v.optional(v.number()),
    moviePoster: v.optional(v.string()),
    adminId: v.id("users"),
    isPublic: v.boolean(),
    everyoneCanControl: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_admin", ["adminId"]),

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
    lastAction: v.optional(v.union(v.literal("play"), v.literal("pause"), v.literal("seek"))),
  }).index("by_room", ["roomId"]),

  // Sessions table - for authentication
  sessions: defineTable({
    userId: v.id("users"),
    token: v.string(),
    expiresAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_user", ["userId"]),

  // Watch logs table - stores history of watched movies
  watchLogs: defineTable({
    userId: v.id("users"),
    movieTitle: v.string(),
    moviePoster: v.optional(v.string()),
    rating: v.number(), // 0 to 5, including half stars
    review: v.optional(v.string()), // user's review text
    participants: v.array(v.string()), // list of display names
    watchedAt: v.number(),
    tmdbId: v.optional(v.number()),
  }).index("by_user", ["userId"]),
});
