import { query } from "./_generated/server";
import { v } from "convex/values";

export const foo = query({
    args: { x: v.string() },
    handler: async () => {
        return "bar";
    },
});
