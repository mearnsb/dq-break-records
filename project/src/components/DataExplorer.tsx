import React, { useEffect, useState } from 'react';
import { Disclosure } from '@headlessui/react';
import { ChevronUpIcon } from '@heroicons/react/20/solid';
import LoadingSpinner from './shared/LoadingSpinner';

interface Dataset {
    dataset: string;
    run_id: string;
    linkid: string;
}

// API Configuration - Use proxied endpoints
const API_CONFIG = {
    endpoints: {
        test: '/api/test',
        datasets: '/api/datasets'
    },
    headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    }
};

// Add new interface for date range
interface DateRange {
    days: number;
    label: string;
}

// Add date range options
const DATE_RANGES: DateRange[] = [
    { days: 1, label: 'Last 24 hours' },
    { days: 7, label: 'Last 7 days' },
    { days: 30, label: 'Last 30 days' }
];

// Add new interfaces
interface ParsedData {
    dataset: string;
    run_id: string;
    rule_nm: string;
    [key: string]: string;  // For dynamically parsed columns
}

interface SqlDebug {
    listQuery: string;
    parseQuery: string;
}

interface PaginationState {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
}

interface Props {
    onLoad?: () => void;
}

export const DataExplorer: React.FC<Props> = ({ onLoad }) => {
    const [datasets, setDatasets] = useState<Dataset[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedDataset, setSelectedDataset] = useState<string>('');
    const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'failed'>('connecting');
    const [debugInfo, setDebugInfo] = useState<string>('Initializing...');
    const [selectedDays, setSelectedDays] = useState<number>(1);  // Default to 1 day
    const [parsedData, setParsedData] = useState<ParsedData[]>([]);
    const [parsedColumns, setParsedColumns] = useState<string[]>([]);
    const [sqlDebug, setSqlDebug] = useState<SqlDebug>({ listQuery: '', parseQuery: '' });
    const [pagination, setPagination] = useState<PaginationState>({
        page: 1,
        pageSize: 100,
        totalCount: 0,
        totalPages: 0
    });

    const checkConnection = async () => {
        const url = API_CONFIG.endpoints.test;  // Using proxied endpoint
        console.log('🔍 Making request to:', url);
        
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: API_CONFIG.headers
            });

            console.log('🔍 Response received:', {
                status: response.status,
                ok: response.ok,
                type: response.type
            });

            if (response.ok) {
                const data = await response.json();
                console.log('✅ Server response:', data);
                setDebugInfo('✅ Server connection successful');
                setConnectionStatus('connected');
                return true;
            }
            
            throw new Error(`Server responded with status: ${response.status}`);
        } catch (error) {
            console.error('❌ Connection error:', {
                message: error.message,
                error
            });
            setDebugInfo(`❌ Connection error: ${error.message}`);
            setConnectionStatus('failed');
            return false;
        }
    };

    const fetchDatasets = async () => {
        const url = `${API_CONFIG.endpoints.datasets}?days=${selectedDays}`;
        console.log('📥 Making request to:', url);
        
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: API_CONFIG.headers
            });

            console.log('📥 Response received:', {
                status: response.status,
                ok: response.ok,
                type: response.type
            });

            if (!response.ok) {
                throw new Error(`Server responded with status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('📦 Data received:', {
                length: data.length,
                sample: data.slice(0, 2)
            });

            return data;
        } catch (error) {
            console.error('❌ Fetch error:', {
                message: error.message,
                error
            });
            throw error;
        }
    };

    const loadSelectedDataset = async (page: number = 1) => {
        if (!selectedDataset) return;
        
        try {
            setLoading(true);
            const url = `${API_CONFIG.endpoints.datasets}/parse?dataset=${selectedDataset}&days=${selectedDays}&page=${page}&pageSize=${pagination.pageSize}`;
            const response = await fetch(url);
            const data = await response.json();
            
            setParsedData(data.rows);
            setParsedColumns(data.columns);
            setPagination(data.pagination);
            setSqlDebug({
                listQuery: data.listQuery,
                parseQuery: data.parseQuery
            });
        } catch (error) {
            setError(`Failed to load parsed data: ${error.message}`);
        } finally {
            setLoading(false);
            onLoad?.();
        }
    };

    useEffect(() => {
        console.log('🚀 Component mounted');
        let mounted = true;
        const controller = new AbortController();

        const loadData = async () => {
            if (!mounted) return;
            console.log('📂 Starting data load...');
            
            try {
                setLoading(true);
                setDebugInfo('🚀 Starting data load...');

                // Fetch data with connection check in a single operation
                const response = await fetch(API_CONFIG.endpoints.datasets + `?days=${selectedDays}`, {
                    signal: controller.signal,
                    headers: API_CONFIG.headers
                });

                if (!response.ok) {
                    throw new Error(`Server responded with status: ${response.status}`);
                }

                const fetchedDatasets = await response.json();
                
                if (!mounted) return;

                setConnectionStatus('connected');
                setDebugInfo('✅ Server connection successful');

                if (!fetchedDatasets || fetchedDatasets.length === 0) {
                    setDebugInfo('⚠️ No datasets found');
                    setError('No datasets found');
                } else {
                    const uniqueDatasets = Array.from(new Set(fetchedDatasets.map(d => d.dataset)));
                    setDebugInfo(`✅ Found ${uniqueDatasets.length} unique datasets`);
                    setDatasets(fetchedDatasets);
                }
            } catch (error) {
                if (!mounted) return;
                console.error('❌ Load error:', error);
                setDebugInfo(`❌ Error: ${error.message}`);
                setError(error.message);
                setConnectionStatus('failed');
            } finally {
                if (mounted) {
                    setLoading(false);
                }
                onLoad?.();
            }
        };

        loadData();
        return () => { 
            console.log('🧹 Component cleanup');
            mounted = false;
            controller.abort();
        };
    }, [selectedDays, onLoad]);

    // Debug display of current state
    const debugState = {
        datasetsLength: datasets.length,
        uniqueDatasets: Array.from(new Set(datasets.map(d => d.dataset))).length,
        loading,
        connectionStatus,
        error
    };

    return (
        <div className="p-6 space-y-8">
            {/* Filter Controls Section */}
            <Disclosure defaultOpen={true}>
                {({ open }) => (
                    <section className="border rounded-lg p-6 bg-white shadow">
                        <Disclosure.Button className="flex w-full justify-between items-center">
                            <h2 className="text-xl font-bold">Filter Controls</h2>
                            <ChevronUpIcon
                                className={`${open ? 'transform rotate-180' : ''} w-5 h-5`}
                            />
                        </Disclosure.Button>
                        <Disclosure.Panel>
                            <div className="mt-4 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {/* Dataset Selection - Moved to first position */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Dataset
                                        </label>
                                        <select 
                                            value={selectedDataset}
                                            onChange={(e) => setSelectedDataset(e.target.value)}
                                            className="w-full border border-gray-300 rounded-md shadow-sm p-2"
                                            disabled={loading}
                                        >
                                            <option value="">Choose a dataset ({datasets.length} available)</option>
                                            {Array.from(new Set(datasets.map(d => d.dataset))).map((dataset) => (
                                                <option key={dataset} value={dataset}>
                                                    {dataset}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Time Range Selection - Moved to second position */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Time Range
                                        </label>
                                        <select
                                            value={selectedDays}
                                            onChange={(e) => setSelectedDays(Number(e.target.value))}
                                            className="w-full border border-gray-300 rounded-md shadow-sm p-2"
                                            disabled={loading}
                                        >
                                            {DATE_RANGES.map(range => (
                                                <option key={range.days} value={range.days}>
                                                    {range.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Load Button - Stays in third position */}
                                    <div className="flex items-end">
                                        <button
                                            onClick={() => loadSelectedDataset()}
                                            disabled={!selectedDataset || loading}
                                            className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:bg-gray-300"
                                        >
                                            Load Dataset Details
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </Disclosure.Panel>
                    </section>
                )}
            </Disclosure>

            {/* Available Datasets List Section */}
            <Disclosure defaultOpen={true}>
                {({ open }) => (
                    <section className="border rounded-lg p-6 bg-white shadow">
                        <Disclosure.Button className="flex w-full justify-between items-center">
                            <h2 className="text-xl font-bold">Available Datasets</h2>
                            <ChevronUpIcon
                                className={`${open ? 'transform rotate-180' : ''} w-5 h-5`}
                            />
                        </Disclosure.Button>
                        <Disclosure.Panel>
                            <div className="overflow-x-auto mt-4">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dataset</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Run ID</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Link ID</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {datasets.map((dataset, idx) => (
                                            <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{dataset.dataset}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{dataset.run_id}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{dataset.linkid}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Disclosure.Panel>
                    </section>
                )}
            </Disclosure>

            {/* Records Section - Visible after loading dataset details */}
            {parsedData.length > 0 && (
                <Disclosure defaultOpen={true}>
                    {({ open }) => (
                        <section className="border rounded-lg p-6 bg-white shadow">
                            <Disclosure.Button className="flex w-full justify-between items-center">
                                <h2 className="text-xl font-bold">Dataset Records: {selectedDataset}</h2>
                                <ChevronUpIcon
                                    className={`${open ? 'transform rotate-180' : ''} w-5 h-5`}
                                />
                            </Disclosure.Button>
                            <Disclosure.Panel>
                                <div className="overflow-x-auto mt-4">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dataset</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Run ID</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rule Name</th>
                                                {parsedColumns.map((col) => (
                                                    <th key={col} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                        {col}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {parsedData.map((row, idx) => (
                                                <tr key={idx} className="hover:bg-gray-50">
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.dataset}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.run_id}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.rule_nm}</td>
                                                    {parsedColumns.map((col) => (
                                                        <td key={col} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                            {row[col]}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    
                                    {/* Pagination Controls */}
                                    <div className="mt-4 flex items-center justify-between">
                                        <div className="text-sm text-gray-700">
                                            Showing {((pagination.page - 1) * pagination.pageSize) + 1} to {Math.min(pagination.page * pagination.pageSize, pagination.totalCount)} of {pagination.totalCount} results
                                        </div>
                                        <div className="flex space-x-2">
                                            <button
                                                onClick={() => loadSelectedDataset(pagination.page - 1)}
                                                disabled={pagination.page === 1 || loading}
                                                className="px-3 py-1 border rounded disabled:opacity-50"
                                            >
                                                Previous
                                            </button>
                                            <span className="px-3 py-1">
                                                Page {pagination.page} of {pagination.totalPages}
                                            </span>
                                            <button
                                                onClick={() => loadSelectedDataset(pagination.page + 1)}
                                                disabled={pagination.page === pagination.totalPages || loading}
                                                className="px-3 py-1 border rounded disabled:opacity-50"
                                            >
                                                Next
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </Disclosure.Panel>
                        </section>
                    )}
                </Disclosure>
            )}

            {/* Debug Section */}
            <Disclosure>
                {({ open }) => (
                    <section className="border rounded-lg p-6 bg-white shadow">
                        <Disclosure.Button className="flex w-full justify-between items-center">
                            <h2 className="text-xl font-bold">Debug Information</h2>
                            <ChevronUpIcon
                                className={`${open ? 'transform rotate-180' : ''} w-5 h-5`}
                            />
                        </Disclosure.Button>
                        <Disclosure.Panel>
                            {/* Existing Debug Content */}
                            <div className="space-y-4">
                                <div>
                                    <h3 className="font-medium mb-2">List Query</h3>
                                    <pre className="text-xs bg-gray-100 p-4 rounded overflow-auto whitespace-pre-wrap">
                                        {sqlDebug.listQuery || 'No query available'}
                                    </pre>
                                </div>
                                <div>
                                    <h3 className="font-medium mb-2">Parse Query</h3>
                                    <pre className="text-xs bg-gray-100 p-4 rounded overflow-auto whitespace-pre-wrap">
                                        {sqlDebug.parseQuery || 'No query available'}
                                    </pre>
                                </div>
                                <div>
                                    <h3 className="font-medium mb-2">Component State</h3>
                                    <pre className="text-xs bg-gray-100 p-4 rounded overflow-auto">
                                        {JSON.stringify({
                                            ...debugState,
                                            pagination,
                                            selectedDataset,
                                            selectedDays,
                                            parsedColumnsCount: parsedColumns.length
                                        }, null, 2)}
                                    </pre>
                                </div>

                                {/* Connection Status moved to bottom */}
                                <div className="p-4 bg-gray-100 rounded">
                                    <h3 className="font-medium mb-2">Connection Status</h3>
                                    <div className="flex items-center space-x-4">
                                        <div className={`h-3 w-3 rounded-full ${
                                            connectionStatus === 'connected' ? 'bg-green-500' :
                                            connectionStatus === 'connecting' ? 'bg-yellow-500' :
                                            'bg-red-500'
                                        }`} />
                                        <span className="font-medium">
                                            {connectionStatus === 'connected' ? 'Connected' :
                                             connectionStatus === 'connecting' ? 'Connecting...' :
                                             'Connection Failed'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </Disclosure.Panel>
                    </section>
                )}
            </Disclosure>

            {/* Loading and Error States */}
            {loading && <LoadingSpinner />}

            {error && (
                <div className="fixed bottom-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                    {error}
                </div>
            )}
        </div>
    );
};

export default DataExplorer; 