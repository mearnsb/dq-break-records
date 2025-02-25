import React from 'react';
import { ChevronDown } from 'lucide-react';

interface DatasetDropdownProps {
  datasets: string[];
  selectedDataset: string | null;
  onSelect: (dataset: string) => void;
}

export function DatasetDropdown({ datasets, selectedDataset, onSelect }: DatasetDropdownProps) {
  return (
    <div className="relative">
      <select
        className="appearance-none w-64 px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        value={selectedDataset || ''}
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value="">Select Dataset</option>
        {datasets.map((dataset) => (
          <option key={dataset} value={dataset}>
            {dataset}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" size={20} />
    </div>
  );
}