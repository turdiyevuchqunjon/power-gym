import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

/**
 * AmoCRM webhook endpoint
 * SOTILDI bosqichiga lid o'tganda Meta'ga Purchase event yuboradi
 */

export async function POST(req: NextRequest) {
  try {
    // AmoCRM application/x-www-form-urlencoded yuboradi
    const formData = await req.formData();
    const data: Record<string, any> = {};

    for (const [key, value] of formData.entries()) {
      data[key] = value;
    }

    console.log("[AMO PURCHASE WEBHOOK] Received:", JSON.stringify(data, null, 2));

    // AmoCRM webhook formati: leads[status][0][id], leads[status][0][status_id], leads[status][0][price]
    const leadId = data["leads[status][0][id]"];
    const statusId = data["leads[status][0][status_id]"];
    const price = data["leads[status][0][price]"];

    if (!leadId) {
      console.warn("[AMO PURCHASE] Lid ID yo'q");
      return NextResponse.json({ ok: true });
    }

    // Faqat SOTILDI bosqichini qabul qilamiz
    const SOLD_STATUS_ID = process.env.AMOCRM_SOLD_STATUS_ID;
    if (SOLD_STATUS_ID && statusId !== SOLD_STATUS_ID) {
      console.log(`[AMO PURCHASE] Bosqich ${statusId} - SOTILDI emas, o'tkazib yuborildi`);
      return NextResponse.json({ ok: true });
    }

    // Lid haqida to'liq ma'lumot olamiz
    const leadInfo = await fetchLeadDetails(leadId);
    if (!leadInfo) {
      console.error("[AMO PURCHASE] Lid topilmadi");
      return NextResponse.json({ ok: true });
    }

    // Meta'ga Purchase event yuborish
    const result = await sendPurchaseToMeta({
      phone: leadInfo.phone,
      name: leadInfo.name,
      fbp: leadInfo.fbp,
      fbc: leadInfo.fbc,
      price: parseFloat(price) || leadInfo.price || 0,
    });

    return NextResponse.json({ ok: true, meta: result });
  } catch (err: any) {
    console.error("[AMO PURCHASE ERROR]", err);
    return NextResponse.json({ ok: true }); // Always 200 to prevent retries
  }
}

// AmoCRM lid + kontakt ma'lumotlarini olish
async function fetchLeadDetails(leadId: string) {
  const DOMAIN = process.env.AMOCRM_DOMAIN;
  const ACCESS_TOKEN = process.env.AMOCRM_ACCESS_TOKEN;
  const FIELD_FBP = process.env.AMOCRM_FIELD_FBP;
  const FIELD_FBC = process.env.AMOCRM_FIELD_FBC;

  if (!DOMAIN || !ACCESS_TOKEN) return null;

  const headers = { Authorization: `Bearer ${ACCESS_TOKEN}` };

  try {
    // Lid + kontakt embedded
    const leadRes = await fetch(
      `https://${DOMAIN}/api/v4/leads/${leadId}?with=contacts`,
      { headers }
    );

    if (!leadRes.ok) return null;
    const lead = await leadRes.json();
    const contactId = lead?._embedded?.contacts?.[0]?.id;

    if (!contactId) return null;

    // Kontakt ma'lumotlarini olish
    const contactRes = await fetch(
      `https://${DOMAIN}/api/v4/contacts/${contactId}`,
      { headers }
    );

    if (!contactRes.ok) return null;
    const contact = await contactRes.json();

    // Telefon, FBP, FBC ni topamiz
    let phone = "";
    let fbp = "";
    let fbc = "";

    for (const field of contact.custom_fields_values || []) {
      if (field.field_code === "PHONE") {
        phone = field.values?.[0]?.value || "";
      }
      if (FIELD_FBP && String(field.field_id) === FIELD_FBP) {
        fbp = field.values?.[0]?.value || "";
      }
      if (FIELD_FBC && String(field.field_id) === FIELD_FBC) {
        fbc = field.values?.[0]?.value || "";
      }
    }

    return {
      name: contact.name || "",
      phone,
      fbp,
      fbc,
      price: lead.price || 0,
    };
  } catch (err) {
    console.error("[AMO FETCH LEAD]", err);
    return null;
  }
}

// Meta CAPI ga Purchase event yuborish
async function sendPurchaseToMeta(data: {
  phone: string;
  name: string;
  fbp: string;
  fbc: string;
  price: number;
}) {
  const PIXEL_ID = process.env.META_PIXEL_ID;
  const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

  if (!PIXEL_ID || !ACCESS_TOKEN) {
    console.warn("[META PURCHASE] Credentials yo'q");
    return { skipped: true };
  }

  const hash = (value: string) =>
    crypto.createHash("sha256").update(value.toLowerCase().trim()).digest("hex");

  const normalizedPhone = data.phone.replace(/[\s\-\(\)\+]/g, "");

  const payload = {
    data: [{
      event_name: "Purchase",
      event_time: Math.floor(Date.now() / 1000),
      event_source_url: process.env.NEXT_PUBLIC_SITE_URL || "https://powergym.uz",
      action_source: "website",
      user_data: {
        ph: normalizedPhone ? [hash(normalizedPhone)] : [],
        fn: data.name ? [hash(data.name.split(" ")[0])] : [],
        ln: data.name ? [hash(data.name.split(" ")[1] || "")] : [],
        fbp: data.fbp || "",
        fbc: data.fbc || "",
      },
      custom_data: {
        currency: "UZS",
        value: data.price,
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
    console.error("[META PURCHASE ERROR]", result);
    return { error: result };
  }

  console.log("[META PURCHASE] Event yuborildi! Summa:", data.price);
  return result;
}
