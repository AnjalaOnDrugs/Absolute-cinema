export const AGORA_APP_ID = import.meta.env.VITE_AGORA_APP_ID as string;

/**
 * Convert a Convex string user ID to a deterministic numeric UID for Agora.
 * Agora prefers numeric UIDs (32-bit unsigned integer).
 * Uses a simple hash to convert the string to a positive integer.
 */
export function stringToNumericUid(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32-bit integer
    }
    // Ensure positive and non-zero (Agora UID 0 means auto-assign)
    return Math.abs(hash) || 1;
}
