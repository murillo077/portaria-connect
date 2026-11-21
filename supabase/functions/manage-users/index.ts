import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const validRole = (role: unknown): role is "admin" | "guard" =>
  role === "admin" || role === "guard";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Método não permitido." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) {
      console.error("Variáveis de ambiente do Supabase ausentes.");
      return response({ error: "Configuração do servidor incompleta." }, 500);
    }

    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return response({ error: "Não autenticado." }, 401);
    }

    const authClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const token = authorization.slice("Bearer ".length);
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return response({ error: "Sessão inválida." }, 401);

    const adminClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const callerId = authData.user.id;
    const { data: caller, error: callerError } = await adminClient
      .from("profiles")
      .select("id, condominium_id, role, active")
      .eq("id", callerId)
      .single();

    if (callerError || !caller || caller.role !== "admin" || caller.active !== true) {
      return response({ error: "Acesso exclusivo do administrador." }, 403);
    }

    let body: Record<string, any>;
    try {
      body = await req.json();
    } catch {
      return response({ error: "Corpo da requisição inválido." }, 400);
    }

    const { action, userId } = body;

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

    if (action === "list") {
      const { data: profiles, error } = await adminClient
        .from("profiles")
        .select("id, full_name, role, active, created_at")
        .eq("condominium_id", caller.condominium_id)
        .order("full_name");
      if (error) throw error;

      const { data: users, error: usersError } = await adminClient.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      if (usersError) throw usersError;

      const emailById = new Map(users.users.map((user) => [user.id, user.email ?? ""]));
      return response({
        users: (profiles ?? []).map((profile) => ({
          ...profile,
          email: emailById.get(profile.id) ?? "",
        })),
      });
    }

    if (action === "create") {
      const { fullName, email, password, role } = body;
      if (
        typeof fullName !== "string" || !fullName.trim() ||
        typeof email !== "string" || !email.trim() ||
        typeof password !== "string" || password.length < 8 ||
        !validRole(role)
      ) {
        return response({ error: "Informe nome, e-mail, senha (mínimo 8 caracteres) e perfil válido." }, 400);
      }

      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email: email.trim().toLowerCase(),
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName.trim() },
      });
      if (createError || !created.user) {
        return response({ error: createError?.message ?? "Não foi possível criar o usuário." }, 400);
      }

      // UPSERT também funciona quando há um trigger que cria o perfil no cadastro do Auth.
      const { error: profileError } = await adminClient.from("profiles").upsert({
        id: created.user.id,
        condominium_id: caller.condominium_id,
        full_name: fullName.trim(),
        role,
        active: true,
      }, { onConflict: "id" });

      if (profileError) {
        await adminClient.auth.admin.deleteUser(created.user.id);
        throw profileError;
      }

      return response({ message: "Funcionário cadastrado com sucesso.", userId: created.user.id }, 201);
    }

    if (!userId || typeof userId !== "string") {
      return response({ error: "Funcionário não informado." }, 400);
    }

    const { data: target, error: targetError } = await adminClient
      .from("profiles")
      .select("id, role, active, condominium_id")
      .eq("id", userId)
      .eq("condominium_id", caller.condominium_id)
      .maybeSingle();

    if (targetError) throw targetError;
    if (!target) return response({ error: "Funcionário não encontrado neste condomínio." }, 404);

    if (action === "update") {
      const { fullName, email, password, role, active } = body;
      if (
        typeof fullName !== "string" || !fullName.trim() ||
        typeof email !== "string" || !email.trim() ||
        !validRole(role) ||
        (password !== undefined && password !== "" &&
          (typeof password !== "string" || password.length < 8)) ||
        (active !== undefined && typeof active !== "boolean")
      ) {
        return response({ error: "Dados inválidos. A senha, quando informada, deve ter pelo menos 8 caracteres." }, 400);
      }

      if (userId === callerId && (role !== "admin" || active === false)) {
        return response({ error: "Você não pode remover ou desativar seu próprio acesso administrativo." }, 400);
      }

      if (
        target.role === "admin" && target.active === true &&
        (role !== "admin" || active === false) &&
        await checkLastAdmin(userId)
      ) {
        return response({ error: "O condomínio precisa ter pelo menos um administrador ativo." }, 400);
      }

      const authUpdates: { email: string; password?: string } = {
        email: email.trim().toLowerCase(),
      };
      if (typeof password === "string" && password.length > 0) authUpdates.password = password;

      const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(userId, authUpdates);
      if (authUpdateError) return response({ error: authUpdateError.message }, 400);

      const profileUpdates: Record<string, unknown> = {
        full_name: fullName.trim(),
        role,
      };
      if (typeof active === "boolean") profileUpdates.active = active;

      const { error: updateError } = await adminClient
        .from("profiles")
        .update(profileUpdates)
        .eq("id", userId)
        .eq("condominium_id", caller.condominium_id);
      if (updateError) throw updateError;

      return response({ message: "Funcionário atualizado." });
    }

    if (action === "toggle") {
      if (userId === callerId) return response({ error: "Você não pode bloquear sua própria conta." }, 400);
      if (typeof body.active !== "boolean") return response({ error: "Estado inválido." }, 400);

      if (!body.active && target.role === "admin" && target.active === true && await checkLastAdmin(userId)) {
        return response({ error: "Não é possível bloquear o último administrador ativo." }, 400);
      }

      const { error } = await adminClient.from("profiles")
        .update({ active: body.active })
        .eq("id", userId)
        .eq("condominium_id", caller.condominium_id);
      if (error) throw error;

      return response({ message: body.active ? "Funcionário desbloqueado." : "Funcionário bloqueado." });
    }

    if (action === "delete") {
      if (userId === callerId) return response({ error: "Você não pode excluir sua própria conta." }, 400);
      if (target.role === "admin" && target.active === true && await checkLastAdmin(userId)) {
        return response({ error: "Não é possível excluir o último administrador ativo." }, 400);
      }

      // Preserva o histórico de encomendas: não exclui contas referenciadas pelas entregas.
      const { count: deliveryReferences, error: referenceError } = await adminClient
        .from("deliveries")
        .select("id", { count: "exact", head: true })
        .or(`received_by.eq.${userId},collected_by.eq.${userId}`);
      if (referenceError) throw referenceError;
      if ((deliveryReferences ?? 0) > 0) {
        return response({
          error: "Este funcionário possui encomendas vinculadas ao histórico. Para preservar os registros, bloqueie o acesso em vez de excluir a conta.",
        }, 409);
      }

      const { error } = await adminClient.auth.admin.deleteUser(userId);
      if (error) throw error;
      return response({ message: "Funcionário excluído." });
    }

    return response({ error: "Operação desconhecida." }, 400);
  } catch (error) {
    console.error("manage-users:", error);
    return response({ error: "Não foi possível concluir a operação." }, 500);
  }
});
