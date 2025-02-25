import React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

interface DatabaseStatusProps {
  isConnected: boolean;
  error?: string;
}

export function DatabaseStatus({ isConnected, error }: DatabaseStatusProps) {
  if (isConnected) {
    return (
      <div className="flex items-center text-green-600 text-sm">
        <CheckCircle2 className="w-4 h-4 mr-2" />
        Database connected
      </div>
    );
  }

  return (
    <div className="flex items-center bg-red-50 text-red-700 px-4 py-2 rounded-md text-sm">
      <AlertCircle className="w-4 h-4 mr-2" />
      <div>
        <p className="font-medium">Database connection failed</p>
        {error && <p className="text-red-600 text-xs mt-1">{error}</p>}
      </div>
    </div>
  );
}