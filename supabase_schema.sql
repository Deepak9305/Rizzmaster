-- Create profiles table
create table public.profiles (
  id uuid references auth.users not null primary key,
  email text,
  credits integer default 5,
  is_premium boolean default false,
  last_daily_reset date default current_date
);

-- Create saved_items table
create table public.saved_items (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  type text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.saved_items enable row level security;

-- Policies for profiles
create policy "Users can view own profile" 
  on public.profiles for select 
  using ( auth.uid() = id );

create policy "Users can insert own profile" 
  on public.profiles for insert 
  with check ( auth.uid() = id );

create policy "Users can update own profile" 
  on public.profiles for update 
  using ( auth.uid() = id );

create policy "Users can delete own profile" 
  on public.profiles for delete 
  using ( auth.uid() = id );

-- Policies for saved_items
create policy "Users can view own saved items" 
  on public.saved_items for select 
  using ( auth.uid() = user_id );

create policy "Users can insert own saved items" 
  on public.saved_items for insert 
  with check ( auth.uid() = user_id );

create policy "Users can delete own saved items" 
  on public.saved_items for delete 
  using ( auth.uid() = user_id );