import { TicketListView } from '../components/tickets/TicketListView';

export default function MyTickets() {
  return <TicketListView scope="mine" title="My Tickets" description="Tickets you have raised" />;
}
