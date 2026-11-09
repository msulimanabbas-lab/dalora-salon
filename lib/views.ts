// Plain, serialisable shapes passed from server pages to client components.

export type BookingView = {
  id: string; code: string; staffId: string; customerId: string; customerName: string; customerPhone: string;
  day: string; startMin: number; endMin: number; bufferMin: number; travelMin: number;
  status: 'booked' | 'arrived' | 'in_service' | 'done' | 'no_show' | 'cancelled';
  source: string; location: 'salon' | 'home'; address: string;
  subtotal: number; discount: number; homeFee: number; total: number; paid: number;
  notes: string; cancelReason: string; allergies: string; customerNotes: string;
  items: { name: string; durationMin: number; price: number; serviceId: string | null }[];
  /** salon-local minute of the day each step happened; null until it does */
  confirmed: boolean; arrivedMin: number | null; startedMin: number | null; finishedMin: number | null;
};
export type StaffView = { id: string; name: string; title: string; color: string; week: Record<string, [number, number]>; worksHome: boolean };
export type ServiceView = { id: string; name: string; category: string; durationMin: number; bufferMin: number; price: number; homeOk: boolean; staffIds: string[] };
export type SalonView = { opens: number; closes: number; step: number; homeService: boolean; homeFee: number; travel: number; depositPct: number; today: string; nowMin: number; name: string; lateMins: number };
export type TimeOffView = { id: string; staffId: string; startMin: number; endMin: number; reason: string };
