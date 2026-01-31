import { useState, useEffect } from 'react';
import { srtToVtt } from '../lib/subtitleUtils';
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';

interface SubtitleModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubtitleLoaded: (vttContent: string, label: string) => void;
    movieTitle: string;
    tmdbId?: number;
}

export function SubtitleModal({ isOpen, onClose, onSubtitleLoaded, movieTitle, tmdbId }: SubtitleModalProps) {
    const [searchQuery, setSearchQuery] = useState(movieTitle);
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'search' | 'local'>('search');

    const searchSubtitlesAction = useAction(api.subtitles.searchSubtitles);
    const getDownloadLinkAction = useAction(api.subtitles.getDownloadLink);
    const fetchSubtitleContentAction = useAction(api.subtitles.fetchSubtitleContent);

    useEffect(() => {
        if (isOpen && activeTab === 'search' && searchResults.length === 0 && searchQuery) {
            handleSearch();
        }
    }, [isOpen]);

    const handleSearch = async () => {
        if (!searchQuery) return;
        setIsLoading(true);
        try {
            const results = await searchSubtitlesAction({
                query: searchQuery,
                languages: 'en',
                tmdbId: tmdbId
            });
            setSearchResults(results.data);
        } catch (err) {
            console.error('Search failed', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDownload = async (fileId: number, fileName: string) => {
        setIsLoading(true);
        try {
            const { link } = await getDownloadLinkAction({ fileId });

            // Fetch content through Convex action to avoid CORS issues
            const srtContent = await fetchSubtitleContentAction({ url: link });
            const vttContent = srtToVtt(srtContent);
            onSubtitleLoaded(vttContent, fileName);
            onClose();
        } catch (err: any) {
            console.error('Download failed', err);
            alert('Failed to download subtitle. ' + (err.message || ''));
        } finally {
            setIsLoading(false);
        }
    };

    const handleLocalFile = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{
                    name: 'Subtitles',
                    extensions: ['srt', 'vtt']
                }]
            });

            if (selected) {
                const filePath = typeof selected === 'string' ? selected : (selected as any).path;
                const content = await readTextFile(filePath);

                let vttContent = content;
                if (filePath.toLowerCase().endsWith('.srt')) {
                    vttContent = srtToVtt(content);
                }

                const fileName = filePath.split(/[\\/]/).pop() || 'Local Subtitle';
                onSubtitleLoaded(vttContent, fileName);
                onClose();
            }
        } catch (err) {
            console.error('Local file load failed', err);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal card-glass" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%' }}>
                <div className="modal-header">
                    <h2 className="modal-title">Subtitles</h2>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>

                <div className="subtitle-tabs" style={{
                    display: 'flex',
                    gap: '10px',
                    marginBottom: '24px',
                    padding: '4px',
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-md)'
                }}>
                    <button
                        className={`btn ${activeTab === 'search' ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setActiveTab('search')}
                        style={{ flex: 1, padding: '8px' }}
                    >
                        🔍 Search Online
                    </button>
                    <button
                        className={`btn ${activeTab === 'local' ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setActiveTab('local')}
                        style={{ flex: 1, padding: '8px' }}
                    >
                        📁 Local File
                    </button>
                </div>

                <div className="modal-body">
                    {activeTab === 'search' ? (
                        <>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <input
                                    className="input"
                                    style={{ flex: 1 }}
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder="Search for subtitles..."
                                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                                />
                                <button className="btn btn-primary" onClick={handleSearch} disabled={isLoading}>
                                    {isLoading ? '...' : 'Search'}
                                </button>
                            </div>

                            <div className="search-results custom-scrollbar" style={{
                                maxHeight: '350px',
                                overflowY: 'auto',
                                marginTop: '16px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px'
                            }}>
                                {searchResults.length > 0 ? (
                                    searchResults.map(result => (
                                        <div key={result.id} className="user-item" style={{ cursor: 'default', background: 'var(--bg-card)' }}>
                                            <div className="user-item-info">
                                                <div className="user-item-name" style={{ fontSize: '0.9rem' }}>{result.attributes.release}</div>
                                                <div className="user-item-status">
                                                    🌍 {result.attributes.language} • 📥 {result.attributes.download_count} downloads
                                                </div>
                                            </div>
                                            <button
                                                className="btn btn-secondary"
                                                style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                                onClick={() => handleDownload(result.attributes.files[0].file_id, result.attributes.release)}
                                                disabled={isLoading}
                                            >
                                                Apply
                                            </button>
                                        </div>
                                    ))
                                ) : (
                                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                        {isLoading ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                                                <div className="spinner" />
                                                <span>Searching OpenSubtitles...</span>
                                            </div>
                                        ) : 'No subtitles found. Try adjusting your search.'}
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="empty-state" style={{ padding: '40px' }}>
                            <div className="empty-state-icon">📄</div>
                            <p className="empty-state-text">Select a .srt or .vtt file from your computer.</p>
                            <button className="btn btn-primary" style={{ marginTop: '24px' }} onClick={handleLocalFile}>
                                Choose Subtitle File
                            </button>
                        </div>
                    )}
                </div>

                <div style={{ marginTop: '20px', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                    Powered by OpenSubtitles.com
                </div>
            </div>
        </div>
    );
}
