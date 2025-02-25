import React from 'react';
import { Database, AlertCircle } from 'lucide-react';

interface GettingStartedProps {
  dbConnected: boolean;
  dbError?: string;
}

export function GettingStarted({ dbConnected, dbError }: GettingStartedProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      {dbConnected ? (
        <>
          <Database className="w-16 h-16 text-blue-500 mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Getting Started</h2>
          <p className="text-gray-600 max-w-md">
            Select a dataset from the dropdown above to view and analyze your data.
            The dashboard will update automatically based on your selection.
          </p>
        </>
      ) : (
        <>
          <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Database Connection Error</h2>
          <p className="text-red-600 max-w-md mb-2">
            Unable to connect to the database. Please check your connection settings.
          </p>
          {dbError && (
            <p className="text-sm text-gray-600 max-w-md p-4 bg-gray-50 rounded-lg border border-gray-200">
              Error: {dbError}
            </p>
          )}
        </>
      )}
    </div>
  );
}