// Shapes of rows returned by the database (supabase/migrations/*_init.sql).
export type WorkStatus = "open" | "break" | "closed";
export type Methane = "available" | "low" | "none";
export type StationStatus = "pending" | "verified" | "rejected" | "suspended";
export type TicketStatus = "waiting" | "called" | "arrived" | "served" | "no_show" | "cancelled";

export type Station = {
  id: string;
  name: string;
  address: string;
  phone: string;
  lat: number;
  lng: number;
  opens: string | null;
  closes: string | null;
  columns: number;
  avg_service_min: number;
  max_queue: number;
  call_timeout_min: number;
  status: StationStatus;
  work_status: WorkStatus;
  methane: Methane;
  status_updated_at: string;
  queue_updated_at: string;
};

export type QueueStat = { station_id: string; cars: number; wait_min: number };

export type MyTicket = {
  id: string;
  station_id: string;
  station_name: string;
  station_address: string;
  plate: string;
  number: number;
  status: TicketStatus;
  called_at: string | null;
  call_timeout_min: number;
  ahead: number;
  wait_min: number;
};

export type Ticket = {
  id: string;
  station_id: string;
  user_id: string | null;
  plate: string;
  number: number;
  status: TicketStatus;
  created_at: string;
  called_at: string | null;
  finished_at: string | null;
};
