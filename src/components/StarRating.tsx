import { useState } from 'react';

interface StarRatingProps {
    rating: number;
    onChange: (rating: number) => void;
}

export function StarRating({ rating, onChange }: StarRatingProps) {
    const [hoverRating, setHoverRating] = useState<number | null>(null);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>, starIndex: number) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const isHalf = x < rect.width / 2;
        setHoverRating(starIndex + (isHalf ? 0.5 : 1));
    };

    const handleMouseLeave = () => {
        setHoverRating(null);
    };

    const handleClick = (starIndex: number, e: React.MouseEvent) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const isHalf = x < rect.width / 2;
        onChange(starIndex + (isHalf ? 0.5 : 1));
    };

    const displayRating = hoverRating !== null ? hoverRating : rating;

    return (
        <div className="star-rating" onMouseLeave={handleMouseLeave}>
            {[0, 1, 2, 3, 4].map((index) => {
                const isFull = displayRating >= index + 1;
                const isHalf = displayRating >= index + 0.5 && !isFull;

                return (
                    <div
                        key={index}
                        className="star-container"
                        onMouseMove={(e) => handleMouseMove(e, index)}
                        onClick={(e) => handleClick(index, e)}
                        style={{ position: 'relative', width: '1em', height: '1.2em' }}
                    >
                        {/* Empty Star (Background) */}
                        <span style={{ position: 'absolute', top: 0, left: 0 }}>☆</span>

                        {/* Half Star */}
                        {isHalf && (
                            <span className="star-active" style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '50%',
                                overflow: 'hidden'
                            }}>
                                ★
                            </span>
                        )}

                        {/* Full Star */}
                        {isFull && (
                            <span className="star-active" style={{
                                position: 'absolute',
                                top: 0,
                                left: 0
                            }}>
                                ★
                            </span>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
