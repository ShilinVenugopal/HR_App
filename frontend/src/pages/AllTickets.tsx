import { TicketListView } from '../components/tickets/TicketListView';

export default function AllTickets() {
  return <TicketListView scope="all" title="All Tickets" description="Every ticket across the organization" showRaisedByFilter />;
}
