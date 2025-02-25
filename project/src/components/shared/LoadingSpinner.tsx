import React from 'react';

export function LoadingSpinner() {
    return (
        <div className="fixed top-16 inset-x-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="relative">
                <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-white"></div>
                <div className="mt-4 text-white text-center font-semibold">Loading...</div>
            </div>
        </div>
    );
}

export default LoadingSpinner; 