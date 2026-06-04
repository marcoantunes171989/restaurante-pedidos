-- Migration 021: Storage para imagens de produtos
-- Cria o bucket público "produto-imagens" e as políticas de acesso.
-- !!! EXECUTAR NO SUPABASE (SQL Editor) para habilitar o upload de imagens !!!

-- 1. Cria o bucket público (read liberado; upload controlado por policy)
INSERT INTO storage.buckets (id, name, public)
VALUES ('produto-imagens', 'produto-imagens', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Leitura pública das imagens
DROP POLICY IF EXISTS "produto_imagens_read" ON storage.objects;
CREATE POLICY "produto_imagens_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'produto-imagens');

-- 3. Upload (insert) permitido para a role anon/authenticated
DROP POLICY IF EXISTS "produto_imagens_insert" ON storage.objects;
CREATE POLICY "produto_imagens_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'produto-imagens');

-- 4. (Opcional) Atualizar/sobrescrever
DROP POLICY IF EXISTS "produto_imagens_update" ON storage.objects;
CREATE POLICY "produto_imagens_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'produto-imagens');
