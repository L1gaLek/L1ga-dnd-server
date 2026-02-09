import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const url = typeof body?.url === "string" ? body.url.trim() : "";

    if (!url) {
      return new Response(JSON.stringify({ ok: false, error: "Missing url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "Bad url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Allow only dnd.su
    if (!parsed.hostname.endsWith("dnd.su")) {
      return new Response(JSON.stringify({ ok: false, error: "Host not allowed" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const upstream = await fetch(parsed.href, {
      headers: {
        "user-agent": "Mozilla/5.0 (DnD-GAME)",
        "accept": "text/html,application/xhtml+xml",
      },
    });

    const text = await upstream.text();

    return new Response(JSON.stringify({ ok: true, status: upstream.status, text }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// supabase/functions/cleanup-rooms/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  // 1. Проверка секрета (чтобы никто снаружи не дергал функцию)
  const secret = Deno.env.get("CRON_SECRET") ?? "";
  const got = req.headers.get("x-cron-secret") ?? "";

  if (!secret || got !== secret) {
    return new Response(
      JSON.stringify({ ok: false, error: "Unauthorized" }),
      { status: 401 }
    );
  }

  // 2. Эти переменные Supabase УЖЕ заданы автоматически
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // 3. Клиент с service role (обходит RLS)
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // 4. Вызов Postgres-функции
  const { error } = await supabase.rpc("cleanup_rooms");

  if (error) {
    return new Response(
      JSON.stringify({ ok: false, error }),
      { status: 500 }
    );
  }

  return new Response(
    JSON.stringify({ ok: true }),
    { status: 200 }
  );
});
