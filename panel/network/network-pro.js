
/**
 * Network Pro v1.5
 * Surge Mac 6.12.0
 *
 * 参考 xream network-info 请求记录识别方式
 *
 * 直连检测：强制 DIRECT
 * 代理检测：遵循 Surge 规则
 * 节点信息：读取近期请求记录
 *
 * 不修改 Surge 配置
 */

const net = typeof $network !== "undefined"
    ? $network : {};

const env = typeof $environment !== "undefined"
    ? $environment : {};

const v4 = net.v4 || {};
const v6 = net.v6 || {};
const wifi = net.wifi || {};

const API = "https://ipwho.is/";
const TIMEOUT = 10;

const state = {
    direct: null,
    proxy: null,
    policy: "",
    remoteAddress: "",
    traceError: ""
};

function str(value, fallback = "--") {
    if (value === undefined ||
        value === null ||
        value === "") {
        return fallback;
    }
    return String(value);
}

function shorten(value, max = 46) {
    const s = str(value);
    return s.length > max
        ? s.slice(0, max - 1) + "…"
        : s;
}

function requestIP(mode, callback) {
    const start = Date.now();

    // 使用不同查询标识区分两次请求
    const url = API +
        "?lang=zh-CN" +
        "&np_probe=" + mode +
        "&t=" + Date.now();

    const options = {
        url: url,
        timeout: TIMEOUT,
        headers: {
            Accept: "application/json",
            "Cache-Control": "no-cache"
        }
    };

    // 直连使用 DIRECT
    // 代理探测不指定 policy，遵循 Surge 规则
    if (mode === "direct") {
        options.policy = "DIRECT";
    }

    $httpClient.get(options, function(
        error, response, body
    ) {
        const ms = Date.now() - start;

        if (error) {
            callback({
                ok: false,
                error: String(error),
                ms: ms
            }, url);
            return;
        }

        try {
            const status = Number(
                response &&
                (response.status || response.statusCode)
            );

            if (status && status !== 200) {
                throw new Error("HTTP " + status);
            }

            const data = typeof body === "string"
                ? JSON.parse(body)
                : body;

            if (!data ||
                data.success !== true ||
                !data.ip) {
                throw new Error(
                    str(data && data.message, "IP 数据无效")
                );
            }

            callback({
                ok: true,
                data: data,
                ms: ms
            }, url);

        } catch (e) {
            callback({
                ok: false,
                error: String(e.message || e),
                ms: ms
            }, url);
        }
    });
}

// 根据真实请求记录获取策略
function getActualPolicy(requestURL, callback) {
    if (typeof $httpAPI === "undefined") {
        callback(null, "HTTP API 不可用");
        return;
    }

    try {
        $httpAPI(
            "GET",
            "/v1/requests/recent",
            null,
            function(result) {
                try {
                    const requests =
                        result && result.requests;

                    if (!Array.isArray(requests)) {
                        throw new Error(
                            "无法读取最近请求列表"
                        );
                    }

                    const marker = requestURL
                        .match(/np_probe=([^&]+)/);

                    const probe = marker
                        ? "np_probe=" + marker[1]
                        : "";

                    // 只查找本次检测对应的请求
                    const request = requests.find(r => {
                        const url = String(r.URL || r.url || "");
                        return url.includes("ipwho.is") &&
                            url.includes(probe);
                    });

                    if (!request) {
                        throw new Error(
                            "未找到本次出口探测请求"
                        );
                    }

                    callback({
                        policy: request.policyName || "",
                        remoteAddress:
                            request.remoteAddress || ""
                    }, null);

                } catch (e) {
                    callback(null, String(e.message || e));
                }
            }
        );
    } catch (e) {
        callback(null, String(e));
    }
}


/**
 * 运营商中文名称
 */
function translateISP(value) {
    if (!value) return "--";

    const name = String(value);
    const s = name.toLowerCase();

    const rules = [
        [/china\s*unicom|china169|cncgroup/,
            "中国联通"],
        [/china\s*telecom|chinanet|ctnet/,
            "中国电信"],
        [/china\s*mobile|cmnet|cmi\b|cmlink/,
            "中国移动"],
        [/china\s*education|cernet/,
            "中国教育网"],
        [/china\s*science|cstnet/,
            "中国科技网"],
        [/china\s*broadcast|cbnet/,
            "中国广电"],
        [/cloudflare/, "Cloudflare"],
        [/google/, "谷歌"],
        [/microsoft|azure/, "微软"],
        [/amazon|aws/, "亚马逊云"],
        [/alibaba|aliyun/, "阿里云"],
        [/tencent/, "腾讯云"],
        [/oracle/, "甲骨文云"],
        [/digitalocean/, "DigitalOcean"],
        [/vultr/, "Vultr"],
        [/akamai/, "Akamai"],
        [/linode/, "Linode"]
    ];

    for (const [pattern, label] of rules) {
        if (pattern.test(s)) return label;
    }

    return name;
}

/**
 * 网络组织中文化
 * 只处理能够确定含义的名称。
 */
function translateOrganization(value) {
    if (!value) return "--";

    const name = String(value);
    const s = name.toLowerCase();

    const provinceMap = {
        jiangsu: "江苏",
        zhejiang: "浙江",
        shanghai: "上海",
        beijing: "北京",
        guangdong: "广东",
        shandong: "山东",
        sichuan: "四川",
        hubei: "湖北",
        henan: "河南",
        anhui: "安徽",
        fujian: "福建",
        hunan: "湖南"
    };

    let province = "";

    for (const key in provinceMap) {
        if (s.includes(key)) {
            province = provinceMap[key];
            break;
        }
    }

    let operator = "";

    if (/china\s*unicom|china169/.test(s)) {
        operator = "中国联通";
    } else if (/china\s*telecom|chinanet/.test(s)) {
        operator = "中国电信";
    } else if (/china\s*mobile|cmnet/.test(s)) {
        operator = "中国移动";
    }

    if (operator) {
        const networkType =
            /backbone/.test(s) ? "骨干网" :
                /province|provincial/.test(s) ? "省级网络" :
                    /network/.test(s) ? "网络" : "";

        return province + operator + networkType;
    }

    // 无法确定的组织保留原名
    return name;
}


function addExit(lines, title, result) {
    lines.push("");
    lines.push("━━━ " + title + " ━━━");

    if (!result) {
        lines.push("状态：未检测");
        return;
    }

    if (!result.ok) {
        lines.push(
            "❌ " + shorten(result.error, 65)
        );
        return;
    }

    const d = result.data;
    const conn = d.connection || {};

    lines.push("IP：" + str(d.ip));

    lines.push(
        "位置：" +
        [
            data.flag && data.flag.emoji,
            data.country,
            data.region,
            data.city
        ].filter(Boolean).join(" · ")
    );


    lines.push(
        "运营商：" +
        translateISP(conn.isp)
    );

    lines.push(
        "ASN：" +
        (conn.asn ? "AS" + conn.asn : "--")
    );

    lines.push(
        "网络组织：" +
        translateOrganization(conn.org)
    );

    lines.push(
        "ASN：" +
        (conn.asn ? "AS" + conn.asn : "--")
    );

    lines.push(
        "HTTP 耗时：" + result.ms + " ms"
    );
}

function render() {
    const lines = [];

    lines.push("━━━ 🖥 本地网络 ━━━");

    lines.push(
        "📶 Wi-Fi：" + str(wifi.ssid)
    );

    lines.push(
        "🔌 网络接口：" +
        str(v4.primaryInterface)
    );

    lines.push(
        "🏠 本机 IPv4：" +
        str(v4.primaryAddress)
    );

    lines.push(
        "🚪 默认网关：" +
        str(v4.primaryRouter)
    );

    lines.push(
        "🌐 IPv6：" +
        str(v6.primaryAddress, "未启用")
    );

    lines.push("");
    lines.push("━━━ 🧭 DNS ━━━");

    lines.push(
        Array.isArray(net.dns) && net.dns.length
            ? net.dns.join(" · ")
            : "未获取"
    );

    addExit(
        lines,
        "🌍 直连出口",
        state.direct
    );

    addExit(
        lines,
        "🛡 代理出口",
        state.proxy
    );

    lines.push("");
    lines.push("━━━ 🔀 当前代理 ━━━");

    lines.push(
        "本次请求策略：" +
        str(state.policy, "未识别")
    );

    if (state.traceError) {
        lines.push(
            "记录查询：" +
            shorten(state.traceError, 55)
        );
    }

    if (
        state.direct && state.direct.ok &&
        state.proxy && state.proxy.ok
    ) {
        const same =
            state.direct.data.ip ===
            state.proxy.data.ip;

        lines.push(
            "出口 IP：" +
            (same
                ? "⚠️ 与直连相同"
                : "✅ 与直连不同")
        );
    }

    lines.push("");
    lines.push("━━━ ⚙️ 系统 ━━━");

    lines.push(
        "系统：" + str(env.system)
    );

    lines.push(
        "Surge：" +
        str(env["surge-version"])
    );

    lines.push(
        "Build：" +
        str(env["surge-build"])
    );

    lines.push(
        "更新：" +
        new Date().toLocaleString(
            "zh-CN",
            {hour12: false}
        )
    );

    const failed =
        (state.direct && !state.direct.ok) ||
        (state.proxy && !state.proxy.ok);

    $done({
        title: "Network Pro · 网络监控",
        content: lines.join("\n"),
        icon: failed ? "network.slash" : "network",
        "icon-color": failed
            ? "#EF4444"
            : "#3B82F6"
    });
}

// 直连请求先执行，再执行代理请求
requestIP("direct", function(result) {
    state.direct = result;

    requestIP("proxy", function(proxyResult, url) {
        state.proxy = proxyResult;

        // 无论 IP 查询是否成功，尝试读取策略
        getActualPolicy(url, function(info, error) {
            if (info) {
                state.policy = info.policy;
                state.remoteAddress = info.remoteAddress;
            } else {
                state.traceError = error || "";
            }

            render();
        });
    });
});
