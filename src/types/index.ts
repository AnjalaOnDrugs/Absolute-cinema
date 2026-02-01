// Room types
export interface Room {
    _id: string;
    name: string;
    movieTitle: string;
    movieFileName: string;
    moviePoster?: string;
    adminId: string;
    adminName?: string;
    isPublic: boolean;
    everyoneCanControl: boolean;
    createdAt: number;
    memberCount?: number;
    members?: { displayName: string; profilePicture?: string }[];
    isPlaying?: boolean;
}

export interface RoomMember {
    _id: string;
    userId: string;
    displayName: string;
    username: string;
    profilePicture?: string;
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
    lastUpdaterProfilePicture?: string;
    lastAction?: 'play' | 'pause' | 'seek';
}

export interface User {
    _id: string;
    username: string;
    email: string;
    displayName: string;
    profilePicture?: string;
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
