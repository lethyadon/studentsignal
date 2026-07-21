import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ─── Email templates ──────────────────────────────────────────────────────────

function buildEmail(action: string, params: {
  recipientName: string;
  schoolName: string;
  customMessage?: string;
}): { subject: string; html: string; text: string } {
  const { recipientName, schoolName, customMessage } = params;

  const customNote = customMessage
    ? `<p style="background:#f8fafc;border-left:3px solid #0d9488;padding:10px 16px;border-radius:4px;color:#334155;font-size:14px;margin:16px 0"><strong>Note from our team:</strong> ${customMessage}</p>`
    : '';
  const customNoteTxt = customMessage ? `\nNote from our team: ${customMessage}\n` : '';

  const wrap = (title: string, body: string) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden">
        <tr><td style="background:#0f766e;padding:24px 32px">
          <div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px">Student Signal</div>
          <div style="color:#99f6e4;font-size:12px;margin-top:2px">UK School Intelligence Platform</div>
        </td></tr>
        <tr><td style="padding:32px">
          <h1 style="margin:0 0 16px;color:#0f172a;font-size:22px;font-weight:700">${title}</h1>
          ${body}
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0">
          <p style="color:#94a3b8;font-size:12px;margin:0">Student Signal · hello@studentsignal.co.uk<br>If you did not register on Student Signal, please ignore this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const templates: Record<string, { subject: string; html: string; text: string }> = {
    pending: {
      subject: `Registration received — ${schoolName}`,
      html: wrap('Registration received', `
        <p style="color:#475569;font-size:15px;margin:0 0 12px">Dear ${recipientName},</p>
        <p style="color:#475569;font-size:15px;margin:0 0 16px">Thank you for registering <strong>${schoolName}</strong> on Student Signal.</p>
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px;margin-bottom:16px">
          <p style="margin:0;color:#92400e;font-size:14px"><strong>Your application is under review.</strong> We typically complete verification within 1–2 working days and will email you once it's done.</p>
        </div>
        ${customNote}
        <p style="color:#475569;font-size:14px;margin:0">To speed up verification, reply with your school's 6-digit DfE URN (find it at <a href="https://get-information-schools.service.gov.uk" style="color:#0d9488">get-information-schools.service.gov.uk</a>).</p>`),
      text: `Dear ${recipientName},\n\nThank you for registering ${schoolName} on Student Signal.\n\nYour application is under review. We typically complete verification within 1–2 working days.\n${customNoteTxt}\nTo speed up verification, reply with your school's 6-digit DfE URN.\n\nBest regards,\nStudent Signal`,
    },
    domain_verified: {
      subject: `Email domain verified — ${schoolName}`,
      html: wrap('Email domain verified', `
        <p style="color:#475569;font-size:15px;margin:0 0 12px">Dear ${recipientName},</p>
        <p style="color:#475569;font-size:15px;margin:0 0 16px">Your school email domain has been <strong>automatically verified</strong> for <strong>${schoolName}</strong>.</p>
        <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:16px;margin-bottom:16px">
          <p style="margin:0;color:#166534;font-size:14px">Your account is active. You can sign in and start exploring Student Signal right away.</p>
        </div>
        ${customNote}
        <p style="color:#475569;font-size:14px;margin:0">Full URN verification can be completed separately for additional trust signals on your profile.</p>`),
      text: `Dear ${recipientName},\n\nYour school email domain has been automatically verified for ${schoolName}.\n\nYour account is active. Sign in to access Student Signal.\n${customNoteTxt}\nBest regards,\nStudent Signal`,
    },
    urn_verified: {
      subject: `URN verified — ${schoolName}`,
      html: wrap('URN verified on DfE register', `
        <p style="color:#475569;font-size:15px;margin:0 0 12px">Dear ${recipientName},</p>
        <p style="color:#475569;font-size:15px;margin:0 0 16px"><strong>${schoolName}</strong> has been verified against the DfE GIAS register.</p>
        <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:16px;margin-bottom:16px">
          <p style="margin:0;color:#166534;font-size:14px"><strong>Your account is fully verified.</strong> Sign in to upload your student data and invite your pastoral team.</p>
        </div>
        ${customNote}`),
      text: `Dear ${recipientName},\n\n${schoolName} has been verified against the DfE GIAS register.\n\nYour account is fully verified. Sign in to get started.\n${customNoteTxt}\nBest regards,\nStudent Signal`,
    },
    verified: {
      subject: `Your school is verified — ${schoolName}`,
      html: wrap('School verified', `
        <p style="color:#475569;font-size:15px;margin:0 0 12px">Dear ${recipientName},</p>
        <p style="color:#475569;font-size:15px;margin:0 0 16px">We're pleased to confirm that <strong>${schoolName}</strong> has been <strong>fully verified</strong> on Student Signal.</p>
        <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:16px;margin-bottom:16px">
          <p style="margin:0;color:#166534;font-size:14px">Your account is ready. Sign in, upload your MIS data, and invite your pastoral team to get started.</p>
        </div>
        ${customNote}
        <table cellpadding="0" cellspacing="0" style="margin-top:20px"><tr><td style="background:#0f766e;border-radius:8px;padding:12px 24px"><a href="https://studentsignal.co.uk/auth" style="color:#ffffff;font-size:14px;font-weight:600;text-decoration:none">Sign in to Student Signal →</a></td></tr></table>`),
      text: `Dear ${recipientName},\n\n${schoolName} has been fully verified on Student Signal.\n\nSign in to upload your data and invite your team: https://studentsignal.co.uk/auth\n${customNoteTxt}\nBest regards,\nStudent Signal`,
    },
    rejected: {
      subject: `Registration update — ${schoolName}`,
      html: wrap('Verification unsuccessful', `
        <p style="color:#475569;font-size:15px;margin:0 0 12px">Dear ${recipientName},</p>
        <p style="color:#475569;font-size:15px;margin:0 0 16px">We were unable to complete verification of <strong>${schoolName}</strong> on Student Signal.</p>
        ${customNote}
        <p style="color:#475569;font-size:14px;margin:0">Please contact <a href="mailto:hello@studentsignal.co.uk" style="color:#0d9488">hello@studentsignal.co.uk</a> to resolve this and re-apply.</p>`),
      text: `Dear ${recipientName},\n\nWe were unable to complete verification of ${schoolName}.\n${customNoteTxt}\nContact hello@studentsignal.co.uk to resolve this.\n\nBest regards,\nStudent Signal`,
    },
    welcome: {
      subject: `Welcome to Student Signal — ${schoolName}`,
      html: wrap('Welcome to Student Signal', `
        <p style="color:#475569;font-size:15px;margin:0 0 12px">Dear ${recipientName},</p>
        <p style="color:#475569;font-size:15px;margin:0 0 16px">Welcome! Your account for <strong>${schoolName}</strong> is set up and ready.</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-bottom:16px">
          <p style="margin:0 0 8px;color:#334155;font-size:14px;font-weight:600">Next steps:</p>
          <ol style="margin:0;padding-left:18px;color:#475569;font-size:14px;line-height:1.8">
            <li>Sign in at <a href="https://studentsignal.co.uk/auth" style="color:#0d9488">studentsignal.co.uk</a></li>
            <li>Upload your MIS data (Arbor, ClassCharts, SIMS)</li>
            <li>Invite your pastoral team from User Management</li>
          </ol>
        </div>
        ${customNote}
        <table cellpadding="0" cellspacing="0" style="margin-top:20px"><tr><td style="background:#0f766e;border-radius:8px;padding:12px 24px"><a href="https://studentsignal.co.uk/auth" style="color:#ffffff;font-size:14px;font-weight:600;text-decoration:none">Get started →</a></td></tr></table>`),
      text: `Dear ${recipientName},\n\nWelcome! Your account for ${schoolName} is ready.\n\n1. Sign in at https://studentsignal.co.uk/auth\n2. Upload your MIS data\n3. Invite your team\n${customNoteTxt}\nBest regards,\nStudent Signal`,
    },
  };

  return templates[action] ?? templates.pending;
}

// ─── SMTP sender (nodemailer) ─────────────────────────────────────────────────

async function sendViaSmtp(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}) {
  // @deno-types="npm:@types/nodemailer@6"
  const nodemailer = await import("npm:nodemailer@6");
  const transporter = nodemailer.createTransport({
    host: params.host,
    port: params.port,
    secure: params.port === 465,
    auth: { user: params.user, pass: params.pass },
  });
  await transporter.sendMail({
    from: params.from,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      school_id,
      recipient_email,
      recipient_name,
      school_name,
      action,
      custom_message,
    } = body;

    if (!recipient_email || !school_name || !action) {
      return new Response(
        JSON.stringify({ error: "recipient_email, school_name, and action are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const email = buildEmail(action, {
      recipientName: recipient_name || "School Administrator",
      schoolName: school_name,
      customMessage: custom_message,
    });

    const smtpPass = Deno.env.get("SMTP_PASS");
    const smtpHost = "smtp.office365.com";
    const smtpPort = 587;
    const smtpUser = "hello@studentsignal.co.uk";
    const smtpFrom = "Student Signal <hello@studentsignal.co.uk>";

    let sent = false;
    let deliveryError: string | null = null;
    const senderConfigured = !!smtpPass;

    if (smtpPass) {
      try {
        await sendViaSmtp({
          to: recipient_email,
          subject: email.subject,
          html: email.html,
          text: email.text,
          host: smtpHost,
          port: smtpPort,
          user: smtpUser,
          pass: smtpPass,
          from: smtpFrom,
        });
        sent = true;
      } catch (err) {
        deliveryError = (err as Error).message;
        console.error("[send-verification-email] SMTP error:", deliveryError);
      }
    } else {
      console.log(`[send-verification-email] No sender configured — preview only. To: ${recipient_email} | Subject: ${email.subject}`);
    }

    // Update school verification status in DB if school_id provided
    if (school_id) {
      const STATUS_MAP: Record<string, string> = {
        verified: "verified", domain_verified: "domain_verified",
        pending: "pending", manual_review: "manual_review",
        rejected: "rejected", urn_verified: "urn_verified",
      };
      if (STATUS_MAP[action]) {
        const supabaseAdmin = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        await supabaseAdmin
          .from("schools")
          .update({ verification_status: STATUS_MAP[action] })
          .eq("id", school_id);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent,
        sender_configured: senderConfigured,
        sender_type: smtpPass ? "smtp" : null,
        delivery_error: deliveryError,
        email_preview: {
          to: recipient_email,
          subject: email.subject,
          html: email.html,
          text: email.text,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

