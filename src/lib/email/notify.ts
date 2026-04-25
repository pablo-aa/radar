import "server-only";
import { getResendClient, getResendFrom } from "./resend";
import {
  renderAnamnesisDone,
  renderStrategistDone,
  renderRunError,
} from "./templates";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://radar.pabloaa.com";

export async function sendAnamnesisDone(args: {
  toEmail: string;
  toName: string | null;
}): Promise<void> {
  const reportUrl = `${SITE_URL}/report`;
  const { subject, html, text } = renderAnamnesisDone({ ...args, reportUrl });
  await sendEmail({ to: args.toEmail, subject, html, text });
}

export async function sendStrategistDone(args: {
  toEmail: string;
  toName: string | null;
}): Promise<void> {
  // Land on /report so the user sees the editorial Anamnesis report first.
  // /report's destination guard then routes returning users (report_seen=true)
  // straight to /radar.
  const landingUrl = `${SITE_URL}/report`;
  const { subject, html, text } = renderStrategistDone({ ...args, landingUrl });
  await sendEmail({ to: args.toEmail, subject, html, text });
}

export async function sendRunError(args: {
  toEmail: string;
  toName: string | null;
  step: "anamnesis" | "strategist";
}): Promise<void> {
  const retryUrl = `${SITE_URL}/radar`;
  const { subject, html, text } = renderRunError({ ...args, retryUrl });
  await sendEmail({ to: args.toEmail, subject, html, text });
}

async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  try {
    const client = getResendClient();
    const from = getResendFrom();
    const result = await client.emails.send({
      from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
    if (result.error) {
      console.warn("[email/notify] send failed", {
        code: result.error.name,
        message: result.error.message,
      });
      return;
    }
    console.log("[email/notify] sent", {
      to: args.to.replace(/(.{2}).+(@.+)/, "$1***$2"),
      subject: args.subject,
    });
  } catch (err) {
    console.warn(
      "[email/notify] send threw",
      err instanceof Error ? err.message : err,
    );
  }
}
