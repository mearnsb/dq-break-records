import React, { useState } from 'react';
import { DataExplorer } from '../components/DataExplorer';
import LoadingSpinner from '../components/shared/LoadingSpinner';

interface Props {
    onLoad?: () => void;
}

const TableView: React.FC<Props> = ({ onLoad }) => {
    const [isLoading, setIsLoading] = useState(true);

    return (
        <div className="container mx-auto p-4">
            {isLoading && <LoadingSpinner />}
            <DataExplorer onLoad={() => {
                setIsLoading(false);
                onLoad?.();
            }} />
        </div>
    );
};

export default TableView;