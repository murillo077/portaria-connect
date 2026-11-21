
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return response({ error: "Método não permitido." }, 405);
  }

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authorization = req.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return response({ error: "Não autenticado." }, 401);
    }

    const token = authorization.replace("Bearer ", "");

    const authClient = createClient(url, anonKey, {
      global: {
        headers: { Authorization: authorization },
      },
    });

    const { data: authData, error: authError } =
      await authClient.auth.getUser(token);

    if (authError || !authData.user) {
      return response({ error: "Sessão inválida." }, 401);
    }

    const adminClient = createClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const callerId = authData.user.id;

    const { data: caller, error: callerError } = await adminClient
      .from("profiles")
      .select("id, condominium_id, role, active")
      .eq("id", callerId)
      .single();

    if (
      callerError ||
      !caller ||
      caller.role !== "admin" ||
      !caller.active
    ) {
      return response({ error: "Acesso exclusivo do administrador." }, 403);
    }

    const body = await req.json();
    const { action, userId } = body;

    const validRole = (role: string) =>
      role === "admin" || role === "guard";

    const checkLastAdmin = async (targetId: string) => {
      const { count, error } = await adminClient
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("condominium_id", caller.condominium_id)
        .eq("role", "admin")
        .eq("active", true)
        .neq("id", targetId);

      if (error) throw error;
      return (count ?? 0) === 0;
    };

    // LISTAR FUNCIONÁRIOS
    if (action === "list") {
      const { data: profiles, error } = await adminClient
        .from("profiles")
        .select("id, full_name, role, active, created_at")
        .eq("condominium_id", caller.condominium_id)
        .order("full_name");

      if (error) throw error;

      const { data: users, error: usersError } =
        await adminClient.auth.admin.listUsers({
          page: 1,
          perPage: 1000,
        });

      if (usersError) throw usersError;

      const result = (profiles ?? []).map((profile) => ({
        ...profile,
        email:
          users.users.find((user) => user.id === profile.id)?.email ?? "",
      }));

      return response({ users: result });
    }

    // CADASTRAR FUNCIONÁRIO
    if (action === "create") {
      const { fullName, email, password, role } = body;

      if (
        !fullName?.trim() ||
        !email?.trim() ||
        !password ||
        password.length < 8 ||
        !validRole(role)
      ) {
        return response({
          error: "Informe nome, e-mail, senha (mínimo 8 caracteres) e perfil válido.",
        }, 400);
      }

      const { data: created, error: createError } =
        await adminClient.auth.admin.createUser({
          email: email.trim(),
          password,
          email_confirm: true,
        });

      if (createError) {
        return response({ error: createError.message }, 400);
      }

      const { error: profileError } = await adminClient
        .from("profiles")
        .insert({
          id: created.user.id,
          condominium_id: caller.condominium_id,
          full_name: fullName.trim(),
          role,
          active: true,
        });

      if (profileError) {
        await adminClient.auth.admin.deleteUser(created.user.id);
        throw profileError;
      }

      return response({
        message: "Funcionário cadastrado com sucesso.",
        userId: created.user.id,
      }, 201);
    }

    // VALIDAR FUNCIONÁRIO DO MESMO CONDOMÍNIO
    if (!userId) {
      return response({ error: "Funcionário não informado." }, 400);
    }

    const { data: target, error: targetError } = await adminClient
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .eq("condominium_id", caller.condominium_id)
      .maybeSingle();

    if (targetError) throw targetError;

    if (!target) {
      return response({ error: "Funcionário não encontrado." }, 404);
    }

    // EDITAR FUNCIONÁRIO
    if (action === "update") {
      const { fullName, email, password, role } = body;
if (
  userId === callerId &&
  (role !== "admin" || body.active === false)
) {
  return response({
    error: "Você não pode remover ou desativar seu próprio acesso administrativo.",
  }, 400);
}
      if (
        !fullName?.trim() ||
        !email?.trim() ||
        !validRole(role) ||
        (password && password.length < 8)
      ) {
        return response({ error: "Dados inválidos." }, 400);
      }

      if (
        target.role === "admin" &&
        target.active &&
        (role !== "admin" || body.active === false) &&
        await checkLastAdmin(userId)
      ) {
        return response({
          error: "O condomínio precisa ter pelo menos um administrador ativo.",
        }, 400);
      }

      const authUpdates: {
        email: string;
        password?: string;
      } = { email: email.trim() };

      if (password) authUpdates.password = password;

      const { error: authUpdateError } =
        await adminClient.auth.admin.updateUserById(
          userId,
          authUpdates
        );

      if (authUpdateError) throw authUpdateError;

      const profileUpdates: Record<string, unknown> = {
        full_name: fullName.trim(),
        role,
      };

      if (typeof body.active === "boolean") {
        profileUpdates.active = body.active;
      }

      const { error: updateError } = await adminClient
        .from("profiles")
        .update(profileUpdates)
        .eq("id", userId)
        .eq("condominium_id", caller.condominium_id);

      if (updateError) throw updateError;

      return response({ message: "Funcionário atualizado." });
    }

    // BLOQUEAR OU DESBLOQUEAR
    if (action === "toggle") {
      if (userId === callerId) {
        return response({
          error: "Você não pode bloquear sua própria conta.",
        }, 400);
      }

      const active = body.active;

      if (typeof active !== "boolean") {
        return response({ error: "Estado inválido." }, 400);
      }

      if (
        !active &&
        target.role === "admin" &&
        target.active &&
        await checkLastAdmin(userId)
      ) {
        return response({
          error: "Não é possível bloquear o último administrador ativo.",
        }, 400);
      }

      const { error } = await adminClient
        .from("profiles")
        .update({ active })
        .eq("id", userId)
        .eq("condominium_id", caller.condominium_id);

      if (error) throw error;

      return response({
        message: active ? "Funcionário desbloqueado." : "Funcionário bloqueado.",
      });
    }

    // EXCLUIR FUNCIONÁRIO
    if (action === "delete") {
      if (userId === callerId) {
        return response({
          error: "Você não pode excluir sua própria conta.",
        }, 400);
      }

      if (
        target.role === "admin" &&
        target.active &&
        await checkLastAdmin(userId)
      ) {
        return response({
          error: "Não é possível excluir o último administrador ativo.",
        }, 400);
      }

      const { error } = await adminClient.auth.admin.deleteUser(userId);

      if (error) throw error;

      return response({ message: "Funcionário excluído." });
    }

    return response({ error: "Operação desconhecida." }, 400);

  } catch (error) {
    console.error("manage-users:", error);

    return response({
      error: "Não foi possível concluir a operação.",
    }, 500);
  }
});
