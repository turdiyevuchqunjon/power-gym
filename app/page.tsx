"use client";

import { useState } from "react";

export default function HomePage() {
  const [form, setForm] = useState({ name: "", phone: "", address: "" });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          fbp: getCookie("_fbp"),
          fbc: getCookie("_fbc"),
          userAgent: navigator.userAgent,
          pageUrl: window.location.href,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Xatolik yuz berdi");
      setStatus("success");
      setForm({ name: "", phone: "", address: "" });
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err.message);
    }
  };

  return (
    <main className="page">
      <div className="bg-orb orb-1" />
      <div className="bg-orb orb-2" />

      <section className="hero">
        <div className="hero-badge">🚀 Pro</div>
        <h1 className="hero-title">
          Biznesingizni<br />
          <span className="gradient-text">Yangi Bosqichga</span><br />
          Olib Chiqamiz
        </h1>
        <p className="hero-sub">
          Ariza qoldiring — 30 daqiqa ichida mutaxassisimiz siz bilan bog&apos;lanadi
        </p>
      </section>

      <section className="form-section">
        <div className="form-card">
          <div className="form-header">
            <h2>Bepul Konsultatsiya</h2>
            <p>Quyidagi maydonlarni to&apos;ldiring</p>
          </div>

          {status === "success" ? (
            <div className="success-box">
              <div className="success-icon">✓</div>
              <h3>Arizangiz qabul qilindi!</h3>
              <p>Tez orada siz bilan bog&apos;lanamiz</p>
              <button className="btn-reset" onClick={() => setStatus("idle")}>
                Yana ariza yuborish
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="lead-form">
              <div className="field">
                <label>Ism Familiya *</label>
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="Abdullayev Jasur"
                  required
                />
              </div>

              <div className="field">
                <label>Telefon raqam *</label>
                <input
                  type="tel"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="+998 90 123 45 67"
                  required
                />
              </div>

              <div className="field">
                <label>Manzil *</label>
                <input
                  type="text"
                  name="address"
                  value={form.address}
                  onChange={handleChange}
                  placeholder="Toshkent, Chilonzor tumani"
                  required
                />
              </div>

              {status === "error" && (
                <div className="error-box">⚠️ {errorMsg}</div>
              )}

              <button
                type="submit"
                className={`submit-btn ${status === "loading" ? "loading" : ""}`}
                disabled={status === "loading"}
              >
                {status === "loading" ? <span className="spinner" /> : "Ariza Yuborish →"}
              </button>

              <p className="privacy-note">🔒 Ma&apos;lumotlaringiz xavfsiz</p>
            </form>
          )}
        </div>

        <div className="trust-badges">
          <div className="badge-item"><span>⚡</span> 30 daqiqada javob</div>
          <div className="badge-item"><span>🎯</span> Bepul konsultatsiya</div>
          <div className="badge-item"><span>🔐</span> Ma&apos;lumot xavfsiz</div>
        </div>
      </section>

      <style jsx>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@300;400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .page {
          min-height: 100vh; background: #050810; color: #fff;
          font-family: 'DM Sans', sans-serif; position: relative;
          overflow-x: hidden; padding: 60px 24px 80px;
          display: flex; flex-direction: column; align-items: center; gap: 64px;
        }
        .bg-orb { position: fixed; border-radius: 50%; filter: blur(120px); opacity: 0.18; pointer-events: none; z-index: 0; }
        .orb-1 { width: 600px; height: 600px; background: #4f46e5; top: -200px; left: -200px; }
        .orb-2 { width: 500px; height: 500px; background: #06b6d4; bottom: -150px; right: -150px; }
        .hero { position: relative; z-index: 1; text-align: center; max-width: 680px; }
        .hero-badge {
          display: inline-block; background: rgba(79,70,229,0.2);
          border: 1px solid rgba(79,70,229,0.4); color: #a5b4fc;
          padding: 6px 16px; border-radius: 100px; font-size: 13px;
          font-weight: 500; margin-bottom: 28px;
        }
        .hero-title {
          font-family: 'Syne', sans-serif; font-size: clamp(38px, 7vw, 72px);
          font-weight: 800; line-height: 1.05; margin-bottom: 20px; letter-spacing: -1px;
        }
        .gradient-text {
          background: linear-gradient(135deg, #6366f1 0%, #06b6d4 60%, #34d399 100%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }
        .hero-sub { font-size: 18px; color: rgba(255,255,255,0.55); font-weight: 300; line-height: 1.6; }
        .form-section { position: relative; z-index: 1; width: 100%; max-width: 480px; display: flex; flex-direction: column; gap: 24px; }
        .form-card {
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 24px; padding: 40px; backdrop-filter: blur(20px);
        }
        .form-header { margin-bottom: 28px; }
        .form-header h2 { font-family: 'Syne', sans-serif; font-size: 24px; font-weight: 700; margin-bottom: 6px; }
        .form-header p { color: rgba(255,255,255,0.4); font-size: 14px; }
        .field { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
        label { font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.6); }
        input {
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px; padding: 14px 16px; color: #fff;
          font-family: 'DM Sans', sans-serif; font-size: 15px; transition: all 0.2s; outline: none;
        }
        input::placeholder { color: rgba(255,255,255,0.2); }
        input:focus { border-color: rgba(99,102,241,0.6); background: rgba(99,102,241,0.08); }
        .submit-btn {
          width: 100%; padding: 16px;
          background: linear-gradient(135deg, #4f46e5, #06b6d4);
          border: none; border-radius: 12px; color: #fff;
          font-family: 'Syne', sans-serif; font-size: 16px; font-weight: 600;
          cursor: pointer; transition: all 0.2s; margin-top: 8px;
          display: flex; align-items: center; justify-content: center; min-height: 52px;
        }
        .submit-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(79,70,229,0.4); }
        .submit-btn.loading { opacity: 0.7; cursor: not-allowed; }
        .spinner {
          width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff; border-radius: 50%; animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .privacy-note { text-align: center; font-size: 12px; color: rgba(255,255,255,0.25); margin-top: 12px; }
        .error-box {
          background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3);
          border-radius: 10px; padding: 12px 16px; font-size: 14px; color: #fca5a5; margin-bottom: 12px;
        }
        .success-box { text-align: center; padding: 20px 0; }
        .success-icon {
          width: 64px; height: 64px; background: linear-gradient(135deg, #4f46e5, #06b6d4);
          border-radius: 50%; display: flex; align-items: center; justify-content: center;
          font-size: 28px; margin: 0 auto 20px;
        }
        .success-box h3 { font-family: 'Syne', sans-serif; font-size: 22px; margin-bottom: 8px; }
        .success-box p { color: rgba(255,255,255,0.5); margin-bottom: 24px; }
        .btn-reset {
          background: transparent; border: 1px solid rgba(255,255,255,0.2);
          color: rgba(255,255,255,0.6); padding: 10px 24px; border-radius: 10px;
          cursor: pointer; font-size: 14px; transition: all 0.2s;
        }
        .btn-reset:hover { border-color: rgba(255,255,255,0.4); color: #fff; }
        .trust-badges { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
        .badge-item {
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07);
          border-radius: 100px; padding: 8px 18px; font-size: 13px;
          color: rgba(255,255,255,0.5); display: flex; align-items: center; gap: 6px;
        }
        @media (max-width: 500px) {
          .form-card { padding: 28px 20px; }
          .page { padding: 40px 16px 60px; gap: 40px; }
        }
      `}</style>
    </main>
  );
}

function getCookie(name: string): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? match[2] : "";
}