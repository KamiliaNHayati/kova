/**
 * ╔══════════════════════════════════════════════════╗
 * ║  Kova Guard Bot — Telegram Human-in-the-Loop    ║
 * ║  Sends approval requests for large agent spends ║
 * ╚══════════════════════════════════════════════════╝
 *
 * Commands:
 *   /start          — Register your chat for notifications
 *   /setthreshold X — Set approval threshold (in STX)
 *   /threshold      — Show current threshold
 *   /status         — Show bot status
 */

// --- patch start: improved bot init, error handlers, await sendMessage, robust notify/approval ---
import TelegramBot from "node-telegram-bot-api";

let bot = null;
let chatId = null;
let approvalThreshold = 0.05;
const pendingApprovals = new Map();

// Helper to attach safe event handlers
function attachBotHandlers(b) {
  b.on("polling_error", (err) => {
    console.error("[bot] polling_error:", err && err.message ? err.message : err);
  });
  b.on("webhook_error", (err) => {
    console.error("[bot] webhook_error:", err && err.message ? err.message : err);
  });
  b.on("error", (err) => {
    console.error("[bot] general error:", err && err.message ? err.message : err);
  });
}

/**
 * Initialize the Telegram bot
 * - returns true if bot started AND we successfully sent a test message (if savedChatId given)
 * - returns false if token missing or sending to savedChatId failed
 */
export async function initBot(token, savedChatId, threshold) {
  // stop previous bot (if any)
  if (bot) {
    try {
      bot.removeAllListeners();
      await bot.stopPolling();
    } catch (e) {
      console.error("[initBot] Error stopping previous bot polling:", e && e.message ? e.message : e);
    }
    bot = null;
  }

  if (!token) {
    console.log("   ⚠️  No TELEGRAM_BOT_TOKEN — bot disabled");
    return false;
  }

  try {
    // create new bot and attach handlers
    bot = new TelegramBot(token, { polling: true });
    attachBotHandlers(bot);

    if (threshold !== undefined) approvalThreshold = threshold;

    // ✅ Register /start handler HERE, after bot is created
    bot.onText(/\/start/, (msg) => {
        chatId = msg.chat.id.toString();
        console.log(`📱 Telegram chat registered: ${chatId}`);
        if (onChatIdRegistered) onChatIdRegistered(chatId);
        bot.sendMessage(chatId, 
            `🛡️ *Kova Guard Bot* connected!\n\nYour Chat ID: \`${chatId}\`\n\nPaste this in the Kova UI → Settings → Notifications → Chat ID field.`, 
            { parse_mode: "Markdown" }
        );
    });
    
    if (savedChatId) {
      // Try to send a small test message to validate the chat ID & bot token
      try {
        const cid = savedChatId.toString();
        await bot.sendMessage(cid, "🛡️ *Kova Guard Bot* connected!\n\nThis is a confirmation message from Kova.", { parse_mode: "Markdown" });
        chatId = cid;
        console.log(`   📱 Telegram chat validated and registered: ${chatId}`);
      } catch (e) {
        console.error("[initBot] failed to send test message to savedChatId:", e && e.message ? e.message : e);
        // keep bot instance running (so UI can still call /test), but treat init as failed to signal caller
        return false;
      }
    } else {
      console.log("   🤖 Telegram bot started (no chatId provided). Waiting for /start to register chat.");
    }

    console.log(`   🤖 Telegram bot started (threshold: ${approvalThreshold} STX)`);
    return true;
  } catch (err) {
    console.error("[initBot] failed to start bot:", err && err.message ? err.message : err);
    bot = null;
    return false;
  }
}

/**
 * requestApproval - asks the human for approval, but is resilient:
 * - If bot or chatId missing: auto-approve
 * - If sending the approval message fails: auto-approve (and log)
 */
export async function requestApproval(amountMicroSTX, serviceName, serviceAddr) {
  const amountSTX = amountMicroSTX / 1_000_000;

  // No bot or no chat -> auto-approve
  if (!bot || !chatId) {
    console.warn("[requestApproval] bot or chatId missing -> auto-approving");
    return true;
  }

  if (amountSTX <= approvalThreshold) {
    console.log(`   ✅ Auto-approved (${amountSTX} STX ≤ ${approvalThreshold} STX threshold)`);
    try {
      await bot.sendMessage(chatId, [
        `📋 *Auto-approved payment*`,
        ``,
        `Amount: *${amountSTX.toFixed(4)} STX*`,
        `Service: \`${serviceName}\``,
        `Address: \`${serviceAddr.slice(0, 10)}...${serviceAddr.slice(-6)}\``,
        ``,
        `_Below your ${approvalThreshold} STX threshold_`,
      ].join("\n"), { parse_mode: "Markdown" });
    } catch (e) {
      console.error("[requestApproval] failed to send auto-approve notice:", e && e.message ? e.message : e);
    }
    return true;
  }

  const requestId = Date.now().toString(36);
  const details = [
    `Amount: *${amountSTX.toFixed(4)} STX*`,
    `Service: \`${serviceName}\``,
    `Address: \`${serviceAddr}\``,
  ].join("\n");

  console.log(`   ⏳ Requesting Telegram approval for ${amountSTX} STX...`);

  return new Promise(async (resolve) => {
    pendingApprovals.set(requestId, { resolve, details });

    try {
      await bot.sendMessage(chatId, [
        "🚨 *APPROVAL REQUIRED*",
        "",
        "Your AI agent wants to make a payment:",
        "",
        details,
        "",
        `⚠️ This exceeds your threshold of ${approvalThreshold} STX`,
        "",
        "_Tap a button below:_",
      ].join("\n"), {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[
            { text: "✅ Approve", callback_data: `approve:${requestId}` },
            { text: "❌ Reject", callback_data: `reject:${requestId}` },
          ]],
        },
      });
    } catch (e) {
      // If sending fails, log and auto-approve to avoid blocking payments
      console.error("[requestApproval] failed to send approval request. Auto-approving. Error:", e && e.message ? e.message : e);
      pendingApprovals.delete(requestId);
      return resolve(true);
    }

    // Auto-reject after 2 minutes if no answer
    const timer = setTimeout(() => {
      if (pendingApprovals.has(requestId)) {
        pendingApprovals.delete(requestId);
        resolve(false);
        bot.sendMessage(chatId, "⏰ Approval request expired (2 min timeout). Payment rejected.").catch(() => {});
      }
    }, 120_000);
  });
}

/**
 * notify - send a notification, returns true/false for success
 */
export async function notify(message) {
  if (!bot || !chatId) {
    console.warn("[notify] bot or chatId missing -> notification skipped");
    return false;
  }
  try {
    await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
    return true;
  } catch (e) {
    console.error("[notify] failed to send message:", e && e.message ? e.message : e);
    return false;
  }
}

/* keep your existing helper functions for getThreshold / isBotActive */
export function getThreshold() {
  return approvalThreshold;
}
export function isBotActive() {
  return bot !== null && chatId !== null;
}

let onChatIdRegistered = null;
export function setOnChatIdRegistered(cb) {
    onChatIdRegistered = cb;
}

// --- patch end ---



// import TelegramBot from "node-telegram-bot-api";

// let bot = null;
// let chatId = null;
// let approvalThreshold = 0.05; // Default: 0.05 STX — spends above this need approval
// const pendingApprovals = new Map(); // requestId → { resolve, reject, details }

// /**
//  * Initialize the Telegram bot
//  * @param {string} token - Bot token from BotFather
//  * @param {string} savedChatId - Optional pre-saved chat ID
//  * @param {number} threshold - Initial approval threshold in STX
//  */
// export async function initBot(token, savedChatId, threshold) {
//     if (bot) {
//         try {
//             bot.removeAllListeners();
//             await bot.stopPolling();
//         } catch (e) {
//             console.error("Error stopping previous bot polling:", e.message);
//         }
//         bot = null;
//     }

//     if (!token) {
//         console.log("   ⚠️  No TELEGRAM_BOT_TOKEN — bot disabled");
//         return false;
//     }

//     bot = new TelegramBot(token, { polling: true });
//     if (savedChatId) chatId = savedChatId;
//     if (threshold !== undefined) approvalThreshold = threshold;

//     // ─── /start command ───────────────────────────
//     bot.onText(/\/start/, (msg) => {
//         chatId = msg.chat.id.toString();
//         console.log(`   📱 Telegram chat registered: ${chatId}`);
//         bot.sendMessage(chatId, [
//             "🛡️ *Kova Guard Bot* connected!",
//             "",
//             `Your Chat ID: \`${chatId}\``,
//             `Current threshold: *${approvalThreshold} STX*`,
//             "",
//             "I'll notify you when your agent wants to make a payment above the threshold.",
//             "",
//             "*Commands:*",
//             "/setthreshold 0.1 — Set threshold (in STX)",
//             "/threshold — Show current threshold",
//             "/status — Show bot status",
//         ].join("\n"), { parse_mode: "Markdown" });
//     });

//     // ─── /setthreshold command ────────────────────
//     bot.onText(/\/setthreshold (.+)/, (msg, match) => {
//         const value = parseFloat(match[1]);
//         if (isNaN(value) || value < 0) {
//             bot.sendMessage(msg.chat.id, "❌ Invalid threshold. Use: /setthreshold 0.1");
//             return;
//         }
//         approvalThreshold = value;
//         chatId = msg.chat.id.toString();
//         bot.sendMessage(msg.chat.id, [
//             `✅ Approval threshold set to *${value} STX*`,
//             "",
//             value === 0
//                 ? "⚠️ All payments will require approval."
//                 : `Payments above ${value} STX will require your approval.`,
//         ].join("\n"), { parse_mode: "Markdown" });
//     });

//     // ─── /threshold command ───────────────────────
//     bot.onText(/\/threshold$/, (msg) => {
//         bot.sendMessage(msg.chat.id, `🔔 Current threshold: *${approvalThreshold} STX*\n\nUse /setthreshold X to change.`, { parse_mode: "Markdown" });
//     });

//     // ─── /status command ──────────────────────────
//     bot.onText(/\/status/, (msg) => {
//         const pending = pendingApprovals.size;
//         bot.sendMessage(msg.chat.id, [
//             "🤖 *Kova Guard Bot Status*",
//             "",
//             `Chat ID: \`${msg.chat.id}\``,
//             `Threshold: *${approvalThreshold} STX*`,
//             `Pending approvals: ${pending}`,
//             `Bot: ✅ Online`,
//         ].join("\n"), { parse_mode: "Markdown" });
//     });

//     // ─── Handle approval button callbacks ─────────
//     bot.on("callback_query", (query) => {
//         const [action, requestId] = query.data.split(":");
//         const pending = pendingApprovals.get(requestId);

//         if (!pending) {
//             bot.answerCallbackQuery(query.id, { text: "⏰ This request has expired." });
//             return;
//         }

//         if (action === "approve") {
//             pending.resolve(true);
//             pendingApprovals.delete(requestId);
//             bot.answerCallbackQuery(query.id, { text: "✅ Approved!" });
//             bot.editMessageText(
//                 `✅ *APPROVED*\n\n${pending.details}\n\n_Approved at ${new Date().toLocaleTimeString()}_`,
//                 {
//                     chat_id: query.message.chat.id,
//                     message_id: query.message.message_id,
//                     parse_mode: "Markdown",
//                 }
//             );
//         } else if (action === "reject") {
//             pending.resolve(false);
//             pendingApprovals.delete(requestId);
//             bot.answerCallbackQuery(query.id, { text: "❌ Rejected!" });
//             bot.editMessageText(
//                 `❌ *REJECTED*\n\n${pending.details}\n\n_Rejected at ${new Date().toLocaleTimeString()}_`,
//                 {
//                     chat_id: query.message.chat.id,
//                     message_id: query.message.message_id,
//                     parse_mode: "Markdown",
//                 }
//             );
//         }
//     });

//     console.log(`   🤖 Telegram bot started (threshold: ${approvalThreshold} STX)`);
//     return true;
// }

// /**
//  * Check if a spend requires approval and if so, ask via Telegram
//  * @param {number} amountMicroSTX - Amount in µSTX
//  * @param {string} serviceName - Service being paid
//  * @param {string} serviceAddr - Service address
//  * @returns {Promise<boolean>} true if approved (or auto-approved), false if rejected
//  */
// export async function requestApproval(amountMicroSTX, serviceName, serviceAddr) {
//     const amountSTX = amountMicroSTX / 1_000_000;

//     // No bot? Auto-approve everything
//     if (!bot || !chatId) {
//         return true;
//     }

//     // Below threshold? Auto-approve
//     if (amountSTX <= approvalThreshold) {
//         console.log(`   ✅ Auto-approved (${amountSTX} STX ≤ ${approvalThreshold} STX threshold)`);
//         // Still notify, but don't require approval
//         bot.sendMessage(chatId, [
//             `📋 *Auto-approved payment*`,
//             "",
//             `Amount: *${amountSTX.toFixed(4)} STX*`,
//             `Service: \`${serviceName}\``,
//             `Address: \`${serviceAddr.slice(0, 10)}...${serviceAddr.slice(-6)}\``,
//             "",
//             `_Below your ${approvalThreshold} STX threshold_`,
//         ].join("\n"), { parse_mode: "Markdown" });
//         return true;
//     }

//     // Above threshold — require approval
//     const requestId = Date.now().toString(36);
//     const details = [
//         `Amount: *${amountSTX.toFixed(4)} STX*`,
//         `Service: \`${serviceName}\``,
//         `Address: \`${serviceAddr}\``,
//     ].join("\n");

//     console.log(`   ⏳ Requesting Telegram approval for ${amountSTX} STX...`);

//     return new Promise((resolve) => {
//         pendingApprovals.set(requestId, { resolve, details });

//         bot.sendMessage(chatId, [
//             "🚨 *APPROVAL REQUIRED*",
//             "",
//             "Your AI agent wants to make a payment:",
//             "",
//             details,
//             "",
//             `⚠️ This exceeds your threshold of ${approvalThreshold} STX`,
//             "",
//             "_Tap a button below:_",
//         ].join("\n"), {
//             parse_mode: "Markdown",
//             reply_markup: {
//                 inline_keyboard: [[
//                     { text: "✅ Approve", callback_data: `approve:${requestId}` },
//                     { text: "❌ Reject", callback_data: `reject:${requestId}` },
//                 ]],
//             },
//         });

//         // Auto-reject after 2 minutes
//         setTimeout(() => {
//             if (pendingApprovals.has(requestId)) {
//                 pendingApprovals.delete(requestId);
//                 resolve(false);
//                 bot.sendMessage(chatId, "⏰ Approval request expired (2 min timeout). Payment rejected.");
//             }
//         }, 120_000);
//     });
// }

// /**
//  * Send a notification (no approval needed)
//  */
// export function notify(message) {
//     if (bot && chatId) {
//         bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
//     }
// }

// /**
//  * Get current threshold
//  */
// export function getThreshold() {
//     return approvalThreshold;
// }

// /**
//  * Check if bot is active
//  */
// export function isBotActive() {
//     return bot !== null && chatId !== null;
// }
