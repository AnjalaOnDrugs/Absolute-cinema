import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Simple hash function for demo purposes (in production, use proper bcrypt)
function simpleHash(password: string): string {
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
        const char = password.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
    }
    return hash.toString(16) + "_" + password.length;
}

function generateToken(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Register a new user
export const register = mutation({
    args: {
        username: v.string(),
        email: v.string(),
        password: v.string(),
        displayName: v.string(),
        profilePicture: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        // Check if email already exists
        const existingEmail = await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", args.email))
            .first();

        if (existingEmail) {
            throw new Error("Email already registered");
        }

        // Check if username already exists
        const existingUsername = await ctx.db
            .query("users")
            .withIndex("by_username", (q) => q.eq("username", args.username))
            .first();

        if (existingUsername) {
            throw new Error("Username already taken");
        }

        // Create user
        const userId = await ctx.db.insert("users", {
            username: args.username,
            email: args.email,
            displayName: args.displayName,
            passwordHash: simpleHash(args.password),
            profilePicture: args.profilePicture,
            isOnline: true,
            createdAt: Date.now(),
        });

        // Create session
        const token = generateToken();
        await ctx.db.insert("sessions", {
            userId,
            token,
            expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        const user = await ctx.db.get(userId);
        if (!user) throw new Error("Failed to create user");

        return {
            token,
            user: {
                _id: user._id,
                username: user.username,
                email: user.email,
                displayName: user.displayName,
                profilePicture: user.profilePicture,
                isOnline: user.isOnline,
            }
        };
    },
});

// Login user
export const login = mutation({
    args: {
        email: v.string(),
        password: v.string(),
    },
    handler: async (ctx, args) => {
        const user = await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", args.email))
            .first();

        if (!user) {
            throw new Error("Invalid email or password");
        }

        if (user.passwordHash !== simpleHash(args.password)) {
            throw new Error("Invalid email or password");
        }

        // Update online status
        await ctx.db.patch(user._id, { isOnline: true });

        // Create new session
        const token = generateToken();
        await ctx.db.insert("sessions", {
            userId: user._id,
            token,
            expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        });

        return {
            token,
            user: {
                _id: user._id,
                username: user.username,
                email: user.email,
                displayName: user.displayName,
                profilePicture: user.profilePicture,
                isOnline: user.isOnline,
            }
        };
    },
});

// Logout user
export const logout = mutation({
    args: {
        token: v.string(),
    },
    handler: async (ctx, args) => {
        const session = await ctx.db
            .query("sessions")
            .withIndex("by_token", (q) => q.eq("token", args.token))
            .first();

        if (session) {
            await ctx.db.patch(session.userId, { isOnline: false });
            await ctx.db.delete(session._id);
        }
    },
});

// Get current user from session token
export const getCurrentUser = query({
    args: {
        token: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        if (!args.token) return null;

        const session = await ctx.db
            .query("sessions")
            .withIndex("by_token", (q) => q.eq("token", args.token!))
            .first();

        if (!session || session.expiresAt < Date.now()) {
            return null;
        }

        const user = await ctx.db.get(session.userId);
        if (!user) return null;

        return {
            _id: user._id,
            username: user.username,
            email: user.email,
            displayName: user.displayName,
            profilePicture: user.profilePicture,
            isOnline: user.isOnline,
            currentRoomId: user.currentRoomId,
        };
    },
});

// Update user online status
export const updateOnlineStatus = mutation({
    args: {
        token: v.string(),
        isOnline: v.boolean(),
    },
    handler: async (ctx, args) => {
        const session = await ctx.db
            .query("sessions")
            .withIndex("by_token", (q) => q.eq("token", args.token))
            .first();

        if (!session) {
            throw new Error("Invalid session");
        }

        await ctx.db.patch(session.userId, { isOnline: args.isOnline });
    },
});

// Cleanup user (called on window close/disconnect)
export const cleanupUser = mutation({
    args: {
        userId: v.id("users"),
    },
    handler: async (ctx, args) => {
        // 1. Remove user from all rooms (roomMembers)
        const memberships = await ctx.db
            .query("roomMembers")
            .withIndex("by_user", (q) => q.eq("userId", args.userId))
            .collect();

        for (const member of memberships) {
            await ctx.db.delete(member._id);
        }

        // 2. Remove all sessions for this user
        const sessions = await ctx.db
            .query("sessions")
            .withIndex("by_user", (q) => q.eq("userId", args.userId))
            .collect();

        for (const session of sessions) {
            await ctx.db.delete(session._id);
        }

        // 3. Mark offline and clear current room
        await ctx.db.patch(args.userId, {
            isOnline: false,
            currentRoomId: undefined
        });
    },
});

export const getUserById = query({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        const user = await ctx.db.get(args.userId);
        if (!user) return null;

        return {
            _id: user._id,
            username: user.username,
            displayName: user.displayName,
            profilePicture: user.profilePicture,
            isOnline: user.isOnline,
            createdAt: user.createdAt,
        };
    },
});
