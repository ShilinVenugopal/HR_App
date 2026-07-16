import { useQuery } from '@tanstack/react-query';
import { AlertOctagon, Clock, Mail, MessageCircle, TrendingUp, Users } from 'lucide-react';
import { StatCard } from '../common/StatCard';
import { communicationApi } from '../../api/modules';

export function CommunicationStats() {
  const { data, isLoading } = useQuery({ queryKey: ['comm-stats'], queryFn: communicationApi.stats });

  return (
    <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      <StatCard label="Emails Sent Today" value={data?.emailsSentToday ?? 0} icon={Mail} loading={isLoading} />
      <StatCard label="WhatsApp Sent Today" value={data?.whatsappSentToday ?? 0} icon={MessageCircle} loading={isLoading} accent="emerald" />
      <StatCard label="Pending Scheduled" value={data?.pendingScheduled ?? 0} icon={Clock} loading={isLoading} accent="amber" />
      <StatCard label="Failed Messages" value={data?.failedMessages ?? 0} icon={AlertOctagon} loading={isLoading} accent="red" />
      <StatCard label="Open Rate" value={`${data?.openRate ?? 0}%`} icon={TrendingUp} loading={isLoading} />
      <StatCard label="Response Rate" value={`${data?.responseRate ?? 0}%`} icon={Users} loading={isLoading} accent="emerald" />
    </div>
  );
}
