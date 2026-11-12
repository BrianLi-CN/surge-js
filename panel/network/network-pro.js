
/**
 * Network Pro - Surge Information Panel
 * Surge Mac 6.12.0+
 *
 * 功能：
 * 本地 IPv4 / IPv6 / Wi-Fi / Gateway / DNS
 * 直连和代理公网 IP、位置、ISP、ASN
 * HTTP 探测耗时、策略组选择、版本信息
 *
 * 不需要 API Key，不修改任何 Surge 配置。
 */

// ================================
// 1. 模块参数
// ================================

const args = String(
    typeof $argument === "string"
        ? $argument
        : ""
).split("|");

const CONFIG = {
    proxy: (args[0] || "DIRECT").trim(),
    group: (args[1] || "PROXY").trim(),
    showSSID: (args[2] || "true")
        .trim().toLowerCase() === "true"
};

const API_URL = "https://ipwho.is/";

const TIMEOUT = 9;

// ================================
// 2. Surge 环境
// ================================

const network =
    typeof $network !== "undefined"
        ? $network
        : {};

const environment =
    typeof $environment !== "undefined"
        ? $environment
        : {};

const ipv4 = network.v4 || {};
const ipv6 = network.v6 || {};
const wifi = network.wifi || {};

const systemDNS = Array.isArray(network.dns)
    ? network.dns
    : [];

// ================================
// 3. 工具函数
// ================================

function text(value, fallback = "--") {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return fallback;
    }

    return String(value);
}

function shorten(value, max = 38) {
    const result = text(value);
    return result.length > max
        ? result.slice(0, max - 1) + "…"
        : result;
}

function locationText(data) {
    if (!data) return "--";

    return [
        data.flag && data.flag.emoji,
        data.country,
        data.region,
        data.city
    ].filter(Boolean).join(" ");
}

function getGroups() {
    try {
        if (
            typeof $surge === "undefined" ||
            !$surge.selectGroupDetails
        ) {
            return {};
        }

        const details = $surge.selectGroupDetails();

        return details && details.decisions
            ? details.decisions
            : {};
    } catch (e) {
        console.log("查询策略组失败：" + e);
        return {};
    }
}

// ================================
// 4. 请求出口 IP 信息
// ================================

function requestIP(policy, callback) {
    const start = Date.now();

    $httpClient.get(
        {
            url: API_URL,
            policy: policy,
            timeout: TIMEOUT,
            headers: {
                Accept: "application/json"
            }
        },
        function(error, response, body) {
            const elapsed = Date.now() - start;

            if (error) {
                callback({
                    ok: false,
                    latency: elapsed,
                    error: String(error)
                });
                return;
            }

            const status = Number(
                response && (
                    response.status ||
                    response.statusCode
                )
            );

            if (status !== 200) {
                callback({
                    ok: false,
                    latency: elapsed,
                    error: "HTTP " + status
                });
                return;
            }

            try {
                const data = typeof body === "string"
                    ? JSON.parse(body)
                    : body;

                if (
                    !data ||
                    data.success !== true ||
                    !data.ip
                ) {
                    throw new Error(
                        data && data.message
                            ? data.message
                            : "API 未返回有效 IP"
                    );
                }

                callback({
                    ok: true,
                    latency: elapsed,
                    data: data
                });

            } catch (e) {
                callback({
                    ok: false,
                    latency: elapsed,
                    error: String(e.message || e)
                });
            }
        }
    );
}

// ================================
// 5. 准备结果
// ================================

const results = {
    direct: null,
    proxy: null
};

const CHECK_PROXY =
    CONFIG.proxy.toUpperCase() !== "DIRECT";

let pending = CHECK_PROXY ? 2 : 1;
let finished = false;

// 防止异步回调重复完成
function complete(type, result) {
    if (finished) return;

    results[type] = result;
    pending--;

    if (pending <= 0) {
        finished = true;
        render();
    }
}

// 分别执行两个出口探测
requestIP("DIRECT", function(result) {
    complete("direct", result);
});

if (CHECK_PROXY) {
    requestIP(CONFIG.proxy, function(result) {
        complete("proxy", result);
    });
}

// ================================
// 6. 格式化出口结果
// ================================

function appendIP(lines, title, result) {
    lines.push("");
    lines.push(title);

    if (!result) {
        lines.push("  状态：尚未取得结果");
        return;
    }

    if (!result.ok) {
        lines.push("  状态：❌ 检测失败");
        lines.push(
            "  原因：" + shorten(result.error, 65)
        );
        return;
    }

    const data = result.data;
    const conn = data.connection || {};

    lines.push("  IP：" + text(data.ip));
    lines.push(
        "  位置：" + locationText(data)
    );
    lines.push(
        "  运营商：" + shorten(
            conn.isp || conn.org || "--"
        )
    );
    lines.push(
        "  ASN：" + (
            conn.asn !== undefined
                ? "AS" + conn.asn
                : "--"
        )
    );
    lines.push(
        "  组织：" + shorten(conn.org)
    );
    lines.push(
        "  探测耗时：" + result.latency + " ms"
    );
}

// ================================
// 7. 生成 Panel
// ================================

function render() {
    const lines = [];

    // 本地网络信息
    lines.push("━━━ 🖥 本地网络 ━━━");

    if (CONFIG.showSSID) {
        lines.push(
            "📶 Wi-Fi：" + text(wifi.ssid, "未获取")
        );
    }

    lines.push(
        "🔌 IPv4 网卡：" + text(ipv4.primaryInterface)
    );

    lines.push(
        "🏠 本机 IPv4：" + text(ipv4.primaryAddress)
    );

    lines.push(
        "🚪 默认网关：" + text(ipv4.primaryRouter)
    );

    lines.push(
        "🌐 IPv6 地址：" + text(
            ipv6.primaryAddress,
            "未启用或不可用"
        )
    );

    if (ipv6.primaryInterface) {
        lines.push(
            "🔌 IPv6 网卡：" + ipv6.primaryInterface
        );
    }

    // DNS
    lines.push("");
    lines.push("━━━ 🧭 DNS 配置 ━━━");

    if (systemDNS.length) {
        systemDNS.forEach(function(server, i) {
            lines.push(
                "DNS " + (i + 1) + "：" + server
            );
        });
    } else {
        lines.push("DNS：未获取到系统 DNS");
    }

    // 直连出口
    appendIP(
        lines,
        "━━━ 🌍 直连出口 DIRECT ━━━",
        results.direct
    );

    // 代理出口
    if (CHECK_PROXY) {
        appendIP(
            lines,
            "━━━ 🛡 代理出口 ━━━",
            results.proxy
        );

        lines.push(
            "  测试策略：" + CONFIG.proxy
        );
    }

    // 策略组
    lines.push("");
    lines.push("━━━ 🔀 Surge 策略 ━━━");

    const decisions = getGroups();
    const selected = decisions[CONFIG.group];

    lines.push(
        "策略组：" + CONFIG.group
    );

    lines.push(
        "当前选择：" + text(
            selected,
            "未找到或非 select 策略组"
        )
    );

    // 状态检测
    lines.push("");
    lines.push("━━━ 🩺 网络诊断 ━━━");

    const directOK =
        results.direct && results.direct.ok;

    const proxyOK =
        results.proxy && results.proxy.ok;

    lines.push(
        "直连出口：" +
        (directOK ? "✅ 正常" : "❌ 异常")
    );

    if (CHECK_PROXY) {
        lines.push(
            "代理出口：" +
            (proxyOK ? "✅ 正常" : "❌ 异常")
        );

        if (directOK && proxyOK) {
            const sameIP =
                results.direct.data.ip ===
                results.proxy.data.ip;

            lines.push(
                "出口 IP 对比：" +
                (sameIP
                    ? "⚠️ 相同"
                    : "✅ 不同")
            );
        }
    }

    // 运行环境
    lines.push("");
    lines.push("━━━ ⚙️ 系统信息 ━━━");

    lines.push(
        "系统：" + text(environment.system)
    );

    lines.push(
        "Surge：" +
        text(environment["surge-version"])
    );

    lines.push(
        "Build：" +
        text(environment["surge-build"])
    );

    const now = new Date();

    lines.push(
        "更新时间：" +
        now.toLocaleString("zh-CN", {
            hour12: false
        })
    );

    // Panel 状态图标
    let style = "good";

    if (!directOK) {
        style = "error";
    } else if (CHECK_PROXY && !proxyOK) {
        style = "alert";
    }

    let title = "🌐 Network Pro";

    if (directOK) {
        title += " · " + results.direct.data.ip;
    }

    // 输出
    $done({
        title: title,
        content: lines.join("\n"),
        style: style
    });
}
