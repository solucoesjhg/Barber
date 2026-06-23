-- Cria usuario admin direto via SQL, sem precisar do Auth Dashboard

-- 1. Cria o usuario no Auth com senha hasheada
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  role,
  aud
)
VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  'admin@barberos.com',
  crypt('Admin@2026', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"name":"Administrador"}',
  now(),
  now(),
  'authenticated',
  'authenticated'
);

-- 2. Cria a empresa
INSERT INTO public.empresas (nome_em, email_em, cidade_em, uf_em)
VALUES ('Barbearia Central', 'admin@barberos.com', 'São Paulo', 'SP');

-- 3. Cria o perfil vinculado
INSERT INTO public.perfis (usuari_pe, nome_pe)
SELECT id, 'Administrador' FROM auth.users WHERE email = 'admin@barberos.com';

-- 4. Cria o usuario com papel admin
INSERT INTO public.usuarios (perfil_us, empres_us, papel_us, status_us)
SELECT pe.id_pe, em.id_em, 'admin', 'ativo'
FROM public.perfis pe
JOIN auth.users au ON au.id = pe.usuari_pe
CROSS JOIN (SELECT id_em FROM public.empresas LIMIT 1) em
WHERE au.email = 'admin@barberos.com';
