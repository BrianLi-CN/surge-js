
/**
 * Just My Socks Pro
 * Surge Mac 6.12.0+
 *
 * 数据来源：Bandwidth Counter API
 * 功能：总量、已用、剩余、使用率、
 *       重置日期、剩余天数、流量状态
 */

// ==================================
// 1. 读取模块参数
// ==================================

const args = String(
    typeof $argument === "string" ? $argument : ""
).split("|");

const CONFIG = {
    url: (args[0] || "").trim(),
    plan: (args[1] || "Just My Socks").trim(),
    policy: (args[2] || "DIRECT").trim(),
    timeout: 12
};

const BASE_COLOR = "#8B5CF6";

// ==================================
// 2. 通用函数
// ==================================

function isNumber(value) {
    return typeof value === "number" &&
        Number.isFinite(value);
}

function toNumber(value) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return NaN;
    }

    return Number(value);
}

// JMS 使用十进制流量单位
// 1 GB = 1,000,000,000 Bytes
function formatBytes(bytes) {
    if (!isNumber(bytes)) return "--";

    if (bytes >= 1e12) {
        return (bytes / 1e12).toFixed(2) + " TB";
    }

    if (bytes >= 1e9) {
        return (bytes / 1e9).toFixed(2) + " GB";
    }

    if (bytes >= 1e6) {
        return (bytes / 1e6).toFixed(2) + " MB";
    }

    if (bytes >= 1e3) {
        return (bytes / 1e3).toFixed(2) + " KB";
    }

    return bytes.toFixed(0) + " B";
}

// 字符进度条
function progressBar(percent, length = 20) {
    const safe = Math.max(0, Math.min(100, percent));
    const filled = Math.round(safe / 100 * length);

    return "▰".repeat(filled) +
        "▱".repeat(length - filled);
}

// 根据流量使用率判断状态
function usageStatus(percent) {
    if (percent >= 100) {
        return {
            text: "流量已耗尽",
            icon: "exclamationmark.triangle.fill",
            color: "#EF4444"
        };
    }

    if (percent >= 90) {
        return {
            text: "即将耗尽",
            icon: "exclamationmark.triangle.fill",
            color: "#F97316"
        };
    }

    if (percent >= 75) {
        return {
            text: "使用量偏高",
            icon: "chart.bar.fill",
            color: "#F59E0B"
        };
    }

    return {
        text: "流量充足",
        icon: "server.rack",
        color: BASE_COLOR
    };
}

// ==================================
// 3. 洛杉矶日期与重置倒计时
// ==================================

// 按美国洛杉矶日历计算，
// 避免本机时区造成日期偏差。
function getLADate() {
    const parts = new Intl.DateTimeFormat(
        "en-US",
        {
            timeZone: "America/Los_Angeles",
            year: "numeric",
            month: "numeric",
            day: "numeric"
        }
    ).formatToParts(new Date());

    const result = {};

    parts.forEach(function(p) {
        if (p.type !== "literal") {
            result[p.type] = Number(p.value);
        }
    });

    return {
        year: result.year,
        month: result.month,
        day: result.day
    };
}

function monthLength(year, month) {
    return new Date(
        Date.UTC(year, month, 0)
    ).getUTCDate();
}

function getResetInfo(resetDay) {
    if (
        !Number.isInteger(resetDay) ||
        resetDay < 1 ||
        resetDay > 31
    ) {
        return null;
    }

    const now = getLADate();

    function candidate(year, month) {
        const day = Math.min(
            resetDay,
            monthLength(year, month)
        );

        return {
            year: year,
            month: month,
            day: day
        };
    }

    let next = candidate(
        now.year,
        now.month
    );

    // 当月重置日已经到达或经过
    // 则显示下一次重置
    if (now.day >= next.day) {
        let year = now.year;
        let month = now.month + 1;

        if (month > 12) {
            month = 1;
            year++;
        }

        next = candidate(year, month);
    }

    const todayUTC = Date.UTC(
        now.year,
        now.month - 1,
        now.day
    );

    const nextUTC = Date.UTC(
        next.year,
        next.month - 1,
        next.day
    );

    const days = Math.round(
        (nextUTC - todayUTC) / 86400000
    );

    return {
        resetDay: resetDay,
        date: next.year + "-" +
            String(next.month).padStart(2, "0") + "-" +
            String(next.day).padStart(2, "0"),
        days: days
    };
}

// ==================================
// 4. 面板结果
// ==================================

let completed = false;

function finish(data) {
    if (completed) return;
    completed = true;
    $done(data);
}

function fail(message) {
    finish({
        title: "Just My Socks · 查询失败",
        content: String(message),
        icon: "exclamationmark.triangle.fill",
        "icon-color": "#EF4444"
    });
}

function render(data) {
    const total = toNumber(
        data.monthly_bw_limit_b
    );

    const used = toNumber(
        data.bw_counter_b
    );

    const resetDay = toNumber(
        data.bw_reset_day_of_month
    );

    if (
        !isNumber(total) ||
        total <= 0 ||
        !isNumber(used) ||
        used < 0
    ) {
        fail(
            "API 流量数据不完整或无效。\n" +
            "请检查 monthly_bw_limit_b 和 bw_counter_b。"
        );
        return;
    }

    const remaining = Math.max(
        0,
        total - used
    );

    const percent = used / total * 100;
    const percentText = percent.toFixed(2);

    const status = usageStatus(percent);
    const reset = getResetInfo(resetDay);

    const lines = [];

    lines.push("━━━ 📦 套餐信息 ━━━");
    lines.push("📋 套餐：" + CONFIG.plan);
    lines.push("📊 总流量：" + formatBytes(total));

    lines.push("");
    lines.push("━━━ 📈 流量统计 ━━━");
    lines.push("🔺 已使用：" + formatBytes(used));
    lines.push("🟢 剩余量：" + formatBytes(remaining));
    lines.push("📉 使用率：" + percentText + "%");
    lines.push(progressBar(percent));
    lines.push("🩺 状态：" + status.text);

    lines.push("");
    lines.push("━━━ 📅 流量重置 ━━━");

    if (reset) {
        lines.push(
            "🔄 重置周期：每月 " +
            reset.resetDay + " 日"
        );

        lines.push(
            "📆 预计下次：" +
            reset.date
        );

        lines.push(
            "⏳ 剩余：" + reset.days +
            " 天"
        );
    } else {
        lines.push("重置日期：API 未提供");
    }

    lines.push("🌎 时区：美国洛杉矶");
    lines.push("");

    lines.push("━━━ ⚙️ 查询信息 ━━━");
    lines.push("🌐 请求策略：" + CONFIG.policy);

    const updated = new Date().toLocaleString(
        "zh-CN",
        {
            hour12: false
        }
    );

    lines.push("🕒 更新时间：" + updated);

    finish({
        title: CONFIG.plan +
            " · 剩余 " + formatBytes(remaining),
        content: lines.join("\n"),
        icon: status.icon,
        "icon-color": status.color
    });
}

// ==================================
// 5. 请求 JMS Bandwidth API
// ==================================

function main() {
    if (!CONFIG.url) {
        fail(
            "尚未设置 API_URL。\n" +
            "请在 Surge 模块参数中填写\n" +
            "Bandwidth Counter API 完整链接。"
        );
        return;
    }

    if (!/^https:\/\//i.test(CONFIG.url)) {
        fail(
            "API_URL 必须为 HTTPS 链接。\n" +
            "请复制 JMS 后台提供的原始地址。"
        );
        return;
    }

    $httpClient.get(
        {
            url: CONFIG.url,
            policy: CONFIG.policy,
            timeout: CONFIG.timeout,
            headers: {
                "Accept": "application/json"
            }
        },
        function(error, response, body) {
            if (error) {
                fail(
                    "流量 API 请求失败。\n" +
                    String(error) +
                    "\n请检查网络及请求策略。"
                );
                return;
            }

            const status = Number(
                response &&
                (response.status || response.statusCode)
            );

            if (status && status !== 200) {
                fail(
                    "HTTP 状态码：" + status +
                    "\n请检查 API 地址是否有效。"
                );
                return;
            }

            let data;

            try {
                data = typeof body === "string"
                    ? JSON.parse(body)
                    : body;
            } catch (e) {
                fail(
                    "API 未返回有效 JSON。\n" +
                    "请确认填写的是 Bandwidth Counter API，" +
                    "而非节点订阅 URL。"
                );
                return;
            }

            if (!data || typeof data !== "object") {
                fail("API 返回数据格式不正确。");
                return;
            }

            try {
                render(data);
            } catch (e) {
                fail(
                    "处理流量数据失败：" +
                    String(e.message || e)
                );
            }
        }
    );
}

try {
    main();
} catch (e) {
    fail(
        "脚本执行异常：" +
        String(e.message || e)
    );
}
