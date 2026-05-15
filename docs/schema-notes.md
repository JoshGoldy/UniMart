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

**transaction\_id uuid FK -> transactions.transaction\_id**

**listing\_id uuid FK -> listings.listing\_id**

**seller\_id uuid FK -> auth.users.id**

**buyer\_id uuid FK -> auth.users.id**

**dropoff\_scheduled\_at timestamptz**

**collection\_scheduled\_at timestamptz nullable until buyer confirms collection**

**status text default "pending_dropoff" -- "pending_dropoff" | "received" | "ready_for_collection" | "released" | "cancelled"**

**## offers**

**offer\_id uuid PK default gen\_random\_uuid()**

**conversation\_id uuid FK -> conversations.conversation\_id**

**listing\_id uuid FK -> listings.listing\_id**

**buyer\_id uuid FK -> auth.users.id**

**seller\_id uuid FK -> auth.users.id**

**offer\_type text -- "purchase" | "trade"**

**amount numeric nullable**

**note text**

**## backend role security**

Run `backend-role-security-schema.sql` after the feature migrations to enforce Student, Staff, and Admin permissions in Supabase RLS.

**## saved listings**

Run `saved-listings-schema.sql` to enable account-backed saved listings/watchlists. The app keeps a browser fallback so hearts still work before this table exists, but running the SQL makes saved listings persist across devices.

**Students**

Can browse active listings, message as buyers, create offers as buyers, create/manage own listings only when their account type allows selling, review completed handovers, and report content.

**Staff**

Can read and update trade facility bookings and read facility participants needed for handover work.

**Admins**

Can manage roles, permissions, facility config, reports, moderation actions, listing moderation, and review moderation.

**status text default "pending" -- "pending" | "accepted" | "declined" | "cancelled"**

**## transactions**

**transaction\_id uuid PK default gen\_random\_uuid()**

**offer\_id uuid FK -> offers.offer\_id**

**conversation\_id uuid FK -> conversations.conversation\_id**

**listing\_id uuid FK -> listings.listing\_id**

**buyer\_id uuid FK -> auth.users.id**

**seller\_id uuid FK -> auth.users.id**

**amount numeric nullable**

**status text default "accepted" -- "accepted" | "facility_booked" | "completed" | "cancelled"**

**facility\_booking\_id uuid FK -> facility\_bookings.booking\_id**

**## reviews**

**review\_id uuid PK default gen\_random\_uuid()**

**transaction\_id uuid FK -> transactions.transaction\_id**

**reviewer\_id uuid FK -> auth.users.id**

**reviewee\_id uuid FK -> auth.users.id**

**listing\_id uuid FK -> listings.listing\_id**

**rating integer -- 1 to 5**

**body text**

**status text default "visible" -- "visible" | "hidden" | "removed"**

**## content\_reports**

**report\_id uuid PK default gen\_random\_uuid()**

**reporter\_id uuid FK -> auth.users.id**

**target\_type text -- "listing" | "review"**

**target\_id uuid**

**listing\_id uuid nullable FK -> listings.listing\_id**

**reason text**

**status text default "open" -- "open" | "reviewing" | "resolved" | "dismissed"**

**## moderation\_actions**

**action\_id uuid PK default gen\_random\_uuid()**

**admin\_id uuid nullable FK -> auth.users.id**

**action text**

**target\_type text**

**target\_id uuid nullable**

**note text**
