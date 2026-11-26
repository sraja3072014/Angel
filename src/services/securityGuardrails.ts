export interface SanitizeResult {
  safe: boolean;
  sanitizedArgs: Record<string, unknown>;
  blockedReason?: string;
}

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /system\s*prompt\s*override/i,
  /<\s*script\b/i,
  /\$\([^)]*\)/, // shell command substitution
  /`[^`]+`/, // backtick shell injection
  /;\s*(rm\s+-rf|del\s+\/f|format\s+[a-z]:|powershell\s+-enc)/i,
  /\b(exfiltrate|steal|dump)\s+(env|secrets|api[_\s]?key|password)\b/i,
];

/**
 * Lightweight Tool Input Sanitizer (inspired by agent-scan / 0security)
 * to block prompt-injection and shell-injection attempts in MCP / OS tool arguments.
 */
export function sanitizeToolArguments(
  toolName: string,
  args: Record<string, unknown>
): SanitizeResult {
  const sanitized: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(args || {})) {
    if (typeof val === "string") {
      for (const pattern of INJECTION_PATTERNS) {
        if (pattern.test(val)) {
          return {
            safe: false,
            sanitizedArgs: {},
            blockedReason: `Security Guardrail blocked suspicious pattern in "${toolName}.${key}" (${pattern.source}).`,
          };
        }
      }
      sanitized[key] = val.replace(/\0/g, "").trim();
    } else {
      sanitized[key] = val;
    }
  }

  return { safe: true, sanitizedArgs: sanitized };
}

/**
 * Sliding-window API Rate Limiter preventing runaway token burn.
 */
class TokenRateLimiter {
  private timestamps: number[] = [];
  private readonly maxRequestsPerMinute: number;

  constructor(maxRequestsPerMinute = 30) {
    this.maxRequestsPerMinute = maxRequestsPerMinute;
  }

  public checkAndConsume(bucket = "default"): { allowed: boolean; retryAfterMs: number } {
    const now = Date.now();
    const windowStart = now - 60_000;
    this.timestamps = this.timestamps.filter((t) => t > windowStart);

    if (this.timestamps.length >= this.maxRequestsPerMinute) {
      const oldest = this.timestamps[0] || now;
      return {
        allowed: false,
        retryAfterMs: Math.max(500, 60_000 - (now - oldest)),
      };
    }

    if (bucket) {
      this.timestamps.push(now);
    }
    return { allowed: true, retryAfterMs: 0 };
  }
}

export const apiRateLimiter = new TokenRateLimiter(30);
