/* Configuración pública del portal.
   La dirección del proyecto y la clave PÚBLICA (publishable / anon) pueden estar en un repo público:
   lo que protege los datos son las reglas de seguridad (RLS) de la base.
   NUNCA poner acá la clave service_role, la contraseña de la base ni tokens de Notion o Google. */
window.PORTAL_CONFIG = {
  SUPABASE_URL: 'https://nryjrdzzmtifalpeugeb.supabase.co',
  SUPABASE_KEY: 'PEGAR_ACA_LA_CLAVE_PUBLICA'
};
