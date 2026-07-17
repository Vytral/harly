import "server-only";

/**
 * Minimal Telegram Bot API client. Host is fixed to api.telegram.org , the
 * token never composes an arbitrary URL, so no SSRF surface.
 */

const TELEGRAM_API = "https://api.telegram.org";

type TelegramResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

async function telegramFetch<T>(
  botToken: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => null)) as
      | TelegramResponse<T>
      | null;
    if (!json?.ok) {
      throw new Error(json?.description ?? `Telegram API error (${res.status}).`);
    }
    return json.result as T;
  } finally {
    clearTimeout(timeout);
  }
}

export type TelegramBotInfo = { id: number; username: string };

/** Validate a bot token. Throws with Telegram's message on a bad token. */
export async function getTelegramBotInfo(
  botToken: string,
): Promise<TelegramBotInfo> {
  return telegramFetch<TelegramBotInfo>(botToken, "getMe");
}

/** Send a message to a chat/channel. HTML parse mode for light formatting. */
export async function sendTelegramMessage(opts: {
  botToken: string;
  chatId: string;
  text: string;
}): Promise<void> {
  await telegramFetch(opts.botToken, "sendMessage", {
    chat_id: opts.chatId,
    text: opts.text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}
