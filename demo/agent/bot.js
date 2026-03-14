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

import TelegramBot from "node-telegram-bot-api";

let bot = null;
let chatId = null;
let approvalThreshold = 0.05; // Default: 0.05 STX — spends above this need approval
const pendingApprovals = new Map(); // requestId → { resolve, reject, details }

/**
 * Initialize the Telegram bot
 * @param {string} token - Bot token from BotFather
 * @param {string} savedChatId - Optional pre-saved chat ID
 * @param {number} threshold - Initial approval threshold in STX
 */
export async function initBot(token, savedChatId, threshold) {
    if (bot) {
        try {
            bot.removeAllListeners();
            await bot.stopPolling();
        } catch (e) {
            console.error("Error stopping previous bot polling:", e.message);
        }
        bot = null;
    }

    if (!token) {
        console.log("   ⚠️  No TELEGRAM_BOT_TOKEN — bot disabled");
        return false;
    }

    bot = new TelegramBot(token, { polling: true });
    if (savedChatId) chatId = savedChatId;
    if (threshold !== undefined) approvalThreshold = threshold;

    // ─── /start command ───────────────────────────
    bot.onText(/\/start/, (msg) => {
        chatId = msg.chat.id.toString();
        console.log(`   📱 Telegram chat registered: ${chatId}`);
        bot.sendMessage(chatId, [
            "🛡️ *Kova Guard Bot* connected!",
            "",
            `Your Chat ID: \`${chatId}\``,
            `Current threshold: *${approvalThreshold} STX*`,
            "",
            "I'll notify you when your agent wants to make a payment above the threshold.",
            "",
            "*Commands:*",
            "/setthreshold 0.1 — Set threshold (in STX)",
            "/threshold — Show current threshold",
            "/status — Show bot status",
        ].join("\n"), { parse_mode: "Markdown" });
    });

    // ─── /setthreshold command ────────────────────
    bot.onText(/\/setthreshold (.+)/, (msg, match) => {
        const value = parseFloat(match[1]);
        if (isNaN(value) || value < 0) {
            bot.sendMessage(msg.chat.id, "❌ Invalid threshold. Use: /setthreshold 0.1");
            return;
        }
        approvalThreshold = value;
        chatId = msg.chat.id.toString();
        bot.sendMessage(msg.chat.id, [
            `✅ Approval threshold set to *${value} STX*`,
            "",
            value === 0
                ? "⚠️ All payments will require approval."
                : `Payments above ${value} STX will require your approval.`,
        ].join("\n"), { parse_mode: "Markdown" });
    });

    // ─── /threshold command ───────────────────────
    bot.onText(/\/threshold$/, (msg) => {
        bot.sendMessage(msg.chat.id, `🔔 Current threshold: *${approvalThreshold} STX*\n\nUse /setthreshold X to change.`, { parse_mode: "Markdown" });
    });

    // ─── /status command ──────────────────────────
    bot.onText(/\/status/, (msg) => {
        const pending = pendingApprovals.size;
        bot.sendMessage(msg.chat.id, [
            "🤖 *Kova Guard Bot Status*",
            "",
            `Chat ID: \`${msg.chat.id}\``,
            `Threshold: *${approvalThreshold} STX*`,
            `Pending approvals: ${pending}`,
            `Bot: ✅ Online`,
        ].join("\n"), { parse_mode: "Markdown" });
    });

    // ─── Handle approval button callbacks ─────────
    bot.on("callback_query", (query) => {
        const [action, requestId] = query.data.split(":");
        const pending = pendingApprovals.get(requestId);

        if (!pending) {
            bot.answerCallbackQuery(query.id, { text: "⏰ This request has expired." });
            return;
        }

        if (action === "approve") {
            pending.resolve(true);
            pendingApprovals.delete(requestId);
            bot.answerCallbackQuery(query.id, { text: "✅ Approved!" });
            bot.editMessageText(
                `✅ *APPROVED*\n\n${pending.details}\n\n_Approved at ${new Date().toLocaleTimeString()}_`,
                {
                    chat_id: query.message.chat.id,
                    message_id: query.message.message_id,
                    parse_mode: "Markdown",
                }
            );
        } else if (action === "reject") {
            pending.resolve(false);
            pendingApprovals.delete(requestId);
            bot.answerCallbackQuery(query.id, { text: "❌ Rejected!" });
            bot.editMessageText(
                `❌ *REJECTED*\n\n${pending.details}\n\n_Rejected at ${new Date().toLocaleTimeString()}_`,
                {
                    chat_id: query.message.chat.id,
                    message_id: query.message.message_id,
                    parse_mode: "Markdown",
                }
            );
        }
    });

    console.log(`   🤖 Telegram bot started (threshold: ${approvalThreshold} STX)`);
    return true;
}

/**
 * Check if a spend requires approval and if so, ask via Telegram
 * @param {number} amountMicroSTX - Amount in µSTX
 * @param {string} serviceName - Service being paid
 * @param {string} serviceAddr - Service address
 * @returns {Promise<boolean>} true if approved (or auto-approved), false if rejected
 */
export async function requestApproval(amountMicroSTX, serviceName, serviceAddr) {
    const amountSTX = amountMicroSTX / 1_000_000;

    // No bot? Auto-approve everything
    if (!bot || !chatId) {
        return true;
    }

    // Below threshold? Auto-approve
    if (amountSTX <= approvalThreshold) {
        console.log(`   ✅ Auto-approved (${amountSTX} STX ≤ ${approvalThreshold} STX threshold)`);
        // Still notify, but don't require approval
        bot.sendMessage(chatId, [
            `📋 *Auto-approved payment*`,
            "",
            `Amount: *${amountSTX.toFixed(4)} STX*`,
            `Service: \`${serviceName}\``,
            `Address: \`${serviceAddr.slice(0, 10)}...${serviceAddr.slice(-6)}\``,
            "",
            `_Below your ${approvalThreshold} STX threshold_`,
        ].join("\n"), { parse_mode: "Markdown" });
        return true;
    }

    // Above threshold — require approval
    const requestId = Date.now().toString(36);
    const details = [
        `Amount: *${amountSTX.toFixed(4)} STX*`,
        `Service: \`${serviceName}\``,
        `Address: \`${serviceAddr}\``,
    ].join("\n");

    console.log(`   ⏳ Requesting Telegram approval for ${amountSTX} STX...`);

    return new Promise((resolve) => {
        pendingApprovals.set(requestId, { resolve, details });

        bot.sendMessage(chatId, [
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

        // Auto-reject after 2 minutes
        setTimeout(() => {
            if (pendingApprovals.has(requestId)) {
                pendingApprovals.delete(requestId);
                resolve(false);
                bot.sendMessage(chatId, "⏰ Approval request expired (2 min timeout). Payment rejected.");
            }
        }, 120_000);
    });
}

/**
 * Send a notification (no approval needed)
 */
export function notify(message) {
    if (bot && chatId) {
        bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
    }
}

/**
 * Get current threshold
 */
export function getThreshold() {
    return approvalThreshold;
}

/**
 * Check if bot is active
 */
export function isBotActive() {
    return bot !== null && chatId !== null;
}
