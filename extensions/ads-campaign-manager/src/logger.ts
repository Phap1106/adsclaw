import * as winstonModule from "winston";
const winston: any = (winstonModule as any).format ? winstonModule : (winstonModule as any).default;
import path from "node:path";

const redactFormat = winston.format((info: any) => {
  const sensitiveKeys = ["fb_password", "fb_2fa_secret", "access_token", "fb_password_enc", "fb_2fa_secret_enc"];
  const msg = typeof info.message === "string" ? info.message : "";
  
  // Redact Meta Tokens (EAAG...)
  let sanitized = msg.replace(/EAAG[a-zA-Z0-9._-]{30,}/g, "[REDACTED_TOKEN]");
  
  // Redact fields in metadata
  for (const key of sensitiveKeys) {
    if (info[key]) info[key] = "[REDACTED]";
  }

  info.message = sanitized;
  return info;
});

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    redactFormat(),
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: "meta-auth" },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ 
      filename: "logs/meta-auth-error.log", 
      level: "error" 
    }),
    new winston.transports.File({ 
      filename: "logs/meta-auth-combined.log" 
    })
  ]
});

export default logger;
