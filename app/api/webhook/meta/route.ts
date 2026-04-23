import { NextRequest, NextResponse } from "next/server";

// Meta webhook verification (GET)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("[META WEBHOOK] Verification successful");
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// Meta webhook events (POST)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("[META WEBHOOK] Received:", JSON.stringify(body, null, 2));

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field === "leadgen") {
          await handleLeadgenEvent(change.value);
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[META WEBHOOK ERROR]", err);
    return NextResponse.json({ received: true });
  }
}

async function handleLeadgenEvent(value: any) {
  const { leadgen_id, form_id } = value;
  console.log("[LEADGEN] New lead:", leadgen_id);

  try {
    const leadRes = await fetch(
      `https://graph.facebook.com/v19.0/${leadgen_id}?access_token=${process.env.META_ACCESS_TOKEN}`
    );
    const leadData = await leadRes.json();

    const fields: Record<string, string> = {};
    for (const field of leadData.field_data || []) {
      fields[field.name] = field.values?.[0] || "";
    }

    await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/lead`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fields["full_name"] || fields["first_name"] || "Facebook Lead",
        phone: fields["phone_number"] || fields["phone"] || "",
        address: fields["city"] || fields["street_address"] || `Form: ${form_id}`,
      }),
    });

    console.log("[LEADGEN] Forwarded to CRM");
  } catch (err) {
    console.error("[LEADGEN ERROR]", err);
  }
}
