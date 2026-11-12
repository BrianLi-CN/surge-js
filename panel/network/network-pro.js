
const network = $network || {};
const v4 = network.v4 || {};
const wifi = network.wifi || {};

console.log("Network Pro 脚本已执行");

$done({
    title: "Network Pro · 测试成功",
    content: [
        "✅ Surge 脚本运行正常",
        "IPv4：" + (v4.primaryAddress || "--"),
        "网关：" + (v4.primaryRouter || "--"),
        "Wi-Fi：" + (wifi.ssid || "未获取")
    ].join("\n"),
    icon: "network",
    "icon-color": "#3B82F6"
});
