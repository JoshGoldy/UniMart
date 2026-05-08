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

**status text default "active"**

**created\_at timestamptz default now()**

