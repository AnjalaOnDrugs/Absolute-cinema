import { useEffect, useState } from 'react';

interface ActionNotificationProps {
    message: string | null;
    isVisible: boolean;
    profilePicture?: string;
    displayName?: string;
    isPause?: boolean;
}

export function ActionNotification({
    message,
    isVisible,
    profilePicture,
    displayName,
    isPause = false
}: ActionNotificationProps) {
    const [show, setShow] = useState(false);
    const [currentMessage, setCurrentMessage] = useState<string | null>(null);

    useEffect(() => {
        if (isVisible && message) {
            setCurrentMessage(message);
            setShow(true);

            // For pause, don't auto-hide. For other actions, hide after 4 seconds
            if (!isPause) {
                const timer = setTimeout(() => {
                    setShow(false);
                }, 4000);

                return () => clearTimeout(timer);
            }
        } else if (!isVisible && isPause) {
            // When isPause notification becomes invisible (video resumed), hide it
            setShow(false);
        }
    }, [isVisible, message, isPause]);

    if (!show || !currentMessage) return null;

    const initial = displayName?.charAt(0).toUpperCase() || '?';

    return (
        <div className="action-notification">
            <div className="action-notification-avatar">
                {profilePicture ? (
                    <img
                        src={profilePicture}
                        alt={displayName || 'User'}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                    />
                ) : (
                    <span className="action-notification-initial">{initial}</span>
                )}
            </div>
            <span className="action-notification-message">{currentMessage}</span>
        </div>
    );
}
