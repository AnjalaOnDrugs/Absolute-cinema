import re
import sys

with open('src/components/VideoPlayer.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# Add imports for ReactPlayer and useImperativeHandle
if "import ReactPlayer from 'react-player';" not in code:
    code = code.replace("import { forwardRef, useEffect, useRef, useState, useCallback } from 'react';", 
                        "import { forwardRef, useEffect, useRef, useState, useCallback, useImperativeHandle } from 'react';\nimport ReactPlayer from 'react-player';")

if "forwardRef<HTMLVideoElement," in code:
    code = code.replace("export const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(({", 
                        "export const VideoPlayer = forwardRef<any, VideoPlayerProps>(({")

# Now inject the ref handling logic
ref_replacement = """    const internalVideoRef = (ref as React.RefObject<HTMLVideoElement>);"""

new_ref_handling = """    const isYoutube = src ? /^(https?:\\/\\/)?(www\\.)?(youtube\\.com|youtu\\.?be)\\/.+$/.test(src) : false;
    const htmlVideoRef = useRef<HTMLVideoElement>(null);
    const reactPlayerRef = useRef<any>(null);
    
    useImperativeHandle(ref, () => ({
        get currentTime() {
            if (isYoutube && reactPlayerRef.current) return reactPlayerRef.current.getCurrentTime();
            if (htmlVideoRef.current) return htmlVideoRef.current.currentTime;
            return currentTime;
        },
        set currentTime(time: number) {
            if (isYoutube && reactPlayerRef.current) {
                reactPlayerRef.current.seekTo(time, 'seconds');
                setCurrentTime(time);
            } else if (htmlVideoRef.current) {
                htmlVideoRef.current.currentTime = time;
                setCurrentTime(time);
            }
        },
        get paused() {
            if (isYoutube) return !isPlaying;
            if (htmlVideoRef.current) return htmlVideoRef.current.paused;
            return true;
        },
        get playbackRate() {
            if (isYoutube && reactPlayerRef.current) return reactPlayerRef.current.getInternalPlayer()?.getPlaybackRate() || 1;
            if (htmlVideoRef.current) return htmlVideoRef.current.playbackRate;
            return 1;
        },
        set playbackRate(rate: number) {
            if (isYoutube && reactPlayerRef.current) {
                const internal = reactPlayerRef.current.getInternalPlayer();
                if (internal && internal.setPlaybackRate) {
                    internal.setPlaybackRate(rate);
                }
            } else if (htmlVideoRef.current) {
                htmlVideoRef.current.playbackRate = rate;
            }
        },
        play: async () => {
            if (isYoutube) {
                setIsPlaying(true);
                if (onPlay) onPlay();
            } else if (htmlVideoRef.current) {
                await htmlVideoRef.current.play();
            }
        },
        pause: () => {
            if (isYoutube) {
                setIsPlaying(false);
                if (onPause) onPause();
            } else if (htmlVideoRef.current) {
                htmlVideoRef.current.pause();
            }
        }
    }));
    
    // Fallback for native DOM elements that are queried internally within VideoPlayer
    const internalVideoRef = htmlVideoRef;"""

if "const internalVideoRef =" in code and "isYoutube" not in code:
    code = code.replace(ref_replacement, new_ref_handling)

# Replace <video> render with ReactPlayer render
video_render = """            <video
                ref={ref}
                src={src || undefined}
                className="custom-player-video"
                onClick={togglePlay}
                poster={getImageUrl(poster)}
                playsInline
            />"""

new_video_render = """            {isYoutube ? (
                <div className="custom-player-video" onClick={togglePlay}>
                    <div style={{ pointerEvents: 'none', width: '100%', height: '100%' }}>
                        <ReactPlayer
                            ref={reactPlayerRef}
                            url={src || undefined}
                            width="100%"
                            height="100%"
                            playing={isPlaying}
                            volume={isMuted ? 0 : volume}
                            onProgress={({ playedSeconds }) => {
                                setCurrentTime(playedSeconds);
                                if (onTimeUpdate) onTimeUpdate();
                            }}
                            onDuration={(d) => setDuration(d)}
                            onPlay={() => {
                                setIsPlaying(true);
                                if (onPlay) onPlay();
                            }}
                            onPause={() => {
                                setIsPlaying(false);
                                if (onPause) onPause();
                            }}
                            onSeek={() => {
                                if (onSeeked) onSeeked();
                            }}
                            config={{
                                youtube: {
                                    playerVars: {
                                        controls: 0,
                                        disablekb: 1,
                                        fs: 0,
                                        modestbranding: 1,
                                        rel: 0,
                                        showinfo: 0,
                                        iv_load_policy: 3
                                    }
                                }
                            }}
                        />
                    </div>
                </div>
            ) : (
                <video
                    ref={htmlVideoRef}
                    src={src || undefined}
                    className="custom-player-video"
                    onClick={togglePlay}
                    poster={getImageUrl(poster)}
                    playsInline
                />
            )}"""

if "ref={ref}" in code and "isYoutube ?" not in code:
    code = code.replace(video_render, new_video_render)

# Overwrite some button logic to avoid errors:
toggle_play_func = """    const togglePlay = () => {
        if (internalVideoRef?.current) {
            if (internalVideoRef.current.paused) {
                internalVideoRef.current.play();
            } else {
                internalVideoRef.current.pause();
            }
        }
    };"""

new_toggle_play_func = """    const togglePlay = () => {
        if (isYoutube) {
            setIsPlaying((prev) => {
                const newPlaying = !prev;
                if (newPlaying && onPlay) onPlay();
                if (!newPlaying && onPause) onPause();
                return newPlaying;
            });
        } else if (internalVideoRef?.current) {
            if (internalVideoRef.current.paused) {
                internalVideoRef.current.play();
            } else {
                internalVideoRef.current.pause();
            }
        }
    };"""
code = code.replace(toggle_play_func, new_toggle_play_func)

seek_func = """    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const time = parseFloat(e.target.value);
        if (internalVideoRef?.current) {
            internalVideoRef.current.currentTime = time;
            setCurrentTime(time);
        }
    };"""

new_seek_func = """    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const time = parseFloat(e.target.value);
        if (isYoutube && reactPlayerRef.current) {
            reactPlayerRef.current.seekTo(time, 'seconds');
            setCurrentTime(time);
            if (onSeeked) onSeeked();
        } else if (internalVideoRef?.current) {
            internalVideoRef.current.currentTime = time;
            setCurrentTime(time);
        }
    };"""
code = code.replace(seek_func, new_seek_func)

mute_toggle = """    const toggleMute = () => {
        if (internalVideoRef?.current) {
            internalVideoRef.current.muted = !internalVideoRef.current.muted;
        }
    };"""

new_mute_toggle = """    const toggleMute = () => {
        if (isYoutube) {
            setIsMuted(!isMuted);
        } else if (internalVideoRef?.current) {
            internalVideoRef.current.muted = !internalVideoRef.current.muted;
            setIsMuted(internalVideoRef.current.muted);
        }
    };"""
code = code.replace(mute_toggle, new_mute_toggle)

# Prevent errors on HTMLVideo listeners when Youtube is active
code = code.replace("video.addEventListener('timeupdate', updateState);", 
                    "if (isYoutube) return;\n        video.addEventListener('timeupdate', updateState);")

# Update standard DOM listeners to emit onPlay/onPause/onSeeked if provided
code = code.replace("video.addEventListener('play', updateState);", 
                    "video.addEventListener('play', () => { updateState(); if (onPlay) onPlay(); });")
code = code.replace("video.addEventListener('pause', updateState);", 
                    "video.addEventListener('pause', () => { updateState(); if (onPause) onPause(); });")
code = code.replace("video.addEventListener('error', handleError);",
                    "video.addEventListener('error', handleError);\n        video.addEventListener('seeked', () => { if (onSeeked) onSeeked(); });")

with open('src/components/VideoPlayer.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("VideoPlayer updated successfully!")
