"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { RtcTokenBuilder, RtcRole } from "agora-token";

// Generate an Agora RTC token for voice chat
export const generateToken = action({
    args: {
        channelName: v.string(),
        uid: v.number(),
    },
    handler: async (_ctx, args) => {
        const appId = process.env.AGORA_APP_ID;
        const appCertificate = process.env.AGORA_APP_CERTIFICATE;

        if (!appId || !appCertificate) {
            throw new Error(
                "Missing AGORA_APP_ID or AGORA_APP_CERTIFICATE environment variables. " +
                "Set them in your Convex dashboard under Settings > Environment Variables."
            );
        }

        // Token expires in 1 hour (3600 seconds)
        const tokenExpire = 3600;
        // Privilege expires in 1 hour
        const privilegeExpire = 3600;

        const token = RtcTokenBuilder.buildTokenWithUid(
            appId,
            appCertificate,
            args.channelName,
            args.uid,
            RtcRole.PUBLISHER,
            tokenExpire,
            privilegeExpire
        );

        return token;
    },
});
