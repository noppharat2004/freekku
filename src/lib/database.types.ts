// lib/database.types.ts
// ---------------------------------------------------------------
// TypeScript type definitions matching the Supabase/PostgREST
// GenericTable shape (Row, Insert, Update, Relationships).
// Keep in sync with any schema changes.
// ---------------------------------------------------------------

export type OfferingStatus = 'Available' | 'AlmostGone' | 'OutOfStock';

export type Offering = {
  id: string;
  image_url: string;
  location: string;
  note: string | null;
  status: OfferingStatus;
  created_at: string;
  proof_image_url: string | null; // photo proof when marked OutOfStock
  lat: number | null;             // GPS latitude where the offering was placed
  lng: number | null;             // GPS longitude where the offering was placed
};

/** Matches the GenericTable shape required by @supabase/postgrest-js v2 */
export type Database = {
  public: {
    Tables: {
      offerings: {
        Row: Offering;
        Insert: {
          id?: string;
          image_url: string;
          location: string;
          note?: string | null;
          status?: OfferingStatus;
          proof_image_url?: string | null;
          lat?: number | null;
          lng?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          image_url?: string;
          location?: string;
          note?: string | null;
          status?: OfferingStatus;
          proof_image_url?: string | null;
          lat?: number | null;
          lng?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
