import { useState, useEffect } from 'react';

interface IpInfo {
  hostname: string;
  local_ip: string;
  external_ip: string;
  client_ip: string;
  x_forwarded_for: string | null;
}

export const useExternalIp = () => {
  const [ipInfo, setIpInfo] = useState<IpInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchIp = async () => {
      try {
        const response = await fetch('/api/ip');
        const data = await response.json();
        setIpInfo(data);
        console.log('External IP:', data.external_ip);
        console.log('Full IP Info:', data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch IP');
        console.error('Error fetching IP:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchIp();
  }, []);

  return { ipInfo, loading, error };
}; 