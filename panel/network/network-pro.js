
/**
 * Network Pro v1.2
 * Surge Mac 6.12.0
 *
 * 自动检测：
 * - 本地 IP / 网关 / Wi-Fi / DNS
 * - 直连出口 IP、地理位置、ISP、ASN
 * - 当前主代理策略及出口 IP
 *
 * 只读，不修改任何 Surge 配置
 */

const SHOW_SSID =
    String(typeof $argument === "string"
        ? $argument : "true").trim() !== "false";

const API = "https://ipwho.is/";
const network = typeof $network !== "undefined"
    ? $network : {};
const env = typeof $environment !== "undefined"
    ? $environment : {};

const v4 = network.v4 || {};
const v6 = network.v6 || {};
const wifi = network.wifi || {};

const state = {
    direct: null,
    proxy: null,
    policy: null,
    selected: null,
    detail: null,
    reason: "",
    mode: "rule"
};

function str(v, fallback = "--") {
    return v === undefined || v === null || v === ""
        ? fallback : String(v);
}

function short(v, limit = 42) {
    const s = str(v);
    return s.length > limit
        ? s.slice(0, limit - 1) + "…"
        : s;
}

function apiGet(path) {
    return new Promise((resolve) => {
        try {
            $httpAPI("GET", path, null, result => {
                resolve(result || {});
            });
        } catch (e) {
            resolve({});
        }
    });
}

function getSelections() {
    try {
        const d = $surge.selectGroupDetails();
        return d && d.decisions ? d.decisions : {};
    } catch (e) {
        return {};
    }
}

function requestIP(policy) {
    return new Promise(resolve => {
        const start = Date.now();

        $httpClient.get({
            url: API,
            policy: policy,
            timeout: 10,
            headers: {
                Accept: "application/json"
            }
        }, (error, response, body) => {
            const ms = Date.now() - start;

            if (error) {
                resolve({
                    ok: false,
                    ms,
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

                if (!data || data.success !== true || !data.ip) {
                    throw new Error(
                        str(data && data.message, "IP 信息无效")
                    );
                }

                resolve({ok: true, ms, data});
            } catch (e) {
                resolve({
                    ok: false,
                    ms,
                    error: String(e.message || e)
                });
            }
        });
    });
}

// 获取可用代理名称
function getAvailablePolicies(data) {
    const names = new Set(["DIRECT"]);

    (data.proxies || []).forEach(n => names.add(n));
    (data["policy-groups"] || []).forEach(
        n => names.add(n)
    );

    return names;
}

// 获取当前主策略
async function detectPolicy() {
    const [outbound, policies] = await Promise.all([
        apiGet("/v1/outbound"),
        apiGet("/v1/policies?include_external=true")
    ]);

    state.mode = outbound.mode || "rule";

    const valid = getAvailablePolicies(policies);
    const selections = getSelections();

    if (state.mode === "direct") {
        state.selected = "DIRECT";
        state.reason = "当前为全局直连模式";
        return null;
    }

    if (state.mode === "proxy") {
        const global = await apiGet("/v1/outbound/global");
        const name = global.policy;

        if (name && valid.has(name)) {
            state.policy = name;
            state.selected = name;
            return name;
        }

        state.reason = "无法识别全局代理策略";
        return null;
    }

    // 规则模式：优先使用主选择组
    const decisions = selections;
    const keys = Object.keys(decisions);

    const preferred = [
        "Proxy", "PROXY", "proxy",
        "节点选择", "代理选择",
        "🚀 节点选择", "🚀 节点代理"
    ];

    let main = preferred.find(
        n => Object.prototype.hasOwnProperty.call(
            decisions, n
        )
    );

    if (!main && keys.length === 1) {
        main = keys[0];
    }

    if (!main) {
        state.reason = "规则模式没有唯一的主代理选择";
        return null;
    }

    // 当前选中的策略，如 auto
    const chosen = decisions[main];

    state.selected = chosen || main;

    // 如果主组确实存在，优先通过主组检测
    if (valid.has(main)) {
        state.policy = main;
        return main;
    }

    // 你的截图属于这种情况：
    // Proxy 不存在，但选择结果为 auto
    if (chosen && valid.has(chosen)) {
        state.policy = chosen;
        return chosen;
    }

    // 某些策略属于外部策略组，需使用 identifier
    const external = policies["external-policies"] || [];
    const match = external.find(
        item => item.name === chosen && item.identifier
    );

    if (match) {
        state.policy = match.identifier;
        return match.identifier;
    }

    state.reason =
        "当前选择无法映射到可测试的代理策略";

    return null;
}

// 公网出口信息
function addExit(lines, title, result) {
    lines.push("");
    lines.push(title);

    if (!result) {
        lines.push("  未检测");
        return;
    }

    if (!result.ok) {
        lines.push("  ❌ " + short(result.error, 70));
        return;
    }

    const d = result.data;
    const conn = d.connection || {};

    lines.push("IP：" + str(d.ip));

    lines.push("位置：" + [
        d.flag && d.flag.emoji,
        d.country,
        d.region,
        d.city
    ].filter(Boolean).join(" "));

    lines.push("运营商：" + short(conn.isp));
    lines.push(
        "ASN：" + (
            conn.asn ? "AS" + conn.asn : "--"
        )
    );
    lines.push("组织：" + short(conn.org));
    lines.push("HTTP 耗时：" + result.ms + " ms");
}

function render() {
    const lines = [];

    lines.push("━━━ 🖥 本地网络 ━━━");

    if (SHOW_SSID) {
        const ssid = wifi.ssid || wifi.SSID;

        lines.push(
            "📶 Wi-Fi：" +
            (ssid ? ssid : "未获取（检查系统权限）")
        );
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
        "🌐 IPv6：" +
        str(v6.primaryAddress, "未启用")
    );

    lines.push("");
    lines.push("━━━ 🧭 DNS ━━━");

    lines.push(
        Array.isArray(network.dns) && network.dns.length
            ? network.dns.join(" · ")
            : "未获取"
    );

    addExit(
        lines, "━━━ 🌍 直连出口 ━━━",
        state.direct
    );

    lines.push("");
    lines.push("━━━ 🔀 当前代理 ━━━");

    const modes = {
        rule: "规则模式",
        proxy: "全局代理",
        direct: "全局直连"
    };

    lines.push(
        "出站模式：" +
        (modes[state.mode] || state.mode)
    );

    lines.push(
        "当前选择：" + str(state.selected)
    );

    if (state.reason) {
        lines.push("提示：" + state.reason);
    }

    if (state.proxy) {
        addExit(
            lines, "━━━ 🛡 代理出口 ━━━",
            state.proxy
        );
    }

    lines.push("");
    lines.push("━━━ ⚙️ 系统 ━━━");
    lines.push("系统：" + str(env.system));
    lines.push(
        "Surge：" + str(env["surge-version"])
    );
    lines.push(
        "Build：" + str(env["surge-build"])
    );

    lines.push(
        "更新：" + new Date().toLocaleString(
            "zh-CN", {hour12: false}
        )
    );


    const hasError =
        (state.direct && !state.direct.ok) ||
        (state.proxy && !state.proxy.ok);

    $done({
        title: "Network Pro · 网络监控",
        content: lines.join("\n"),
        icon: hasError
            ? "network.slash"
            : "network",
        "icon-color": hasError
            ? "#EF4444"
            : "#3B82F6"
    });

}

async function main() {
    try {
        const directTask = requestIP("DIRECT");
        const policy = await detectPolicy();

        const proxyTask = policy &&
        policy !== "DIRECT"
            ? requestIP(policy)
            : Promise.resolve(null);

        [state.direct, state.proxy] =
            await Promise.all([directTask, proxyTask]);

        render();
    } catch (e) {
        $done({
            title: "Network Pro 运行异常",
            content: String(e),
            style: "error"
        });
    }
}

main();
