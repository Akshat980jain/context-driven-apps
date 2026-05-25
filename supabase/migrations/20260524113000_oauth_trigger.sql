-- Function to handle copying or merging new users from auth.users to public.profiles automatically upon OAuth signup
CREATE OR REPLACE FUNCTION public.handle_new_oauth_user()
RETURNS TRIGGER AS $$
DECLARE
  old_user_id TEXT;
BEGIN
  -- 1. Find if there is an existing profile with the same email but a different user_id (registered via old custom credentials)
  SELECT user_id INTO old_user_id
  FROM public.profiles
  WHERE email = new.email AND user_id <> new.id::text
  LIMIT 1;

  IF old_user_id IS NOT NULL THEN
    -- A profile already exists for this email with an old user_id. We must transfer its data!
    -- Create the new profile matching the new OAuth user_id first
    INSERT INTO public.profiles (user_id, email, full_name, plan, integrations)
    VALUES (
      new.id::text,
      new.email,
      COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
      'Free',
      '{"devto":"","medium":"","hashnode":""}'::jsonb
    )
    ON CONFLICT (user_id) DO NOTHING;

    -- Transfer workspaces from old credentials profile to the new Google OAuth profile
    UPDATE public.workspaces SET user_id = new.id::text WHERE user_id = old_user_id;

    -- Transfer generations from old credentials profile to the new Google OAuth profile
    UPDATE public.generations SET user_id = new.id::text WHERE user_id = old_user_id;

    -- Transfer templates from old credentials profile to the new Google OAuth profile
    UPDATE public.templates SET user_id = new.id::text WHERE user_id = old_user_id;

    -- Delete the old credentials profile (safely, as all children are now mapped to the new user_id)
    DELETE FROM public.profiles WHERE user_id = old_user_id;
  ELSE
    -- No old profile exists. Just create the new profile as normal
    INSERT INTO public.profiles (user_id, email, full_name, plan, integrations)
    VALUES (
      new.id::text,
      new.email,
      COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
      'Free',
      '{"devto":"","medium":"","hashnode":""}'::jsonb
    )
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to run the function automatically after a user is created in auth.users
CREATE OR REPLACE TRIGGER on_oauth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_oauth_user();
