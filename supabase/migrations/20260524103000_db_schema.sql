-- 1. Update the profiles table to support credentials and integrations
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS integrations JSONB NOT NULL DEFAULT '{"devto":"","medium":"","hashnode":""}'::jsonb;

-- 2. Create workspaces table
CREATE TABLE IF NOT EXISTS public.workspaces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT fk_workspaces_profiles FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE
);

-- Enable RLS (Service role client will bypass this, keeping consistent with profiles table)
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- 3. Create generations table
CREATE TABLE IF NOT EXISTS public.generations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  url TEXT NOT NULL,
  tone TEXT NOT NULL,
  length TEXT NOT NULL,
  format TEXT NOT NULL,
  title TEXT NOT NULL,
  markdown TEXT NOT NULL,
  seo JSONB NOT NULL DEFAULT '{}'::jsonb,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  active_version_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT fk_generations_profiles FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;

-- 4. Create generation_versions table
CREATE TABLE IF NOT EXISTS public.generation_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  generation_id UUID NOT NULL REFERENCES public.generations(id) ON DELETE CASCADE,
  tone TEXT NOT NULL,
  length TEXT NOT NULL,
  format TEXT NOT NULL,
  title TEXT NOT NULL,
  markdown TEXT NOT NULL,
  seo JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.generation_versions ENABLE ROW LEVEL SECURITY;

-- 5. Create templates table
CREATE TABLE IF NOT EXISTS public.templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  tone TEXT NOT NULL,
  length TEXT NOT NULL,
  format TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT fk_templates_profiles FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
