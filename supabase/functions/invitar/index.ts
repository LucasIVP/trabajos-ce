// Portal CE: invitar a una persona desde la pantalla Miembros.
// Solo un admin puede llamarla. Usa la clave secreta del proyecto, que vive en el servidor
// (SUPABASE_SECRET_KEYS la provee la plataforma) y nunca llega a la página.
import { withSupabase } from 'npm:@supabase/server@1'

const ROLES = ['lectura', 'edicion', 'admin']
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function fail(status: number, message: string) {
  return Response.json({ error: message }, { status })
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return fail(405, 'Método no permitido')

    // Quien llama tiene que ser admin. Se lee con el cliente del usuario, así pasa por RLS.
    const me = await ctx.supabase.from('members').select('rol').eq('id', ctx.userClaims!.id).maybeSingle()
    if (me.error || me.data?.rol !== 'admin') return fail(403, 'Solo un admin puede invitar')

    let body: { email?: string; nombre?: string; iniciales?: string; rol?: string; redirectTo?: string }
    try { body = await req.json() } catch { return fail(400, 'Pedido inválido') }

    const email = (body.email ?? '').trim().toLowerCase()
    const nombre = (body.nombre ?? '').trim().slice(0, 120)
    const iniciales = (body.iniciales ?? '').trim().slice(0, 8)
    const rol = body.rol || null
    if (!EMAIL.test(email) || email.length > 254) return fail(400, 'Correo inválido')
    if (rol !== null && !ROLES.includes(rol)) return fail(400, 'Rol inválido')

    // Supabase solo acepta redirectTo si está en Authentication > URL Configuration > Redirect URLs.
    const inv = await ctx.supabaseAdmin.auth.admin.inviteUserByEmail(email, { redirectTo: body.redirectTo })
    if (inv.error) {
      const ya = /already|registered|exists/i.test(inv.error.message)
      return fail(ya ? 409 : 400, ya ? 'Ese correo ya tiene cuenta' : 'No se pudo invitar: ' + inv.error.message)
    }

    // El disparador ya creó la fila en members (sin rol). Se completan los datos que cargó el admin.
    const upd = await ctx.supabaseAdmin.from('members')
      .update({ nombre, iniciales, rol })
      .eq('id', inv.data.user.id)
    if (upd.error) return fail(500, 'Invitación enviada, pero no se pudieron guardar nombre y rol: ' + upd.error.message)

    return Response.json({ ok: true, id: inv.data.user.id })
  }),
}
