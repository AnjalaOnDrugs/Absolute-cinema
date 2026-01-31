import { action, query } from "./_generated/server";

export const getServerTime = action({
    args: {},
    handler: async () => {
        return Date.now();
    },
});
