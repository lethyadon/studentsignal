import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface GIASEstablishment {
  Urn: number;
  EstablishmentName: string;
  TypeOfEstablishment?: { Code: string; DisplayName: string };
  EstablishmentStatus?: { Code: string; DisplayName: string };
  PhaseOfEducation?: { Code: string; DisplayName: string };
  LA?: { Code: string; DisplayName: string };
  Postcode?: string;
  Street?: string;
  Town?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const urn = url.searchParams.get("urn") ?? (await req.json().catch(() => ({}))).urn;

    if (!urn) {
      return new Response(
        JSON.stringify({ error: "URN is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Validate URN format: 6 digits
    const urnStr = String(urn).trim();
    if (!/^\d{6}$/.test(urnStr)) {
      return new Response(
        JSON.stringify({ error: "URN must be a 6-digit number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Call the GIAS (Get Information About Schools) API
    const giasUrl = `https://get-information-schools.service.gov.uk/api/v1/establishments/${urnStr}`;
    const giasRes = await fetch(giasUrl, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "StudentSignal/1.0",
      },
    });

    if (giasRes.status === 404) {
      return new Response(
        JSON.stringify({ found: false, error: "No school found with this URN on the DfE register." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!giasRes.ok) {
      return new Response(
        JSON.stringify({ found: false, error: `GIAS lookup unavailable (${giasRes.status}). Your URN will be stored for manual verification.` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const establishment: GIASEstablishment = await giasRes.json();

    // Map phase code to readable label
    const PHASE_MAP: Record<string, string> = {
      "0": "not-applicable",
      "1": "nursery",
      "2": "primary",
      "3": "middle-deemed-primary",
      "4": "secondary",
      "5": "middle-deemed-secondary",
      "6": "16+",
      "7": "all-through",
    };

    const phaseCode = establishment.PhaseOfEducation?.Code ?? "";
    const phase = PHASE_MAP[phaseCode] ?? "other";

    // Only open (status code 1) establishments are valid
    const statusCode = establishment.EstablishmentStatus?.Code;
    if (statusCode && statusCode !== "1") {
      return new Response(
        JSON.stringify({
          found: true,
          valid: false,
          name: establishment.EstablishmentName,
          status: establishment.EstablishmentStatus?.DisplayName,
          error: `This school is listed as "${establishment.EstablishmentStatus?.DisplayName}" on the DfE register. Only open schools can register.`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        found: true,
        valid: true,
        urn: urnStr,
        name: establishment.EstablishmentName,
        phase,
        la_name: establishment.LA?.DisplayName ?? null,
        postcode: establishment.Postcode ?? null,
        type: establishment.TypeOfEstablishment?.DisplayName ?? null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ found: false, error: `Verification service error: ${(err as Error).message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

