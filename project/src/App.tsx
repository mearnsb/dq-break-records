import React, { Suspense, useState, useRef, useCallback } from 'react';
import { LayoutGrid, Table } from 'lucide-react';
import LoadingSpinner from './components/shared/LoadingSpinner';
import { sharedMountRef } from './components/Dashboard';
import { useExternalIp } from './hooks/useExternalIp';

const TableView = React.lazy(() => import('./pages/TableView'));
const Dashboard = React.lazy(() => import('./components/Dashboard'));

function App() {
  const [activeView, setActiveView] = React.useState<'table' | 'dashboard'>('table');
  const [isLoading, setIsLoading] = useState(true);
  const loadingRef = useRef(false);
  const viewTransitionRef = useRef(false);
  const initialLoadRef = useRef(true);

  // Use the IP hook
  const { ipInfo } = useExternalIp();

  const handleViewChange = (view: 'table' | 'dashboard') => {
    console.log('[App] View change requested:', { from: activeView, to: view });
    
    // Reset Dashboard state when switching views
    if (view === 'dashboard') {
      // Reset the shared ref to force a new fetch
      sharedMountRef.hasFetched = false;
      sharedMountRef.lastFetchedDays = -1;
      sharedMountRef.isFetching = false;
    }
    
    viewTransitionRef.current = true;
    setIsLoading(true);
    loadingRef.current = true;
    setActiveView(view);
  };

  const handleLoadComplete = useCallback(() => {
    console.log('[App] Load complete called:', { 
      loadingRef: loadingRef.current,
      viewTransition: viewTransitionRef.current,
      initialLoad: initialLoadRef.current
    });

    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      loadingRef.current = false;
      setIsLoading(false);
    } else if (viewTransitionRef.current) {
      viewTransitionRef.current = false;
      loadingRef.current = false;
      setIsLoading(false);
    } else if (!viewTransitionRef.current && loadingRef.current) {
      loadingRef.current = false;
      setIsLoading(false);
    }
  }, []);

  // Initial load handling
  React.useEffect(() => {
    if (initialLoadRef.current) {
      const timer = setTimeout(() => {
        console.log('[App] Initial load timeout triggered');
        handleLoadComplete();
      }, 1000); // Shorter timeout for initial load
      return () => clearTimeout(timer);
    }
  }, [handleLoadComplete]);

  // Failsafe timeout for other loading states
  React.useEffect(() => {
    if (!initialLoadRef.current && isLoading) {
      const timer = setTimeout(() => {
        console.log('[App] Failsafe timeout triggered');
        handleLoadComplete();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isLoading, handleLoadComplete]);

  React.useEffect(() => {
    console.log('[App] Active view changed:', activeView);
  }, [activeView]);

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm relative z-[60]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <h1 className="text-xl font-bold text-gray-800">Data Explorer</h1>
                {ipInfo && (
                  <span className="ml-4 text-sm text-gray-500">
                    IP: {ipInfo.external_ip}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => handleViewChange('dashboard')}
                className={`inline-flex items-center px-4 py-2 rounded-md text-sm font-medium ${
                  activeView === 'dashboard'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <LayoutGrid className="w-5 h-5 mr-2" />
                Summary
              </button>
              <button
                onClick={() => handleViewChange('table')}
                className={`inline-flex items-center px-4 py-2 rounded-md text-sm font-medium ${
                  activeView === 'table'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Table className="w-5 h-5 mr-2" />
                Details
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <Suspense fallback={<LoadingSpinner />}>
          {activeView === 'table' ? (
            <TableView onLoad={handleLoadComplete} />
          ) : (
            <Dashboard onLoad={handleLoadComplete} />
          )}
        </Suspense>
      </main>
    </div>
  );
}

export default App;
