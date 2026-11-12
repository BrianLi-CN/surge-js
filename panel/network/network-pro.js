
/**
 * Network Pro - Auto Policy
 * Surge Mac 6.12.0+
 *
 * 只读网络信息面板
 * 不修改 Surge 策略、DNS 或代理配置
 */

const SHOW_SSID =
    String(typeof $argument === "string"
        ? $argument
        : "true").toLowerCase() !== "false";

const IP_API = "https://ipwho.is/";
const TIMEOUT = 10;

const net = typeof $network !== "undefined"
    ? $network : {};

const env = typeof $environment !== "undefined"
    ? $environment : {};

const v4 = net.v4 || {};
const v6 = net.v6 || {};
const wifi = net.wifi || {};
const dns = Array.isArray(net.dns) ? net.dns : [];

const result = {
    direct: null,
    proxy: null,
    mode: "unknown",
    policy: null,
    selected: null,
    selections: {},
    note: ""
};

function str(v, fallback = "--") {
    return v === undefined || v === null || v === ""
        ? fallback : String(v);
}

function shorten(v, max = 42) {
    const s = str(v);
    return s.length > max ? s.slice(0, max) + "…" : s;
}

// 获取 select 策略组信息
function getGroupDetails() {
    try {
        const data = $surge.selectGroupDetails();
        return data && data.decisions ? data : {
            groups: {}, decisions: {}
        };
    } catch (e) {
        console.log("获取策略组失败: " + e);
        return {groups: {}, decisions: {}};
    }
}

function chooseMainGroup(details) {
    const decisions = details.decisions || {};
    const names = Object.keys(decisions);

    result.selections = decisions;

    if (!names.length) {
        result.note = "没有可读取的 select 策略组";
        return null;
    }

    // 优先识别常见的主代理策略组名称
    const exactNames = [
        "PROXY", "Proxy", "proxy",
        "🚀 节点选择", "🚀 节点代理",
        "节点选择", "代理选择",
        "代理节点", "主代理",
        "GLOBAL", "Global"
    ];

    for (const name of exactNames) {
        if (Object.prototype.hasOwnProperty.call(
            decisions, name
        )) {
            result.selected = decisions[name];
            return name;
        }
    }

    // 匹配包含明确代理语义的组名
    const candidates = names.filter(name =>
        /proxy|代理|节点选择|主线路/i.test(name)
    );

    if (candidates.length === 1) {
        const name = candidates[0];
        result.selected = decisions[name];
        return name;
    }

    // 只有一个选择组时，可安全选用
    if (names.length === 1) {
        const name = names[0];
        result.selected = decisions[name];
        return name;
    }

    result.note =
        "存在多个策略组，无法唯一确定主代理组";
    return null;
}

// IP 检测
function testIP(policy, callback) {
    const started = Date.now();

    $httpClient.get({
        url: IP_API,
        policy: policy,
        timeout: TIMEOUT,
        headers: {Accept: "application/json"}
    }, (error, response, body) => {
        const elapsed = Date.now() - started;

        if (error) {
            callback({
                ok: false,
                ms: elapsed,
                error: String(error)
            });
            return;
        }

        try {
            const status = Number(
                response && (
                    response.status || response.statusCode
                )
            );

            if (status !== 200) {
                throw new Error("HTTP " + status);
            }

            const data = typeof body === "string"
                ? JSON.parse(body) : body;

            if (!data || !data.success || !data.ip) {
                throw new Error(
                    str(data && data.message, "IP API 响应无效")
                );
            }

            callback({
                ok: true,
                ms: elapsed,
                data: data
            });

        } catch (e) {
            callback({
                ok: false,
                ms: elapsed,
                error: String(e.message || e)
            });
        }
    });
}

// 查询出站模式，自动确定代理
function detectPolicy(callback) {
    const groups = getGroupDetails();

    $httpAPI("GET", "/v1/outbound", null, data => {
        const mode = data && data.mode;
        result.mode = mode || "unknown";

        if (mode === "direct") {
            result.note = "当前为全局直连模式";
            callback(null);
            return;
        }

        if (mode === "proxy") {
            $httpAPI(
                "GET",
                "/v1/outbound/global",
                null,
                globalData => {
                    const policy = globalData && globalData.policy;

                    if (policy) {
                        result.policy = policy;
                        result.selected =
                            groups.decisions[policy] || policy;
                        callback(policy);
                    } else {
                        result.note = "无法读取全局代理策略";
                        callback(null);
                    }
                }
            );
            return;
        }

        if (mode === "rule") {
            const group = chooseMainGroup(groups);

            if (group) {
                result.policy = group;
            }

            callback(group);
            return;
        }

        result.note = "无法读取 Surge 出站模式";
        callback(null);
    });
}

// 并发探测
let remaining = 2;

function finishOne() {
    remaining--;
    if (remaining === 0) render();
}

testIP("DIRECT", value => {
    result.direct = value;
    finishOne();
});

detectPolicy(policy => {
    if (!policy || policy === "DIRECT") {
        result.proxy = {
            skipped: true
        };
        finishOne();
        return;
    }

    testIP(policy, value => {
        result.proxy = value;
        finishOne();
    });
});

// 出口信息
function addIP(lines, label, value) {
    lines.push("");
    lines.push(label);

    if (!value || value.skipped) {
        lines.push("  未执行代理探测");
        return;
    }

    if (!value.ok) {
        lines.push("  ❌ " + shorten(value.error, 70));
        return;
    }

    const d = value.data;
    const c = d.connection || {};

    lines.push("  IP：" + str(d.ip));
    lines.push(
        "  位置：" +
        [
            d.flag && d.flag.emoji,
            d.country,
            d.region,
            d.city
        ].filter(Boolean).join(" ")
    );
    lines.push("  运营商：" + shorten(c.isp));
    lines.push("  ASN：" +
        (c.asn ? "AS" + c.asn : "--"));
    lines.push("  组织：" + shorten(c.org));
    lines.push("  HTTP 耗时：" + value.ms + " ms");
}

function render() {
    const lines = [];

    lines.push("━━━ 🖥 本地网络 ━━━");

    if (SHOW_SSID) {
        lines.push("📶 Wi-Fi：" + str(wifi.ssid));
    }

    lines.push(
        "🔌 网络接口：" + str(v4.primaryInterface)
    );
    lines.push(
        "🏠 本机 IPv4：" + str(v4.primaryAddress)
    );
    lines.push(
        "🚪 默认网关：" + str(v4.primaryRouter)
    );
    lines.push(
        "🌐 IPv6：" + str(
            v6.primaryAddress, "未启用或不可用"
        )
    );

    lines.push("");
    lines.push("━━━ 🧭 DNS ━━━");
    lines.push(
        dns.length ? dns.join(" · ") : "未获取到系统 DNS"
    );

    addIP(lines, "━━━ 🌍 直连出口 ━━━", result.direct);
    addIP(lines, "━━━ 🛡 代理出口 ━━━", result.proxy);

    lines.push("");
    lines.push("━━━ 🔀 Surge 代理策略 ━━━");

    const modeNames = {
        rule: "规则模式",
        proxy: "全局代理",
        direct: "全局直连"
    };

    lines.push(
        "出站模式：" +
        (modeNames[result.mode] || "未知")
    );

    lines.push(
        "自动识别策略：" + str(result.policy)
    );

    lines.push(
        "当前选择：" + str(result.selected)
    );

    if (result.note) {
        lines.push("提示：" + result.note);
    }

    // 展示其他 select 策略组
    const selections = result.selections;
    const names = Object.keys(selections);

    if (names.length) {
        lines.push("");
        lines.push("━━━ 📋 其他策略选择 ━━━");

        names.filter(n => n !== result.policy)
            .slice(0, 8)
            .forEach(name => {
                lines.push(
                    shorten(name, 20) + " → " +
                    shorten(selections[name], 28)
                );
            });
    }

    lines.push("");
    lines.push("━━━ 🩺 状态检查 ━━━");

    lines.push(
        "直连：" +
        (result.direct && result.direct.ok
            ? "✅ 正常" : "❌ 异常")
    );

    if (result.proxy && !result.proxy.skipped) {
        lines.push(
            "代理：" +
            (result.proxy.ok ? "✅ 正常" : "❌ 异常")
        );

        if (
            result.direct && result.direct.ok &&
            result.proxy.ok
        ) {
            const same =
                result.direct.data.ip === result.proxy.data.ip;

            lines.push(
                "出口 IP：" +
                (same ? "⚠️ 相同" : "✅ 不同")
            );
        }
    }

    lines.push("");
    lines.push("━━━ ⚙️ 系统信息 ━━━");
    lines.push("系统：" + str(env.system));
    lines.push(
        "Surge：" + str(env["surge-version"])
    );
    lines.push(
        "Build：" + str(env["surge-build"])
    );
    lines.push(
        "更新：" + new Date().toLocaleString("zh-CN", {
            hour12: false
        })
    );

    const directOK = result.direct && result.direct.ok;
    const proxyFailed =
        result.proxy &&
        !result.proxy.skipped &&
        !result.proxy.ok;

    $done({
        title: "🌐 Network Pro · 自动策略",
        content: lines.join("\n"),
        style: !directOK ? "error" :
            proxyFailed ? "alert" : "info"
    });
}
