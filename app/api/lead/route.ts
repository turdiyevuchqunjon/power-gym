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

    const amoResult = await createAmoCRMLead({ name, phone, address, fbp, fbc });

    // ⬇️ YANGI QATOR — Telegram'ga yuborish
    const telegramResult = await sendToTelegram({ name, phone, address, pageUrl: pageUrl || "" });

    return NextResponse.json({ success: true, meta: metaResult, amo: amoResult, telegram: telegramResult });
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

async function createAmoCRMLead(data: {
  name: string;
  phone: string;
  address: string;
  fbp?: string;
  fbc?: string;
}) {
  const DOMAIN = process.env.AMOCRM_DOMAIN;
  const ACCESS_TOKEN = process.env.AMOCRM_ACCESS_TOKEN;
  const FIELD_FBP = process.env.AMOCRM_FIELD_FBP;
  const FIELD_FBC = process.env.AMOCRM_FIELD_FBC;

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

        // Mavjud kontaktga FBP/FBC ni yangilash
        if (FIELD_FBP || FIELD_FBC) {
          const updateFields: any[] = [];
          if (FIELD_FBP && data.fbp) {
            updateFields.push({
              field_id: parseInt(FIELD_FBP),
              values: [{ value: data.fbp }],
            });
          }
          if (FIELD_FBC && data.fbc) {
            updateFields.push({
              field_id: parseInt(FIELD_FBC),
              values: [{ value: data.fbc }],
            });
          }

          if (updateFields.length > 0) {
            await fetch(`${baseUrl}/api/v4/contacts/${contactId}`, {
              method: "PATCH",
              headers,
              body: JSON.stringify({ custom_fields_values: updateFields }),
            });
            console.log("[AMOCRM] FBP/FBC yangilandi");
          }
        }
      }
    }
  } catch (err) {
    console.warn("[AMOCRM] Kontakt qidirishda xatolik:", err);
  }

  if (!contactId) {
    const customFields: any[] = [
      {
        field_code: "PHONE",
        values: [{ value: data.phone, enum_code: "WORK" }],
      },
    ];

    // FBP qo'shish
    if (FIELD_FBP && data.fbp) {
      customFields.push({
        field_id: parseInt(FIELD_FBP),
        values: [{ value: data.fbp }],
      });
    }

    // FBC qo'shish
    if (FIELD_FBC && data.fbc) {
      customFields.push({
        field_id: parseInt(FIELD_FBC),
        values: [{ value: data.fbc }],
      });
    }

    const contactPayload = [{
      name: data.name,
      custom_fields_values: customFields,
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
      console.log("[AMOCRM] Yangi kontakt yaratildi (FBP/FBC bilan):", contactId);
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

// ⬇️ YANGI FUNKSIYA — Telegram botga ariza yuborish
async function sendToTelegram(data: {
  name: string;
  phone: string;
  address: string;
  pageUrl: string;
}) {
  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  if (!TOKEN || !CHAT_ID) {
    console.warn("[TELEGRAM] .env da TELEGRAM_BOT_TOKEN yoki TELEGRAM_CHAT_ID yo'q, o'tkazib yuborildi");
    return { skipped: true };
  }

  // UTM kodlarini pageUrl dan ajratib olish
  const utm: Record<string, string> = {
    utm_source: "-",
    utm_medium: "-",
    utm_campaign: "-",
    utm_term: "-",
    utm_content: "-",
  };

  try {
    if (data.pageUrl) {
      const url = new URL(data.pageUrl);
      Object.keys(utm).forEach((key) => {
        const val = url.searchParams.get(key);
        if (val) utm[key] = val;
      });
    }
  } catch {
    // Noto'g'ri URL bo'lsa, UTM bo'sh qoladi
  }

  // Toshkent vaqti
  const date = new Date().toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent" });

  // Ism va familiyani ajratish
  const nameParts = data.name.trim().split(/\s+/);
  const firstName = nameParts[0] || "-";
  const lastName = nameParts.slice(1).join(" ") || "-";

  const text =
    `🏋️ <b>Yangi ariza — Power Gym</b>\n\n` +
    `👤 <b>Ism:</b> ${firstName}\n` +
    `👤 <b>Familiya:</b> ${lastName}\n` +
    `📞 <b>Telefon:</b> ${data.phone}\n` +
    `📍 <b>Manzil:</b> ${data.address || "-"}\n` +
    `📅 <b>Sana:</b> ${date}\n\n` +
    `📊 <b>UTM ma'lumotlari:</b>\n` +
    `• source: <code>${utm.utm_source}</code>\n` +
    `• medium: <code>${utm.utm_medium}</code>\n` +
    `• campaign: <code>${utm.utm_campaign}</code>\n` +
    `• term: <code>${utm.utm_term}</code>\n` +
    `• content: <code>${utm.utm_content}</code>`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: "HTML",
      }),
    });

    const result = await res.json();
    if (!result.ok) {
      console.error("[TELEGRAM ERROR]", result);
      return { error: result.description };
    }
    console.log("[TELEGRAM] Xabar yuborildi");
    return { ok: true };
  } catch (err: any) {
    console.error("[TELEGRAM ERROR]", err);
    return { error: err.message };
  }
}