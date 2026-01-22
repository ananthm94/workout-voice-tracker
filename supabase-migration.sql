-- ============================================
-- Workout Tracker: Multi-User Authentication Migration
-- Run this in the Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. Create Profiles Table (mirrors auth.users)
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  height_cm INTEGER,
  weight_kg NUMERIC(5,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add comment
COMMENT ON TABLE public.profiles IS 'User profile data including height and weight';

-- ============================================
-- 2. Enable Row Level Security on all tables
-- ============================================

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Enable RLS on workouts (your main workout sessions table)
ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;

-- Add user_id column to workouts if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'workouts' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.workouts ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Create index on user_id for faster queries
CREATE INDEX IF NOT EXISTS idx_workouts_user_id ON public.workouts(user_id);

-- ============================================
-- 3. Create RLS Policies
-- ============================================

-- Profiles: Users can only see and modify their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" 
  ON public.profiles 
  FOR SELECT 
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" 
  ON public.profiles 
  FOR INSERT 
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" 
  ON public.profiles 
  FOR UPDATE 
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Workouts: Users can only see and modify their own workouts
DROP POLICY IF EXISTS "Users can view own workouts" ON public.workouts;
CREATE POLICY "Users can view own workouts" 
  ON public.workouts 
  FOR SELECT 
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own workouts" ON public.workouts;
CREATE POLICY "Users can insert own workouts" 
  ON public.workouts 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own workouts" ON public.workouts;
CREATE POLICY "Users can update own workouts" 
  ON public.workouts 
  FOR UPDATE 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own workouts" ON public.workouts;
CREATE POLICY "Users can delete own workouts" 
  ON public.workouts 
  FOR DELETE 
  USING (auth.uid() = user_id);

-- ============================================
-- 4. Create Trigger: Auto-create profile on signup
-- ============================================

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 5. Grant necessary permissions
-- ============================================

-- Allow authenticated users to read/write profiles
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;

-- Allow authenticated users to read/write workouts
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workouts TO authenticated;

-- Allow service role full access (for server-side operations)
GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.workouts TO service_role;

-- ============================================
-- 6. Create updated_at trigger for profiles
-- ============================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- Done! Your database is now multi-user ready.
-- ============================================

