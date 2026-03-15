export interface Screening {
  film: string;
  format?: string; // "OV" | "OmU" | "OmeU" | "DolbyAtmos" | etc.
  genres: string[];
  year?: number;
  runtime?: string; // "1 Std. 56 Min."
  fsk?: string; // "FSK 12"
  description: string;
  cinema: string; // "Filmtheater Blaue Brücke"
  address: string; // "Friedrichstrasse 19"
  city?: string; // only populated in --film mode (no city)
  date: string; // "2026-03-15" (ISO)
  time: string; // "19:30"
  isPast: boolean;
  ticketUrl?: string;
}
