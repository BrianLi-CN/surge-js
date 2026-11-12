
/**
 * YunShu Pro - Internal Network Monitor
 * Surge Mac 6.12.0+
 *
 * 检测：
 * 1. Mac 本地网络信息
 * 2. YunShu SOCKS5 代理 HTTP 转发
 * 3. 云枢 VPN 内网 HTTP 服务可用性
 * 4. 内网域名 / IP 服务对比
 *
 * 不需要 MITM，不修改 Surge 配置。
 */

const params = String(
    typeof $argument === "string" ? $argument : ""
).split("|");

const CONFIG = {
    proxy: (params[0] || "🪜 YunShu").trim(),
    publicURL: (params[1] ||
        "http://www.gstatic.com/generate_204").trim(),
    internalURL: (params[2] || "").trim(),
    internalIPURL: (params[3] || "").trim(),
    timeout: 9
};

const net = typeof $network !== "undefined"
    ? $network : {};

const env = typeof $environment !== "undefined"
    ? $environment : {};

const v4 = net.v4 || {};
const wifi = net.wifi || {};

const COLORS = {
    good: "#14B8A6",
    warning: "#F59E0B",
    error: "#EF4444"
};

let completed = false;

// -------------------------------
// 工具函数
// -------------------------------

function str(value, fallback = "--") {
    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return fallback;
    }
    return String(value);
}

function short(value, max = 55) {
    const s = str(value);
    return s.length > max
        ? s.slice(0, max - 1) + "…"
        : s;
}

function safeHost(url) {
    if (!url) return "未配置";

    // 不在面板中显示路径、Token 和查询参数
    const match = url.match(
        /^https?:\/\/([^/?#]+)/i
    );

    return match ? match[1] : "地址无效";
}

function validURL(url) {
    return /^https?:\/\/[^/?#\s]+/i.test(url);
}

function finish(data) {
    if (completed) return;
    completed = true;
    $done(data);
}

function finishError(message) {
    finish({
        title: "YunShu Pro · 运行异常",
        content: String(message),
        icon: "exclamationmark.triangle.fill",
        "icon-color": COLORS.error
    });
}

// -------------------------------
// HTTP 探测
// -------------------------------

function httpProbe(name, url, policy, callback) {
    if (!url) {
        callback({
            name: name,
            state: "unconfigured",
            message: "未配置"
        });
        return;
    }

    if (!validURL(url)) {
        callback({
            name: name,
            state: "error",
            message: "URL 格式无效"
        });
        return;
    }

    const started = Date.now();

    try {
        $httpClient.get({
            url: url,
            policy: policy,
            timeout: CONFIG.timeout,
            headers: {
                "Accept": "*/*",
                "Cache-Control": "no-cache"
            }
        }, function(error, response, body) {
            const elapsed = Date.now() - started;

            if (error) {
                callback({
                    name: name,
                    state: "error",
                    ms: elapsed,
                    message: short(error, 80)
                });
                return;
            }

            const status = Number(
                response && (
                    response.status ||
                    response.statusCode
                )
            );

            if (!Number.isFinite(status) ||
                status < 100) {
                callback({
                    name: name,
                    state: "error",
                    ms: elapsed,
                    message: "HTTP 响应状态无效"
                });
                return;
            }

            // HTTP 成功，包括重定向。
            if (status >= 200 && status < 400) {
                callback({
                    name: name,
                    state: "ok",
                    ms: elapsed,
                    code: status,
                    message: "HTTP 响应正常"
                });
                return;
            }

            // 401/403 是可达，但认证不通过。
            if (status === 401 || status === 403) {
                callback({
                    name: name,
                    state: "warning",
                    ms: elapsed,
                    code: status,
                    message: "服务可达，需认证"
                });
                return;
            }

            if (status >= 400 && status < 500) {
                callback({
                    name: name,
                    state: "warning",
                    ms: elapsed,
                    code: status,
                    message: "服务可达，客户端请求异常"
                });
                return;
            }

            callback({
                name: name,
                state: "error",
                ms: elapsed,
                code: status,
                message: "HTTP 服务端异常"
            });
        });
    } catch (e) {
        callback({
            name: name,
            state: "error",
            message: short(e, 80)
        });
    }
}

// -------------------------------
// 状态显示
// -------------------------------

function statusText(result) {
    if (!result) return "未检测";

    switch (result.state) {
        case "ok":
            return "正常";
        case "warning":
            return "警告";
        case "error":
            return "失败";
        case "unconfigured":
            return "未配置";
        default:
            return "未知";
    }
}

function addProbe(lines, label, result) {
    lines.push(label + "：" + statusText(result));

    if (!result || result.state === "unconfigured") {
        return;
    }

    if (result.code) {
        lines.push("  HTTP 状态：" + result.code);
    }

    if (Number.isFinite(result.ms)) {
        lines.push("  请求耗时：" + result.ms + " ms");
    }

    if (result.state !== "ok" && result.message) {
        lines.push("  提示：" + result.message);
    }
}

// -------------------------------
// 面板输出
// -------------------------------

function render(results) {
    const lines = [];

    const publicResult = results.public;
    const internalResult = results.internal;
    const ipResult = results.internalIP;

    const internalChecks = [
        internalResult,
        ipResult
    ].filter(r => r && r.state !== "unconfigured");

    const hasInternal = internalChecks.length > 0;

    const internalOK = internalChecks.some(
        r => r.state === "ok"
    );

    const internalWarning = internalChecks.some(
        r => r.state === "warning"
    );

    const allInternalOK =
        hasInternal &&
        internalChecks.every(r => r.state === "ok");

    const publicOK = publicResult &&
        publicResult.state === "ok";

    let level = "good";
    let summary = "未完成内网验证";

    if (!publicOK) {
        level = "error";
        summary = "YunShu 公网探测异常";
    } else if (!hasInternal) {
        level = "warning";
        summary = "代理可用 · 内网待验证";
    } else if (allInternalOK) {
        summary = "已配置内网检查均正常";
    } else if (internalOK || internalWarning) {
        level = "warning";
        summary = "部分内网检查异常";
    } else {
        level = "error";
        summary = "内网 HTTP 检查失败";
    }

    lines.push("━━━ 本地网络 ━━━");
    lines.push("Wi-Fi：" + str(wifi.ssid, "未获取"));
    lines.push("网络接口：" + str(v4.primaryInterface));
    lines.push("本机 IPv4：" + str(v4.primaryAddress));
    lines.push("默认网关：" + str(v4.primaryRouter));

    lines.push("");
    lines.push("━━━ YunShu 代理 ━━━");
    lines.push("代理策略：" + CONFIG.proxy);
    lines.push("测试地址：" + safeHost(CONFIG.publicURL));
    addProbe(lines, "公网转发", publicResult);

    lines.push("");
    lines.push("━━━ 企业内网 ━━━");
    lines.push("域名服务：" + safeHost(CONFIG.internalURL));
    addProbe(lines, "域名 HTTP", internalResult);

    lines.push("");
    lines.push("IP 服务：" + safeHost(CONFIG.internalIPURL));
    addProbe(lines, "IP HTTP", ipResult);

    lines.push("");
    lines.push("━━━ 链路状态 ━━━");
    lines.push("代理公网：" +
        (publicOK ? "正常" : "异常"));

    if (!hasInternal) {
        lines.push("云枢 VPN：未验证");
    } else if (allInternalOK) {
        lines.push("云枢 VPN 链路：内网 HTTP 可访问");
    } else {
        lines.push(
            "云枢 VPN 链路：部分或全部检测异常"
        );
    }

    if (internalResult &&
        internalResult.state === "ok") {
        lines.push("内网域名访问：成功");
    } else if (!CONFIG.internalURL) {
        lines.push("内网域名访问：未配置");
    } else {
        lines.push("内网域名访问：未确认");
    }

    lines.push("");
    lines.push("━━━ 系统信息 ━━━");
    lines.push("Surge：" +
        str(env["surge-version"]));
    lines.push("Build：" +
        str(env["surge-build"]));

    lines.push("更新时间：" +
        new Date().toLocaleString("zh-CN", {
            hour12: false
        })
    );

    const color = COLORS[level];

    finish({
        title: "YunShu Pro · " + summary,
        content: lines.join("\n"),
        icon: level === "error"
            ? "network.slash"
            : "network.badge.shield.half.filled",
        "icon-color": color
    });
}

// -------------------------------
// 运行三个检测任务
// -------------------------------

function main() {
    const results = {};
    let pending = 3;

    function complete(key, value) {
        if (completed) return;
        results[key] = value;
        pending--;

        if (pending === 0) {
            try {
                render(results);
            } catch (e) {
                finishError(
                    "面板渲染失败：" +
                    String(e.message || e)
                );
            }
        }
    }

    httpProbe(
        "公网转发",
        CONFIG.publicURL,
        CONFIG.proxy,
        result => complete("public", result)
    );

    httpProbe(
        "内网域名",
        CONFIG.internalURL,
        CONFIG.proxy,
        result => complete("internal", result)
    );

    httpProbe(
        "内网 IP",
        CONFIG.internalIPURL,
        CONFIG.proxy,
        result => complete("internalIP", result)
    );
}

try {
    main();
} catch (e) {
    finishError(
        "脚本执行失败：" +
        String(e.message || e)
    );
}
