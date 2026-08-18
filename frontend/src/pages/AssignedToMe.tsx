import { TicketListView } from '../components/tickets/TicketListView';

export default function AssignedToMe() {
  return <TicketListView scope="assigned" title="Assigned to Me" description="Tickets where you are one of the assignees" />;
}
