**# Database Schema Notes (Supabase / PostgreSQL)**

**## users**

**id uuid PK (from auth.users)**

**full\_name text**

**email text**

**account\_type text -- "buyer" | "seller\_buyer"**

**university text**

**uni\_campus text**

**student\_number text**

**## listings**

**listing\_id uuid PK default gen\_random\_uuid()**

**seller\_id uuid FK -> users.id**

**title text**

**description text**

**price numeric**

**category text**

**condition text**

**is\_tradeable boolean default false**

**listing\_type text default "sale" -- "sale" | "trade" | "both"**

**status text default "active"**

**created\_at timestamptz default now()**

**## facility_config**

**config\_id text PK default "default"**

**opens\_at time**

**closes\_at time**

**slot\_minutes integer**

**slot\_capacity integer**

**operating\_days text[]**

**## facility_bookings**

**booking\_id uuid PK default gen\_random\_uuid()**

**listing\_id uuid FK -> listings.listing\_id**

**seller\_id uuid FK -> auth.users.id**

**buyer\_id uuid FK -> auth.users.id**

**dropoff\_scheduled\_at timestamptz**

**collection\_scheduled\_at timestamptz**

**status text default "pending_dropoff" -- "pending_dropoff" | "received" | "ready_for_collection" | "released" | "cancelled"**
