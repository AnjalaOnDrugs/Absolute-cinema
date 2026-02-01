import React from 'react';

interface ConfirmationModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    icon?: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel: () => void;
    isDanger?: boolean;
}

export function ConfirmationModal({
    isOpen,
    title,
    message,
    icon,
    confirmText = "Confirm",
    cancelText = "Cancel",
    onConfirm,
    onCancel,
    isDanger = false
}: ConfirmationModalProps) {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" style={{ zIndex: 3000 }}>
            <div className="modal" style={{ maxWidth: '400px', textAlign: 'center' }}>
                {icon && (
                    <img
                        src={icon}
                        alt=""
                        style={{ height: '48px', marginBottom: '16px', filter: 'brightness(0) invert(1)' }}
                    />
                )}
                <h2 className="modal-title" style={{ marginBottom: '12px' }}>{title}</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
                    {message}
                </p>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                    <button
                        className="btn btn-ghost"
                        onClick={onCancel}
                        style={{ padding: '10px 20px' }}
                    >
                        {cancelText}
                    </button>
                    <button
                        className={`btn ${isDanger ? 'btn-danger' : 'btn-primary'}`}
                        onClick={onConfirm}
                        style={{ padding: '10px 24px' }}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
