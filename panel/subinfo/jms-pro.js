
const lines = [];

// 套餐信息
lines.push("━━━ 套餐信息 ━━━");
lines.push("套餐名称： " + CONFIG.plan);
lines.push("套餐总量： " + formatBytes(total));

lines.push("");

// 流量统计
lines.push("━━━ 流量统计 ━━━");
lines.push("已使用： " + formatBytes(used));
lines.push("剩余量： " + formatBytes(remaining));
lines.push("使用率： " + percentText + "%");

// 纯文本进度条，避免 Emoji 字体问题
lines.push(progressBar(percent, 20));

lines.push("流量状态： " + status.text);

lines.push("");

// 重置周期
lines.push("━━━ 流量重置 ━━━");

if (reset) {
    lines.push(
        "重置周期： 每月 " +
        reset.resetDay + " 日"
    );

    lines.push(
        "下次重置： " + reset.date
    );

    lines.push(
        "距离重置： " + reset.days + " 天"
    );
} else {
    lines.push("重置日期： 暂无数据");
}

lines.push("");

// 查询信息
lines.push("━━━ 查询信息 ━━━");
lines.push("请求策略： " + CONFIG.policy);

const updated = new Date().toLocaleString(
    "zh-CN",
    { hour12: false }
);

lines.push("更新时间： " + updated);
