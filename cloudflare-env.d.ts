declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    QWEN_API_KEY?: string;
    QWEN_API_ENDPOINT?: string;
    QWEN_FAST_MODEL?: string;
    QWEN_PLAN_MODEL?: string;
    QWEN_VISION_MODEL?: string;
    DEEPSEEK_API_KEY?: string;
    ADMIN_EMAIL?: string;
  }
}
