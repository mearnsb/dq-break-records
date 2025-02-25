import React from 'react';
import { Calendar } from 'lucide-react';

interface DateRangeOption {
  label: string;
  days: number;
}

interface DateRangeDropdownProps {
  selectedDays: number;
  onSelect: (days: number) => void;
}

const DATE_RANGES: DateRangeOption[] = [
  { label: 'Last 24 hours', days: 1 },
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
];

export function DateRangeDropdown({ selectedDays, onSelect }: DateRangeDropdownProps) {
  return (
    <div className="relative">
      <select
        className="appearance-none w-48 px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pl-10"
        value={selectedDays}
        onChange={(e) => onSelect(Number(e.target.value))}
      >
        {DATE_RANGES.map((range) => (
          <option key={range.days} value={range.days}>
            {range.label}
          </option>
        ))}
      </select>
      <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
    </div>
  );
}