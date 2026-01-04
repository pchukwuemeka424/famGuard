-- ============================================
-- Migration: Sync Supabase Auth Users with Public Users Table
-- This trigger automatically creates a user profile in the public.users table
-- when a user signs up via Supabase Auth
-- ============================================

-- Function to handle new user creation from auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (
    id,
    email,
    name,
    phone,
    is_group_admin,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id::TEXT,  -- Convert UUID to TEXT for compatibility
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email, 'User'),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    false,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;  -- Prevent duplicate inserts
  
  -- Create default user settings
  INSERT INTO public.user_settings (
    user_id,
    location_sharing_enabled,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id::TEXT,
    false,  -- Location sharing disabled by default until user enables it
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id) DO NOTHING;  -- Prevent duplicate inserts
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Also handle user updates to sync metadata
CREATE OR REPLACE FUNCTION public.handle_user_update()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.users
  SET
    email = NEW.email,
    name = COALESCE(NEW.raw_user_meta_data->>'name', OLD.raw_user_meta_data->>'name', users.name),
    phone = COALESCE(NEW.raw_user_meta_data->>'phone', OLD.raw_user_meta_data->>'phone', users.phone),
    updated_at = NOW()
  WHERE id = NEW.id::TEXT;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for user updates
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_update();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON public.users TO anon, authenticated;
GRANT ALL ON public.user_settings TO anon, authenticated;

