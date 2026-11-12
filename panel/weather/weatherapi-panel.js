
/**
 * WeatherAPI Surge Weather Panel
 *
 * Surge Mac 6.12.0+
 * API: https://www.weatherapi.com/
 *
 * 功能：
 * - 模块参数配置 API Key
 * - auto:ip 自动定位
 * - 强制 DIRECT，避免代理出口定位
 * - 中文实时天气
 * - 温度 / 体感 / 湿度 / 降水 / 风速
 * - 空气质量 / PM2.5
 * - 错误处理
 */

// ==================================
// 1. 读取 Surge 模块参数
// ==================================

const rawArgs =
  typeof $argument === "string"
    ? $argument
    : "";

const parts = rawArgs.split("|");

const CONFIG = {
  apiKey: (parts[0] || "").trim(),
  location: (parts[1] || "AUTO").trim(),
  timeout: 12
};

const API_BASE =
  "https://api.weatherapi.com/v1/current.json";

// ==================================
// 2. 通用工具
// ==================================

function isValidNumber(value) {
  return typeof value === "number" &&
    Number.isFinite(value);
}

function format(value, digits = 1) {
  return isValidNumber(value)
    ? value.toFixed(digits)
    : "--";
}

function cleanText(value, fallback = "--") {
  return typeof value === "string" &&
    value.trim()
      ? value.trim()
      : fallback;
}

// 风向角度转中文
function windDirection(degree) {
  if (!isValidNumber(degree)) {
    return "未知风向";
  }

  const directions = [
    "北风",
    "东北风",
    "东风",
    "东南风",
    "南风",
    "西南风",
    "西风",
    "西北风"
  ];

  const normalized =
    ((degree % 360) + 360) % 360;

  const index =
    Math.floor((normalized + 22.5) / 45) % 8;

  return directions[index];
}

// 美国 EPA 空气质量等级
function getEPA(index) {
  const map = {
    1: {
      text: "优",
      style: "good"
    },
    2: {
      text: "中等",
      style: "info"
    },
    3: {
      text: "敏感人群不健康",
      style: "alert"
    },
    4: {
      text: "不健康",
      style: "alert"
    },
    5: {
      text: "非常不健康",
      style: "error"
    },
    6: {
      text: "危险",
      style: "error"
    }
  };

  return map[index] || {
    text: "暂无数据",
    style: "info"
  };
}

// 根据天气代码选择 Emoji
function weatherEmoji(code, isDay) {
  if (code === 1000) {
    return isDay ? "☀️" : "🌙";
  }

  if (code === 1003) {
    return isDay ? "⛅" : "☁️";
  }

  if ([1006, 1009].includes(code)) {
    return "☁️";
  }

  if ([1030, 1135, 1147].includes(code)) {
    return "🌫️";
  }

  if (code >= 1063 && code <= 1201) {
    return "🌧️";
  }

  if (code >= 1204 && code <= 1282) {
    return code >= 1273 && code <= 1282
      ? "⛈️"
      : "🌨️";
  }

  return "🌤️";
}


function weatherIcon(code, isDay) {
  if (code === 1000) {
    return isDay
        ? "sun.max.fill"
        : "moon.stars.fill";
  }

  if ([1003, 1006, 1009].includes(code)) {
    return isDay
        ? "cloud.sun.fill"
        : "cloud.moon.fill";
  }

  if ([1030, 1135, 1147].includes(code)) {
    return "cloud.fog.fill";
  }

  if ([1087, 1273, 1276, 1279, 1282].includes(code)) {
    return "cloud.bolt.rain.fill";
  }

  if (
      [1066, 1069, 1072, 1114, 1117].includes(code) ||
      (code >= 1204 && code <= 1237) ||
      (code >= 1255 && code <= 1264)
  ) {
    return "cloud.snow.fill";
  }

  if (
      [1063, 1150, 1153, 1168, 1171].includes(code) ||
      (code >= 1180 && code <= 1201) ||
      [1240, 1243, 1246, 1249, 1252].includes(code)
  ) {
    return "cloud.rain.fill";
  }

  return "cloud.sun.fill";
}


// 统一输出错误
function fail(message) {
  $done({
    title: "⚠️ WeatherAPI 天气获取失败",
    content: String(message),
    style: "error"
  });
}

// ==================================
// 3. 参数校验
// ==================================

if (
  !CONFIG.apiKey ||
  CONFIG.apiKey === "YOUR_API_KEY" ||
  CONFIG.apiKey === "YOUR_WEATHERAPI_KEY"
) {
  fail(
    "未设置 API Key。\n" +
    "请进入 Surge 模块参数，填写 API_KEY。"
  );
} else {
  fetchWeather();
}

// ==================================
// 4. 获取天气
// ==================================

function fetchWeather() {
  // AUTO 使用 WeatherAPI 的 IP 定位
  const location =
    CONFIG.location.toUpperCase() === "AUTO"
      ? "auto:ip"
      : CONFIG.location;

  const url =
    API_BASE +
    "?key=" + encodeURIComponent(CONFIG.apiKey) +
    "&q=" + encodeURIComponent(location) +
    "&aqi=yes" +
    "&lang=zh";

  $httpClient.get(
    {
      url: url,

      // 核心：不使用机场代理
      policy: "DIRECT",

      // 超时秒数
      timeout: CONFIG.timeout,

      headers: {
        Accept: "application/json"
      }
    },
    function(error, response, body) {
      if (error) {
        fail(
          "网络请求失败。\n" +
          String(error) +
          "\n请检查 DIRECT 网络连通性。"
        );
        return;
      }

      const status = Number(
        response &&
        (response.status || response.statusCode)
      );

      let data;

      try {
        data = typeof body === "string"
          ? JSON.parse(body)
          : body;
      } catch (e) {
        fail(
          "API 响应解析失败。\n" +
          "HTTP 状态：" + (status || "未知") +
          "\n返回内容不是有效 JSON。"
        );
        return;
      }

      // WeatherAPI 错误结构
      if (data && data.error) {
        const code = data.error.code;
        const message = data.error.message;

        let suggestion = "";

        switch (code) {
          case 1002:
            suggestion = "API Key 未提供。";
            break;
          case 1003:
            suggestion = "位置参数无效。";
            break;
          case 1005:
            suggestion = "请求 URL 无效。";
            break;
          case 1006:
            suggestion = "未找到对应位置。";
            break;
          case 2006:
            suggestion = "API Key 无效。";
            break;
          case 2007:
            suggestion = "API 调用额度已用完。";
            break;
          case 2008:
            suggestion = "API Key 已被禁用。";
            break;
          case 2009:
            suggestion = "当前套餐无权访问此接口。";
            break;
          default:
            suggestion = "请检查 API 配置。";
        }

        fail(
          "WeatherAPI 错误：" + code +
          "\n" + message +
          "\n" + suggestion
        );
        return;
      }

      if (status && status !== 200) {
        fail(
          "HTTP 请求失败：" + status
        );
        return;
      }

      if (
        !data ||
        !data.location ||
        !data.current
      ) {
        fail(
          "天气 API 缺少必要数据。\n" +
          "请检查接口或套餐权限。"
        );
        return;
      }

      renderPanel(
        data.location,
        data.current
      );
    }
  );
}

// ==================================
// 5. 生成天气面板
// ==================================

function renderPanel(location, current) {
  const condition = current.condition || {};

  const city = cleanText(
    location.name,
    "未知城市"
  );

  const region = cleanText(
    location.region,
    ""
  );

  const country = cleanText(
    location.country,
    ""
  );

  const weather = cleanText(
    condition.text,
    "未知天气"
  );

  const emoji = weatherEmoji(
    condition.code,
    current.is_day === 1
  );

  // 温度
  const temperature =
    format(current.temp_c);

  const feelsLike =
    format(current.feelslike_c);

  // 相对湿度：API 已经返回百分比
  const humidity =
    isValidNumber(current.humidity)
      ? current.humidity + "%"
      : "--";

  // 降水量：毫米，不是 mm/h
  const precipitation =
    isValidNumber(current.precip_mm)
      ? format(current.precip_mm) + " mm"
      : "--";

  // 风速与风向
  const windSpeed =
    isValidNumber(current.wind_kph)
      ? format(current.wind_kph) + " km/h"
      : "--";

  const windText = windDirection(
    current.wind_degree
  );

  // 空气质量
  const air = current.air_quality || {};

  const epaIndex = air["us-epa-index"];
  const epa = getEPA(epaIndex);

  const pm25 =
    isValidNumber(air.pm2_5)
      ? format(air.pm2_5) + " μg/m³"
      : "--";

  const pm10 =
    isValidNumber(air.pm10)
      ? format(air.pm10) + " μg/m³"
      : "--";

  // 更新时间
  const updated = cleanText(
    current.last_updated,
    "--"
  );

  // 定位模式
  const isAuto =
    CONFIG.location.toUpperCase() === "AUTO";

  const positionSource = isAuto
    ? "公网 IP 自动定位"
    : "手动指定位置";

  const position = [
    country,
    region,
    city
  ].filter(Boolean).join(" · ");

  const title =
    emoji + " " +
    city + " " +
    temperature + "°C · " +
    weather;

  const content = [
    "🌡 气温：" + temperature + "°C",
    "🤗 体感：" + feelsLike + "°C",
    "💧 湿度：" + humidity,
    "🌧 降水量：" + precipitation,
    "💨 风速：" + windSpeed + " · " + windText,
    "🍃 空气质量：" + epa.text +
      "（US EPA " + (epaIndex || "--") + "级）",
    "🌿 PM2.5：" + pm25,
    "🌿 PM10：" + pm10,
    "📍 位置：" + position,
    "🛰 定位：" + positionSource,
    "🕒 数据更新：" + updated
  ].join("\n");

  $done({
    title: title,
    content: content,
    icon: weatherIcon(
        condition.code,
        current.is_day === 1
    ),
    "icon-color": "#38BDF8"
  });
}
