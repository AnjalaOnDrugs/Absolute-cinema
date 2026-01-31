// Room types
export interface Room {
    _id: string;
    name: string;
    movieTitle: string;
    movieFileName: string;
    adminId: string;
    adminName?: string;
    isPublic: boolean;
    everyoneCanControl: boolean;
    createdAt: number;
    memberCount?: number;
}

export interface RoomMember {
    _id: string;
    displayName: string;
    username: string;
    isOnline: boolean;
    isReady: boolean;
    isAdmin: boolean;
    joinedAt: number;
}

export interface SyncState {
    _id: string;
    roomId: string;
    isPlaying: boolean;
    currentTime: number;
    playbackRate: number;
    lastUpdatedBy: string;
    lastUpdatedAt: number;
    lastUpdaterName?: string;
}

export interface User {
    _id: string;
    username: string;
    email: string;
    displayName: string;
    isOnline: boolean;
    currentRoomId?: string;
}

export interface TMDBMovie {
    id: number;
    title: string;
    overview: string;
    poster_path: string;
    release_date: string;
    vote_average: number;
}
