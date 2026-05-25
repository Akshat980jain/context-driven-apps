-- Add brand_voice column to public.profiles table to support Multi-Modal Brand Voice Clone
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS brand_voice JSONB NOT NULL DEFAULT '{"enabled":false,"vocabulary":{"prefer":"","avoid":""},"sliders":{"depth":50,"exuberance":50,"directness":50},"sampleText":""}'::jsonb;
