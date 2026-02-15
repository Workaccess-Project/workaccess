// backend/config/email.js

function env(name, fallback = "") {
  return (process.env[name] ?? fallback).toString().trim();
}

export const EMAIL_FROM = env("EMAIL_FROM", "no-reply@workaccess.local");

export const SMTP_HOST = env("SMTP_HOST", "");
export const SMTP_PORT = Number(env("SMTP_PORT", "587")) || 587;
export const SMTP_USER = env("SMTP_USER", "");
export const SMTP_PASS = env("SMTP_PASS", "");
export const SMTP_SECURE = env("SMTP_SECURE", "").toLowerCase() === "true";

export const HAS_SMTP =
  !!SMTP_HOST && !!SMTP_PORT && !!SMTP_USER && !!SMTP_PASS;
