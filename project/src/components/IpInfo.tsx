import { useExternalIp } from '../hooks/useExternalIp';

export const IpInfo = () => {
  const { ipInfo, loading, error } = useExternalIp();

  if (loading) return <div>Loading IP info...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!ipInfo) return null;

  return (
    <div className="text-sm text-gray-500">
      External IP: {ipInfo.external_ip}
    </div>
  );
}; 