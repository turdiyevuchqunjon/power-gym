import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

interface LeadPayload {
  name: string;
  phone: string;
  address: string;
  fbp?: string;
  fbc?: string;
  userAgent?: string;
  pageUrl?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: LeadPayload = await req.json();
    const { name, phone, address, fbp, fbc, userAgent, pageUrl } = body;

    if (!name || !phone) {
      return NextResponse.json({ error: "Ism va telefon majburiy" }, { status: 400 });
    }

    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1";

    const metaResult = await sendToMetaCAPI({
      name, phone, fbp, fbc,
      clientIp,
      userAgent: userAgent || "",
      pageUrl: pageUrl || process.env.NEXT_PUBLIC_SITE_URL || "",
    });

    const amoResult = await createAmoCRMLead({ name, phone, address });

    return NextResponse.json({ success: true, meta: metaResult, amo: amoResult });
  } catch (err: any) {
    console.error("[LEAD API ERROR]", err);
    return NextResponse.json({ error: err.message || "Server xatoligi" }, { status: 500 });
  }
}

async function sendToMetaCAPI(data: {
  name: string;
  phone: string;
  fbp?: string;
  fbc?: string;
  clientIp: string;
  userAgent: string;
  pageUrl: string;
}) {
  const PIXEL_ID = process.env.META_PIXEL_ID;
  const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

  if (!PIXEL_ID || !ACCESS_TOKEN) {
    console.warn("[META CAPI] .env da META_PIXEL_ID yoki META_ACCESS_TOKEN yo'q, o'tkazib yuborildi");
    return { skipped: true };
  }

  const hash = (value: string) =>
    crypto.createHash("sha256").update(value.toLowerCase().trim()).digest("hex");

  const normalizedPhone = data.phone.replace(/[\s\-\(\)]/g, "");

  const payload = {
    data: [{
      event_name: "Lead",
      event_time: Math.floor(Date.now() / 1000),
      event_source_url: data.pageUrl,
      action_source: "website",
      user_data: {
        fn: [hash(data.name.split(" ")[0] || data.name)],
        ln: [hash(data.name.split(" ")[1] || "")],
        ph: [hash(normalizedPhone)],
        client_ip_address: data.clientIp,
        client_user_agent: data.userAgent,
        fbp: data.fbp || "",
        fbc: data.fbc || "",
      },
    }],
    ...(process.env.META_TEST_EVENT_CODE ? { test_event_code: process.env.META_TEST_EVENT_CODE } : {}),
  };

  const res = await fetch(
    `https://graph.facebook.com/v19.0/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
  );

  const result = await res.json();
  if (!res.ok) {
    console.error("[META CAPI ERROR]", result);
    return { error: result };
  }
  console.log("[META CAPI] Event yuborildi");
  return result;
}

async function createAmoCRMLead(data: { name: string; phone: string; address: string }) {
  const DOMAIN = process.env.AMOCRM_DOMAIN;
  const ACCESS_TOKEN = process.env.AMOCRM_ACCESS_TOKEN;

  if (!DOMAIN || !ACCESS_TOKEN) {
    console.warn("[AMOCRM] .env da AMOCRM_DOMAIN yoki AMOCRM_ACCESS_TOKEN yo'q, o'tkazib yuborildi");
    return { skipped: true };
  }

  const baseUrl = `https://${DOMAIN}`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${ACCESS_TOKEN}`,
  };

  let contactId: number | null = null;

  try {
    const searchRes = await fetch(
      `${baseUrl}/api/v4/contacts?query=${encodeURIComponent(data.phone)}`,
      { headers }
    );
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const existing = searchData?._embedded?.contacts?.[0];
      if (existing) {
        contactId = existing.id;
        console.log("[AMOCRM] Mavjud kontakt topildi:", contactId);
      }
    }
  } catch (err) {
    console.warn("[AMOCRM] Kontakt qidirishda xatolik:", err);
  }

  if (!contactId) {
    const contactPayload = [{
      name: data.name,
      custom_fields_values: [{
        field_code: "PHONE",
        values: [{ value: data.phone, enum_code: "WORK" }],
      }],
    }];

    const contactRes = await fetch(`${baseUrl}/api/v4/contacts`, {
      method: "POST",
      headers,
      body: JSON.stringify(contactPayload),
    });

    const contactData = await contactRes.json();
    if (!contactRes.ok) {
      console.error("[AMOCRM KONTAKT XATOLIK]", JSON.stringify(contactData, null, 2));
    } else {
      contactId = contactData?._embedded?.contacts?.[0]?.id;
      console.log("[AMOCRM] Yangi kontakt yaratildi:", contactId);
    }
  }

  const leadPayload: any[] = [{
    name: `${data.name} - ${data.phone}`,
    ...(process.env.AMOCRM_PIPELINE_ID ? { pipeline_id: parseInt(process.env.AMOCRM_PIPELINE_ID) } : {}),
    ...(process.env.AMOCRM_STATUS_ID ? { status_id: parseInt(process.env.AMOCRM_STATUS_ID) } : {}),
    ...(contactId ? { _embedded: { contacts: [{ id: contactId }] } } : {}),
  }];

  const leadRes = await fetch(`${baseUrl}/api/v4/leads`, {
    method: "POST",
    headers,
    body: JSON.stringify(leadPayload),
  });

  const leadData = await leadRes.json();
  if (!leadRes.ok) {
    console.error("[AMOCRM LID XATOLIK]", JSON.stringify(leadData, null, 2));
    throw new Error("AmoCRM lid yaratishda xatolik");
  }

  const leadId = leadData?._embedded?.leads?.[0]?.id;
  console.log("[AMOCRM] Lid yaratildi ID:", leadId);

  if (leadId && data.address) {
    try {
      await fetch(`${baseUrl}/api/v4/leads/${leadId}/notes`, {
        method: "POST",
        headers,
        body: JSON.stringify([{
          note_type: "common",
          params: { text: `Manzil: ${data.address}\nTelefon: ${data.phone}\nMijoz: ${data.name}` },
        }]),
      });
      console.log("[AMOCRM] Izoh qo'shildi");
    } catch (err) {
      console.warn("[AMOCRM] Izoh qo'shishda xatolik:", err);
    }
  }

  return { leadId, contactId };
}


