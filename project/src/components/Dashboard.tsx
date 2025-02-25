import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
    TimeScale,
} from 'chart.js';
import 'chart.js/auto';
import { Chart } from 'chart.js/auto';
import { Disclosure } from '@headlessui/react';
import { ChevronUpIcon } from '@heroicons/react/20/solid';
import LoadingSpinner from './shared/LoadingSpinner';

// Register ChartJS components
ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
    TimeScale
);

interface GlobalHealth {
    pass_fail_exception: string;
    cnt: number;
    ratio: number;
}

interface TimeSeries {
    pass_fail_exception: string;
    cnt: number;
    run_id: string;
}

interface DimensionData {
    dimension: string;
    pass_fail_exception: string;
    cnt: number;
}

interface BusinessUnitData {
    biz_unit: string;
    pass_fail_exception: string;
    cnt: number;
}

interface QueryTimings {
    globalHealth: number;
    timeSeries: number;
    dimensions: number;
    businessUnits: number;
}

interface Props {
    onLoad?: () => void;
}

const DATE_RANGES = [
    { days: 2, label: 'Last 48 hours' },
    { days: 8, label: 'Last 7 days (+1)' },
    { days: 31, label: 'Last 30 days (+1)' }
];

const QUERIES = {
    baseCte: `WITH a AS (
    SELECT * FROM public.rule_output
    WHERE run_id::date >= NOW()::date - INTERVAL ':days day'
    AND run_id::date <= NOW()::date + INTERVAL '1 day'
),
b AS (
    SELECT * FROM public.dataset_scan 
    WHERE rc > 1
    AND run_id::date >= NOW()::date - INTERVAL ':days day'
),
c AS (
    SELECT * FROM public.owl_rule
),
e AS (
    SELECT * FROM public.dq_dimension
),
g AS (
    SELECT * FROM public.owl_catalog
),
h AS (
    SELECT * FROM public.business_unit_to_dataset
),
i AS (
    SELECT * FROM public.business_units
),
j AS (
    SELECT DISTINCT dataset, col_nm, col_semantic 
    FROM public.dataset_schema
    WHERE updated_at >= NOW() - INTERVAL ':days day'
),
f AS (
    SELECT
        a.dataset,
        a.rule_nm,
        a.score as rule_point,
        (CASE 
            WHEN a.score = 0 and (a.exception is null or a.exception = '') then 'PASSING' 
            WHEN length(a.exception) > 1 THEN 'EXCEPTION' 
            WHEN a.score > 0 THEN 'BREAKING' 
        END) as pass_fail_exception,
        COALESCE(e.dim_name, 'UNSPECIFIED') AS dim_name,
        i.name as businss_unit,
        a.run_id::date as run_date
    FROM a
    LEFT JOIN b ON a.dataset = b.dataset AND a.run_id::date = b.run_id::date
    INNER JOIN c ON a.dataset = c.dataset AND a.rule_nm = c.rule_nm
    LEFT JOIN e ON e.dim_id = c.dim_id
    INNER JOIN g ON g.dataset = a.dataset
    LEFT JOIN h ON h.dataset = g.dataset
    LEFT JOIN i ON i.id = h.id
    LEFT JOIN j ON a.dataset = j.dataset AND c.column_name = j.col_nm
)`,
    globalHealth: `WITH a AS (
    SELECT * FROM public.rule_output
    WHERE run_id BETWEEN (to_date('2024-07-18', 'yyyy-MM-dd') - INTERVAL '30 DAY') AND NOW()
),
-- ... rest of the query ...
select ( cast(count(*) as decimal) / (select count(*) from f)) as ratio from f group by pass_fail_exception`,
    
    healthOverTime: `-- Health Over Time Query
select count(*) as cnt, pass_fail_exception, run_id from f group by pass_fail_exception, run_id`,
    
    byDimension: `-- By Dimension Query
select dim_name as dimension, cnt, pass_fail_exception from t order by dimension asc`,
    
    byJob: `-- By Job Query
select businss_unit as biz_unit, cnt, pass_fail_exception from t order by biz_unit asc`
};

// Add this outside the component to persist across remounts
export const sharedMountRef = {
    hasFetched: false,
    lastFetchedDays: -1,
    isFetching: false
};

export const Dashboard: React.FC<Props> = ({ onLoad }) => {
    const [globalHealth, setGlobalHealth] = useState<GlobalHealth[]>([]);
    const [timeSeriesData, setTimeSeriesData] = useState<TimeSeries[]>([]);
    const [dimensionData, setDimensionData] = useState<DimensionData[]>([]);
    const [businessUnitData, setBusinessUnitData] = useState<BusinessUnitData[]>([]);
    const [selectedDays, setSelectedDays] = useState<number>(2);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [queryTimings, setQueryTimings] = useState<QueryTimings>({
        globalHealth: 0,
        timeSeries: 0,
        dimensions: 0,
        businessUnits: 0
    });

    // Add mounted ref
    const mountedRef = useRef(false);
    const currentDaysRef = useRef<number>(-1);
    const fetchingRef = useRef(false);

    // Add a new ref to track if we've already fetched during this mount cycle
    const mountFetchedRef = useRef(false);

    // Chart instances refs to handle cleanup
    const charts = useRef<{[key: string]: Chart | null}>({
        global: null,
        timeSeries: null,
        dimension: null,
        businessUnit: null
    });

    // Canvas refs
    const globalChartRef = useRef<HTMLCanvasElement>(null);
    const timeSeriesChartRef = useRef<HTMLCanvasElement>(null);
    const dimensionChartRef = useRef<HTMLCanvasElement>(null);
    const businessUnitChartRef = useRef<HTMLCanvasElement>(null);

    // Cleanup function for charts
    const destroyCharts = () => {
        Object.values(charts.current).forEach(chart => {
            if (chart) {
                chart.destroy();
            }
        });
        charts.current = {
            global: null,
            timeSeries: null,
            dimension: null,
            businessUnit: null
        };
    };

    // Common chart options
    const commonChartOptions = {
        plugins: {
            legend: {
                position: 'top' as const,
                align: 'center' as const,
                labels: {
                    usePointStyle: true,
                    pointStyle: 'circle',
                    boxWidth: 10,
                    padding: 20,
                    font: {
                        size: 12
                    }
                }
            },
            title: {
                display: false
            }
        }
    };

    const renderGlobalHealthChart = (data: GlobalHealth[]) => {
        const canvas = globalChartRef.current;
        if (!canvas) return;

        // Ensure old chart is destroyed
        if (charts.current.global) {
            charts.current.global.destroy();
            charts.current.global = null;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        charts.current.global = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: data.map(d => d.pass_fail_exception),
                datasets: [{
                    data: data.map(d => d.ratio * 100),
                    backgroundColor: [
                        '#4CAF50', // PASSING
                        '#f44336', // BREAKING
                        '#ff9800'  // EXCEPTION
                    ]
                }]
            },
            options: {
                ...commonChartOptions,
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    ...commonChartOptions.plugins
                }
            }
        });
    };

    const renderTimeSeriesChart = (data: TimeSeries[]) => {
        const canvas = timeSeriesChartRef.current;
        if (!canvas) return;

        if (charts.current.timeSeries) {
            charts.current.timeSeries.destroy();
            charts.current.timeSeries = null;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Sort dates in ascending order (oldest to newest)
        const sortedData = [...data].sort((a, b) => 
            new Date(a.run_id).getTime() - new Date(b.run_id).getTime()
        );

        const datasets = ['PASSING', 'BREAKING', 'EXCEPTION'].map(status => ({
            label: status,
            data: sortedData
                .filter(d => d.pass_fail_exception === status)
                .map(d => ({ 
                    x: new Date(d.run_id).toLocaleDateString(), 
                    y: d.cnt 
                })),
            borderColor: status === 'PASSING' ? '#4CAF50' : 
                        status === 'BREAKING' ? '#f44336' : '#ff9800',
            backgroundColor: status === 'PASSING' ? '#4CAF50' : 
                           status === 'BREAKING' ? '#f44336' : '#ff9800',
            fill: false,
            tension: 0.4,
            borderWidth: 2
        }));

        charts.current.timeSeries = new Chart(ctx, {
            type: 'line',
            data: { datasets },
            options: {
                ...commonChartOptions,
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'category',
                        title: {
                            display: true,
                            text: 'Date'
                        },
                        reverse: false
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Count'
                        }
                    }
                }
            }
        });
    };

    const renderDimensionChart = (data: DimensionData[]) => {
        if (!dimensionChartRef.current) return;
        const ctx = dimensionChartRef.current.getContext('2d');
        if (!ctx) return;

        if (charts.current.dimension) {
            charts.current.dimension.destroy();
        }

        // Group and aggregate data by dimension and status
        const dimensions = Array.from(new Set(data.map(d => d.dimension))).sort();
        const statuses = ['EXCEPTION', 'PASSING', 'BREAKING']; // Order matches the example
        
        const aggregatedData = dimensions.map(dim => {
            const counts = {} as Record<string, number>;
            statuses.forEach(status => {
                counts[status] = data
                    .filter(d => d.dimension === dim && d.pass_fail_exception === status)
                    .reduce((sum, d) => sum + d.cnt, 0);
            });
            return { dimension: dim, ...counts };
        });

        // Sort dimensions by total count
        const sortedDimensions = dimensions.sort((a, b) => {
            const aTotal = statuses.reduce((sum, status) => 
                sum + (data.find(d => d.dimension === a && d.pass_fail_exception === status)?.cnt || 0), 0);
            const bTotal = statuses.reduce((sum, status) => 
                sum + (data.find(d => d.dimension === b && d.pass_fail_exception === status)?.cnt || 0), 0);
            return bTotal - aTotal;
        });

        // Create datasets for each status
        const datasets = statuses.map(status => ({
            label: status,
            data: sortedDimensions.map(dim => 
                data.filter(d => d.dimension === dim && d.pass_fail_exception === status)
                    .reduce((sum, d) => sum + d.cnt, 0)
            ),
            backgroundColor: status === 'PASSING' ? '#4CAF50' : 
                           status === 'BREAKING' ? '#f44336' : '#ff9800',
        }));

        const chartOptions = {
            ...commonChartOptions,
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y' as const,
            scales: {
                x: {
                    stacked: true,
                    title: {
                        display: true,
                        text: 'Count'
                    }
                },
                y: {
                    stacked: true,
                    title: {
                        display: true,
                        text: 'Dimension'
                    }
                }
            }
        };

        charts.current.dimension = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sortedDimensions,
                datasets
            },
            options: {
                ...chartOptions,
                plugins: {
                    ...chartOptions.plugins
                }
            }
        });
    };

    const renderBusinessUnitChart = (data: BusinessUnitData[]) => {
        if (!businessUnitChartRef.current) return;
        const ctx = businessUnitChartRef.current.getContext('2d');
        if (!ctx) return;

        if (charts.current.businessUnit) {
            charts.current.businessUnit.destroy();
        }

        // Group and aggregate data by business unit and status
        const businessUnits = Array.from(new Set(data.map(d => d.biz_unit))).sort();
        const statuses = ['PASSING', 'BREAKING', 'EXCEPTION'];
        
        const aggregatedData = businessUnits.map(unit => {
            const counts = {} as Record<string, number>;
            statuses.forEach(status => {
                counts[status] = data
                    .filter(d => d.biz_unit === unit && d.pass_fail_exception === status)
                    .reduce((sum, d) => sum + d.cnt, 0);
            });
            return { unit, ...counts };
        });

        // Create datasets for each status
        const datasets = statuses.map(status => ({
            label: status,
            data: aggregatedData.map(d => d[status] || 0),
            backgroundColor: status === 'PASSING' ? '#4CAF50' : 
                           status === 'BREAKING' ? '#f44336' : '#ff9800'
        }));

        charts.current.businessUnit = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: businessUnits,
                datasets: datasets
            },
            options: {
                ...commonChartOptions,
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y' as const,
                scales: {
                    x: {
                        stacked: true,
                        title: {
                            display: true,
                            text: 'Count'
                        }
                    },
                    y: {
                        stacked: true,
                        title: {
                            display: true,
                            text: 'Business Unit'
                        }
                    }
                }
            }
        });
    };

    const fetchData = useCallback(async () => {
        // Skip if already fetching or if we have the data for these days
        if (sharedMountRef.isFetching || (sharedMountRef.hasFetched && sharedMountRef.lastFetchedDays === selectedDays)) {
            console.log('[Dashboard] Skipping fetch:', { 
                isFetching: sharedMountRef.isFetching,
                hasFetched: sharedMountRef.hasFetched,
                lastFetchedDays: sharedMountRef.lastFetchedDays,
                selectedDays
            });
            onLoad?.();
            return;
        }
        
        console.log('[Dashboard] Starting fetch:', {
            isFetching: sharedMountRef.isFetching,
            hasFetched: sharedMountRef.hasFetched,
            lastFetchedDays: sharedMountRef.lastFetchedDays,
            selectedDays
        });

        try {
            sharedMountRef.isFetching = true;
            setLoading(true);
            setError(null);
            destroyCharts();

            const response = await fetch(`/api/dashboard/health?days=${selectedDays}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            console.log('[Dashboard] Fetch completed successfully');

            // Update shared ref to track this fetch
            sharedMountRef.hasFetched = true;
            sharedMountRef.lastFetchedDays = selectedDays;

            // Update all state at once
            setGlobalHealth(data.globalHealth);
            setTimeSeriesData(data.timeSeries);
            setDimensionData(data.dimensions);
            setBusinessUnitData(data.businessUnits);
            if (data.queryTimings) {
                setQueryTimings(data.queryTimings);
            }

            // Render charts immediately after state updates
            if (globalChartRef.current) {
                renderGlobalHealthChart(data.globalHealth);
            }
            if (timeSeriesChartRef.current) {
                renderTimeSeriesChart(data.timeSeries);
            }
            if (dimensionChartRef.current) {
                renderDimensionChart(data.dimensions);
            }
            if (businessUnitChartRef.current) {
                renderBusinessUnitChart(data.businessUnits);
            }

        } catch (error) {
            console.error('[Dashboard] Fetch error:', error);
            if (error instanceof Error) {
                setError(error.message);
            } else {
                setError('An error occurred');
            }
        } finally {
            sharedMountRef.isFetching = false;
            setLoading(false);
            onLoad?.();
        }
    }, [selectedDays, onLoad]);

    // Effect for initialization
    useEffect(() => {
        fetchData();
        
        return () => {
            console.log('[Dashboard] Component cleanup/unmount');
            destroyCharts();
        };
    }, [fetchData]);

    // Reset shared ref when selectedDays changes
    useEffect(() => {
        if (sharedMountRef.lastFetchedDays !== selectedDays) {
            sharedMountRef.hasFetched = false;
            sharedMountRef.lastFetchedDays = -1;
        }
    }, [selectedDays]);

    // Separate the date range change handler
    const handleDateRangeChange = useCallback((newDays: number) => {
        console.log('[Dashboard] Date range change handler called:', {
            currentDays: currentDaysRef.current,
            newDays,
            selectedDays,
            timestamp: new Date().toISOString()
        });
        
        // Only update if the value is actually different
        if (newDays !== selectedDays) {
            console.log('[Dashboard] Updating selected days');
            setSelectedDays(newDays);
            setLoading(true);
            destroyCharts();
        } else {
            console.log('[Dashboard] Skipping update - days unchanged');
        }
    }, [selectedDays]);

    return (
        <div className="p-6 space-y-8">
            {/* Date Range Selector */}
            <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Time Range
                </label>
                <select
                    value={selectedDays}
                    onChange={(e) => handleDateRangeChange(Number(e.target.value))}
                    className="w-64 border border-gray-300 rounded-md shadow-sm p-2"
                    disabled={loading}
                >
                    {DATE_RANGES.map(range => (
                        <option key={range.days} value={range.days}>
                            {range.label}
                        </option>
                    ))}
                </select>
            </div>

            {/* Global Health Section */}
            <Disclosure defaultOpen={true}>
                {({ open }) => (
                    <section className="border rounded-lg p-6 bg-white shadow">
                        <Disclosure.Button className="flex w-full justify-between items-center">
                            <h2 className="text-xl font-bold">Global Health</h2>
                            <ChevronUpIcon
                                className={`${open ? 'transform rotate-180' : ''} w-5 h-5`}
                            />
                        </Disclosure.Button>
                        <Disclosure.Panel static>
                            <div className={`transition-all duration-200 ${open ? 'h-64' : 'h-0'} mt-4 mb-4 overflow-hidden`}>
                                <canvas ref={globalChartRef}></canvas>
                            </div>
                            <div className="overflow-x-auto mt-4">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ratio</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {globalHealth.map((item, i) => (
                                            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.pass_fail_exception}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{(item.ratio * 100).toFixed(2)}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Disclosure.Panel>
                    </section>
                )}
            </Disclosure>

            {/* Time Series Section */}
            <Disclosure defaultOpen={true}>
                {({ open }) => (
                    <section className="border rounded-lg p-6 bg-white shadow">
                        <Disclosure.Button className="flex w-full justify-between items-center">
                            <h2 className="text-xl font-bold">Health Over Time</h2>
                            <ChevronUpIcon
                                className={`${open ? 'transform rotate-180' : ''} w-5 h-5`}
                            />
                        </Disclosure.Button>
                        <Disclosure.Panel static>
                            <div className={`transition-all duration-200 ${open ? 'h-64' : 'h-0'} mt-4 mb-4 overflow-hidden`}>
                                <canvas ref={timeSeriesChartRef}></canvas>
                            </div>
                            <div className="overflow-x-auto mt-4">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Count</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {[...timeSeriesData]
                                            .sort((a, b) => new Date(b.run_id).getTime() - new Date(a.run_id).getTime())
                                            .map((item, i) => (
                                                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                        {new Date(item.run_id).toLocaleDateString()}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.pass_fail_exception}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.cnt}</td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                        </Disclosure.Panel>
                    </section>
                )}
            </Disclosure>

            {/* Dimension Section */}
            <Disclosure defaultOpen={true}>
                {({ open }) => (
                    <section className="border rounded-lg p-6 bg-white shadow">
                        <Disclosure.Button className="flex w-full justify-between items-center">
                            <h2 className="text-xl font-bold">By Dimension</h2>
                            <ChevronUpIcon
                                className={`${open ? 'transform rotate-180' : ''} w-5 h-5`}
                            />
                        </Disclosure.Button>
                        <Disclosure.Panel static>
                            <div className={`transition-all duration-200 ${open ? 'h-64' : 'h-0'} mt-4 mb-4 overflow-hidden`}>
                                <canvas ref={dimensionChartRef}></canvas>
                            </div>
                            <div className="overflow-x-auto mt-4">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dimension</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Passing</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Breaking</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Exception</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {Array.from(new Set(dimensionData.map(d => d.dimension))).map((dimension, i) => {
                                            const passing = dimensionData.find(d => d.dimension === dimension && d.pass_fail_exception === 'PASSING')?.cnt || 0;
                                            const breaking = dimensionData.find(d => d.dimension === dimension && d.pass_fail_exception === 'BREAKING')?.cnt || 0;
                                            const exception = dimensionData.find(d => d.dimension === dimension && d.pass_fail_exception === 'EXCEPTION')?.cnt || 0;
                                            const total = passing + breaking + exception;
                                            return (
                                                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{dimension}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">{passing}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">{breaking}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-orange-500">{exception}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{total}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </Disclosure.Panel>
                    </section>
                )}
            </Disclosure>

            {/* Business Unit Section */}
            <Disclosure defaultOpen={true}>
                {({ open }) => (
                    <section className="border rounded-lg p-6 bg-white shadow">
                        <Disclosure.Button className="flex w-full justify-between items-center">
                            <h2 className="text-xl font-bold">By Business Unit</h2>
                            <ChevronUpIcon
                                className={`${open ? 'transform rotate-180' : ''} w-5 h-5`}
                            />
                        </Disclosure.Button>
                        <Disclosure.Panel static>
                            <div className={`transition-all duration-200 ${open ? 'h-64' : 'h-0'} mt-4 mb-4 overflow-hidden`}>
                                <canvas ref={businessUnitChartRef}></canvas>
                            </div>
                            <div className="overflow-x-auto mt-4">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Business Unit</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Passing</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Breaking</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Exception</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {Array.from(new Set(businessUnitData.map(d => d.biz_unit)))
                                            .filter(unit => unit) // Filter out null/undefined units
                                            .sort()
                                            .map((unit, i) => {
                                                const passing = businessUnitData.find(d => d.biz_unit === unit && d.pass_fail_exception === 'PASSING')?.cnt || 0;
                                                const breaking = businessUnitData.find(d => d.biz_unit === unit && d.pass_fail_exception === 'BREAKING')?.cnt || 0;
                                                const exception = businessUnitData.find(d => d.biz_unit === unit && d.pass_fail_exception === 'EXCEPTION')?.cnt || 0;
                                                const total = passing + breaking + exception;
                                                return (
                                                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{unit}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">{passing}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">{breaking}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-orange-500">{exception}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{total}</td>
                                                    </tr>
                                                );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </Disclosure.Panel>
                    </section>
                )}
            </Disclosure>

            {/* Query Performance Section */}
            {Object.keys(queryTimings).length > 0 && (
                <Disclosure defaultOpen={true}>
                    {({ open }) => (
                        <section className="border rounded-lg p-6 bg-white shadow">
                            <Disclosure.Button className="flex w-full justify-between items-center">
                                <h2 className="text-xl font-bold">Query Performance</h2>
                                <ChevronUpIcon
                                    className={`${open ? 'transform rotate-180' : ''} w-5 h-5`}
                                />
                            </Disclosure.Button>
                            <Disclosure.Panel static>
                                <div className="overflow-x-auto mt-4">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Query</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Execution Time (seconds)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {Object.entries(queryTimings).map(([query, time]) => (
                                                <tr key={query} className="hover:bg-gray-50">
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                        {query.replace(/([A-Z])/g, ' $1').trim()}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                        {time.toFixed(2)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
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
                            <div className="space-y-6 mt-4">
                                {/* Base CTE Query */}
                                <div>
                                    <h3 className="text-lg font-semibold mb-2">Base CTE Query</h3>
                                    <p className="text-sm text-gray-600 mb-2">This is the foundation query used by all other queries. The ':days' parameter is replaced with the selected time range.</p>
                                    <pre className="bg-gray-50 p-4 rounded-lg overflow-x-auto">
                                        <code className="text-sm text-gray-800 whitespace-pre-wrap">
                                            {QUERIES.baseCte}
                                        </code>
                                    </pre>
                                </div>

                                <div className="border-t border-gray-200 my-6"></div>

                                {/* Global Health Query */}
                                <div>
                                    <h3 className="text-lg font-semibold mb-2">Global Health Query</h3>
                                    <pre className="bg-gray-50 p-4 rounded-lg overflow-x-auto">
                                        <code className="text-sm text-gray-800 whitespace-pre-wrap">
                                            {QUERIES.globalHealth}
                                        </code>
                                    </pre>
                                </div>

                                {/* Health Over Time Query */}
                                <div>
                                    <h3 className="text-lg font-semibold mb-2">Health Over Time Query</h3>
                                    <pre className="bg-gray-50 p-4 rounded-lg overflow-x-auto">
                                        <code className="text-sm text-gray-800 whitespace-pre-wrap">
                                            {QUERIES.healthOverTime}
                                        </code>
                                    </pre>
                                </div>

                                {/* By Dimension Query */}
                                <div>
                                    <h3 className="text-lg font-semibold mb-2">By Dimension Query</h3>
                                    <pre className="bg-gray-50 p-4 rounded-lg overflow-x-auto">
                                        <code className="text-sm text-gray-800 whitespace-pre-wrap">
                                            {QUERIES.byDimension}
                                        </code>
                                    </pre>
                                </div>

                                {/* By Business Unit Query */}
                                <div>
                                    <h3 className="text-lg font-semibold mb-2">By Business Unit Query</h3>
                                    <pre className="bg-gray-50 p-4 rounded-lg overflow-x-auto">
                                        <code className="text-sm text-gray-800 whitespace-pre-wrap">
                                            {QUERIES.byJob}
                                        </code>
                                    </pre>
                                </div>
                            </div>
                        </Disclosure.Panel>
                    </section>
                )}
            </Disclosure>

            {/* Update loading spinner */}
            {loading && <LoadingSpinner />}

            {error && (
                <div className="fixed bottom-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50">
                    {error}
                </div>
            )}
        </div>
    );
};

export default Dashboard; 