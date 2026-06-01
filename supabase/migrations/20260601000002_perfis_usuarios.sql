-- BarberOS — Tabelas: perfis e usuarios

-- PERFIS (espelha auth.users do Supabase)
CREATE TABLE public.perfis (
  id_pe         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuari_pe     UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_pe       TEXT,
  avatar_pe     TEXT,
  fone_pe       TEXT,
  criado_pe     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atuali_pe     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qualquer autenticado pode ver perfis"
  ON public.perfis FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "usuario pode inserir proprio perfil"
  ON public.perfis FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = usuari_pe);

CREATE POLICY "usuario pode atualizar proprio perfil"
  ON public.perfis FOR UPDATE
  TO authenticated
  USING (auth.uid() = usuari_pe);

CREATE OR REPLACE FUNCTION update_atuali_pe()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atuali_pe = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_atuali_pe
  BEFORE UPDATE ON public.perfis
  FOR EACH ROW EXECUTE FUNCTION update_atuali_pe();

-- Cria perfil automaticamente ao cadastrar usuário no Auth
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.perfis (usuari_pe, nome_pe)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_new_user
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- USUARIOS (papel/role no sistema)
CREATE TABLE public.usuarios (
  id_us         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  perfil_us     UUID NOT NULL REFERENCES public.perfis(id_pe) ON DELETE CASCADE,
  empres_us     UUID NOT NULL REFERENCES public.empresas(id_em),
  papel_us      TEXT NOT NULL DEFAULT 'recepcionista'
                  CHECK (papel_us IN ('admin','gerente','recepcionista','barbeiro')),
  status_us     TEXT NOT NULL DEFAULT 'pendente'
                  CHECK (status_us IN ('ativo','pendente','inativo')),
  criado_us     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atuali_us     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuario ve seu proprio registro"
  ON public.usuarios FOR SELECT
  TO authenticated
  USING (
    perfil_us IN (
      SELECT id_pe FROM public.perfis WHERE usuari_pe = auth.uid()
    )
  );

CREATE POLICY "admin e gerente veem todos os usuarios da empresa"
  ON public.usuarios FOR SELECT
  TO authenticated
  USING (
    empres_us IN (
      SELECT empres_us FROM public.usuarios u
      JOIN public.perfis p ON p.id_pe = u.perfil_us
      WHERE p.usuari_pe = auth.uid()
      AND u.papel_us IN ('admin','gerente')
    )
  );

CREATE OR REPLACE FUNCTION update_atuali_us()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atuali_us = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_atuali_us
  BEFORE UPDATE ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION update_atuali_us();
