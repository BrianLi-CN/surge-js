
/**
 * YunShu Pro v2.0
 * Surge Mac 6.12.0
 *
 * Surge -> Ubuntu GOST -> YunShu VPN -> LAN
 *
 * 只读监控，不修改策略、路由或服务状态。
 */

const args = String(
    typeof $argument === "string" ? $argument : ""
).split("|");

const CFG = {
    proxy: (args[0] || "🪜 YunShu").trim(),
    publicURL: (args[1] ||
        "http://www.gstatic.com/generate_204").trim(),
    domainURL: (args[2] || "").trim(),
    ipURL: (args[3] || "").trim(),
    healthURL: (args[4] || "").trim(),
    timeout: 8
};

const net = typeof $network !== "undefined"
    ? $network : {};

const COLORS = {
    ok: "#14B8A6",
    warn: "#F59E0B",
    fail: "#EF4444",
    unknown: "#64748B"
};

const results = {};
const tasks = [
    ["public", "公网转发", CFG.publicURL, CFG.proxy],
    ["domain", "内网域名", CFG.domainURL, CFG.proxy],
    ["ip", "内网IP", CFG.ipURL, CFG.proxy],
    ["health", "Ubuntu健康", CFG.healthURL, "DIRECT"]
];

let pending = tasks.length;
let finished = false;

// -------------------------------
// 工具函数
// -------------------------------

function str(value, fallback = "--") {
    if (value === undefined ||
        value === null ||
        value === "") {
        return fallback;
    }
    return String(value);
}

function compact(value, max = 55) {
    const s = str(value);
    return s.length > max
        ? s.slice(0, max - 1) + "…"
        : s;
}

function isURL(value) {
    return /^https?:\/\/[^/?#\s]+/i.test(value);
}

function host(value) {
    if (!value) return "未配置";
    const match = value.match(
        /^https?:\/\/([^/?#]+)/i
    );
    return match ? match[1] : "地址无效";
}

function number(value, digits = 1) {
    return typeof value === "number" &&
    Number.isFinite(value)
        ? value.toFixed(digits)
        : "--";
}

function latencyLevel(ms) {
    if (typeof ms !== "number") return "未知";
    if (ms < 150) return "快速";
    if (ms < 500) return "正常";
    if (ms < 1000) return "偏慢";
    return "较慢";
}

function statusName(r) {
    if (!r) return "未检测";

    switch (r.state) {
        case "ok": return "正常";
        case "warn": return "警告";
        case "fail": return "失败";
        case "skip": return "未配置";
        default: return "未知";
    }
}

function safeFinish(data) {
    if (finished) return;
    finished = true;
    $done(data);
}

function complete(key, result) {
    if (finished || results[key]) return;

    results[key] = result;
    pending--;

    if (pending === 0) {
        try {
            render();
        } catch (e) {
            safeFinish({
                title: "YunShu Pro · 脚本异常",
                content: compact(e.message || e, 150),
                icon: "exclamationmark.triangle.fill",
                "icon-color": COLORS.fail
            });
        }
    }
}

// -------------------------------
// HTTP 探测
// -------------------------------

function probe(key, label, url, policy) {
    if (!url) {
        complete(key, {
            state: "skip",
            label: label
        });
        return;
    }

    if (!isURL(url)) {
        complete(key, {
            state: "fail",
            label: label,
            error: "地址格式错误"
        });
        return;
    }

    const started = Date.now();
    let called = false;

    function returnOnce(r) {
        if (called) return;
        called = true;
        complete(key, r);
    }

    try {
        $httpClient.get({
            url: url,
            policy: policy,
            timeout: CFG.timeout,
            "auto-redirect": false,
            headers: {
                "Accept": "application/json, */*",
                "Cache-Control": "no-cache"
            }
        }, function(error, response, body) {
            const ms = Date.now() - started;

            if (error) {
                returnOnce({
                    state: "fail",
                    label: label,
                    ms: ms,
                    error: compact(error, 90)
                });
                return;
            }

            const code = Number(
                response && (
                    response.status || response.statusCode
                )
            );

            if (!Number.isFinite(code) || code < 100) {
                returnOnce({
                    state: "fail",
                    label: label,
                    ms: ms,
                    error: "无有效HTTP状态码"
                });
                return;
            }

            let state = "fail";
            let reason = "";


            if (code >= 200 && code < 300) {
                state = "ok";
            } else if (code >= 300 && code < 400) {
                // 内网连通性检测允许 HTTP 重定向
                // 不代表最终业务页面已经验证成功
                if (key === "domain" || key === "ip") {
                    state = "ok";
                    reason = "服务可达（HTTP 重定向）";
                } else {
                    state = "warn";
                    reason = "服务返回重定向";
                }
            } else if (code === 401 || code === 403) {
                state = "warn";
                reason = "服务可达但需要授权";
            } else if (code >= 400 && code < 500) {
                state = "warn";
                reason = "服务可达但请求被拒绝";
            } else {
                reason = "服务端HTTP异常";
            }

            const result = {
                state: state,
                label: label,
                ms: ms,
                code: code,
                error: reason
            };

            // 仅健康接口解析约定的 JSON
            if (key === "health" && state === "ok") {
                try {
                    const data = typeof body === "string"
                        ? JSON.parse(body)
                        : body;

                    if (!data ||
                        typeof data !== "object" ||
                        Array.isArray(data)) {
                        throw new Error("无效健康数据");
                    }

                    result.health = data;

                    // 有明确的失败标志时不能判定健康
                    if (data.gost && data.gost.running === false) {
                        result.state = "fail";
                        result.error = "GOST进程未运行";
                    }

                    if (data.vpn && data.vpn.connected === false) {
                        result.state = "fail";
                        result.error = "VPN报告未连接";
                    }

                } catch (e) {
                    result.state = "warn";
                    result.error = "健康接口JSON无效";
                }
            }

            returnOnce(result);
        });

    } catch (e) {
        returnOnce({
            state: "fail",
            label: label,
            error: compact(e.message || e)
        });
    }
}

// -------------------------------
// 健康结果展示
// -------------------------------

function addProbe(lines, title, url, r) {
    lines.push("");
    lines.push("━━━ " + title + " ━━━");
    lines.push("目标：" + host(url));
    lines.push("状态：" + statusName(r));

    if (!r || r.state === "skip") return;

    if (r.code) {
        lines.push("HTTP：" + r.code);
    }

    if (typeof r.ms === "number") {
        lines.push(
            "耗时：" + r.ms + " ms · " +
            latencyLevel(r.ms)
        );
    }

    if (r.error) {
        lines.push("说明：" + compact(r.error));
    }
}

function addHostInfo(lines, r) {
    if (!r || !r.health) return;

    const d = r.health;
    const gost = d.gost || {};
    const vpn = d.vpn || {};
    const system = d.system || {};

    lines.push("");
    lines.push("━━━ Ubuntu运行状态 ━━━");

    lines.push("GOST进程：" +
        (typeof gost.running === "boolean"
            ? (gost.running ? "运行中" : "已停止")
            : "未提供"));

    lines.push("GOST版本：" +
        str(gost.version));

    lines.push("SOCKS5端口：" +
        str(gost.port));

    lines.push("VPN状态：" +
        (typeof vpn.connected === "boolean"
            ? (vpn.connected ? "已连接" : "未连接")
            : "未提供"));

    lines.push("VPN接口：" +
        str(vpn.interface));

    lines.push("CPU占用：" +
        (typeof system.cpu_percent === "number"
            ? number(system.cpu_percent) + "%"
            : "--"));

    lines.push("内存使用：" +
        (typeof system.memory_percent === "number"
            ? number(system.memory_percent) + "%"
            : "--"));

    lines.push("运行时间：" +
        str(system.uptime));
}

// -------------------------------
// 汇总诊断
// -------------------------------

function diagnose() {
    const pub = results.public;
    const domain = results.domain;
    const ip = results.ip;
    const health = results.health;

    const internal = [domain, ip].filter(
        r => r && r.state !== "skip"
    );

    const internalOK = internal.some(
        r => r.state === "ok"
    );

    const internalAllOK =
        internal.length > 0 &&
        internal.every(r => r.state === "ok");

    const internalAllFail =
        internal.length > 0 &&
        internal.every(r => r.state === "fail");

    const notes = [];
    let level = "unknown";
    let summary = "待配置内网检测";

    if (internalAllOK) {
        level = "ok";
        summary = "内网检测正常";
    } else if (internalOK) {
        level = "warn";
        summary = "内网部分异常";
    } else if (internalAllFail) {
        level = "fail";
        summary = "内网检测失败";
    } else if (internal.length > 0) {
        level = "warn";
        summary = "内网服务有告警";
    } else if (pub && pub.state === "ok") {
        level = "warn";
        summary = "代理可用·内网未验证";
    } else if (pub && pub.state === "fail") {
        level = "warn";
        summary = "代理测试异常·内网未验证";
    }

    if (internal.length > 0) {
        if (domain.state === "fail" && ip.state === "ok") {
            notes.push(
                "IP服务正常、域名服务失败；检查DNS或域名服务。"
            );
        } else if (
            domain.state === "ok" &&
            ip.state === "fail"
        ) {
            notes.push(
                "域名服务正常、IP服务失败；检查IP目标或端口。"
            );
        } else if (internalAllFail) {
            notes.push(
                "内网目标均失败；检查代理、VPN路由及内网服务。"
            );
        }
    }

    if (pub && pub.state === "fail" && internalOK) {
        notes.push(
            "内网可用，公网探测失败不代表VPN故障。"
        );
    }

    if (health && health.health) {
        const h = health.health;

        if (h.gost && h.gost.running === false) {
            level = "fail";
            summary = "GOST服务异常";
        }

        if (h.vpn && h.vpn.connected === false) {
            level = "fail";
            summary = "VPN状态异常";
        }
    }

    return {
        level: level,
        summary: summary,
        notes: notes
    };
}

// -------------------------------
// 渲染面板
// -------------------------------

function render() {
    const lines = [];
    const v4 = net.v4 || {};
    const wifi = net.wifi || {};

    const state = diagnose();

    lines.push("━━━ 本地网络 ━━━");
    lines.push("Wi-Fi：" + str(wifi.ssid));
    lines.push("接口：" + str(v4.primaryInterface));
    lines.push("Mac IP：" + str(v4.primaryAddress));
    lines.push("网关：" + str(v4.primaryRouter));

    lines.push("");
    lines.push("━━━ 代理配置 ━━━");
    lines.push("策略：" + CFG.proxy);
    lines.push("GOST：SOCKS5 / TCP");
    lines.push("UDP：未进行协议测试");

    addProbe(
        lines, "公网转发",
        CFG.publicURL, results.public
    );

    addProbe(
        lines, "企业内网域名",
        CFG.domainURL, results.domain
    );

    addProbe(
        lines, "企业内网IP",
        CFG.ipURL, results.ip
    );

    if (CFG.healthURL) {
        addProbe(
            lines, "Ubuntu健康接口",
            CFG.healthURL, results.health
        );
        addHostInfo(lines, results.health);
    }

    lines.push("");
    lines.push("━━━ 综合诊断 ━━━");
    lines.push("结果：" + state.summary);

    state.notes.forEach(function(note) {
        lines.push("提示：" + note);
    });

    const icon = state.level === "fail"
        ? "network.slash"
        : "network";

    safeFinish({
        title: "YunShu Pro · " + state.summary,
        content: lines.join("\n"),
        icon: icon,
        "icon-color": COLORS[state.level]
    });
}

// -------------------------------
// 启动
// -------------------------------

tasks.forEach(function(task) {
    probe(task[0], task[1], task[2], task[3]);
});

// 总超时保护，避免一直显示初始文本
setTimeout(function() {
    if (finished) return;

    tasks.forEach(function(task) {
        const key = task[0];

        if (!results[key]) {
            results[key] = {
                state: "fail",
                error: "检测超过总等待时间"
            };
        }
    });

    try {
        render();
    } catch (e) {
        safeFinish({
            title: "YunShu Pro · 检测异常",
            content: compact(e.message || e, 150),
            icon: "network.slash",
            "icon-color": COLORS.fail
        });
    }
}, 27000);
