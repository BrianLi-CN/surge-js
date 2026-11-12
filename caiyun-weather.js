
/**
 * Caiyun Weather Panel
 * Surge Mac 6.12.0
 *
 * 支持：
 * - 模块参数
 * - IP 自动定位
 * - 手动经纬度
 * - 自动定位失败回退
 */

// ================================
// 读取模块参数
// ================================

const args = String(
  typeof $argument !== "undefined"
    ? $argument
    : ""
).split("|");

const CONFIG = {
  token: (args[0] || "").trim(),
  mode: (args[1] || "AUTO").trim().toUpperCase(),
  longitude: Number(args[2] || 118.7969),
  latitude: Number(args[3] || 32.0603),
  city: (args[4] || "南京").trim()
};

const GEO_API = "https://ipwho.is/";
const WEATHER_API = "https://api.caiyunapp.com/v2.6/";

const SKY = {
  CLEAR_DAY: ["晴", "☀️"],
  CLEAR_NIGHT: ["晴", "🌙"],
  PARTLY_CLOUDY_DAY: ["多云", "⛅"],
  PARTLY_CLOUDY_NIGHT: ["多云", "☁️"],
  CLOUDY: ["阴", "☁️"],
  LIGHT_HAZE: ["轻度雾霾", "🌫️"],
  MODERATE_HAZE: ["中度雾霾", "🌫️"],
  HEAVY_HAZE: ["重度雾霾", "🌫️"],
  LIGHT_RAIN: ["小雨", "🌦️"],
  MODERATE_RAIN: ["中雨", "🌧️"],
  HEAVY_RAIN: ["大雨", "🌧️"],
  STORM_RAIN: ["暴雨", "⛈️"],
  LIGHT_SNOW: ["小雪", "🌨️"],
  MODERATE_SNOW: ["中雪", "❄️"],
  HEAVY_SNOW: ["大雪", "❄️"],
  STORM_SNOW: ["暴雪", "❄️"],
  FOG: ["雾", "🌫️"],
  DUST: ["浮尘", "🌫️"],
  SAND: ["沙尘", "🌪️"],
  WIND: ["大风", "💨"]
};

// ================================
// 通用工具
// ================================

function validNumber(value) {
  return typeof value === "number" &&
    Number.isFinite(value);
}

function fixed(value, digits = 1) {
  return validNumber(value)
    ? value.toFixed(digits)
    : "--";
}

function aqiLevel(value) {
  if (!validNumber(value)) return "未知";
  if (value <= 50) return "优";
  if (value <= 100) return "良";
  if (value <= 150) return "轻度污染";
  if (value <= 200) return "中度污染";
  if (value <= 300) return "重度污染";
  return "严重污染";
}

function windDirection(degree) {
  if (!validNumber(degree)) return "--";

  const names = [
    "北", "东北", "东", "东南",
    "南", "西南", "西", "西北"
  ];

  const index = Math.floor(
    (((degree % 360) + 360) % 360 + 22.5) / 45
  ) % 8;

  return names[index] + "风";
}

function panelError(message) {
  $done({
    title: "彩云天气 · 获取失败",
    content: message,
    style: "error"
  });
}

function parseResponse(error, response, body) {
  if (error) {
    throw new Error(String(error));
  }

  const status = Number(
    response && (
      response.status || response.statusCode
    )
  );

  if (status && status !== 200) {
    throw new Error("HTTP " + status);
  }

  return typeof body === "string"
    ? JSON.parse(body)
    : body;
}

function manualLocation() {
  return {
    longitude: CONFIG.longitude,
    latitude: CONFIG.latitude,
    name: CONFIG.city,
    source: "手动坐标"
  };
}

// ================================
// 初始化
// ================================

if (
  !CONFIG.token ||
  CONFIG.token === "YOUR_CAIYUN_API_TOKEN"
) {
  panelError(
    "请打开模块参数设置，填写 API_TOKEN。"
  );
} else if (
  !validNumber(CONFIG.longitude) ||
  !validNumber(CONFIG.latitude) ||
  Math.abs(CONFIG.longitude) > 180 ||
  Math.abs(CONFIG.latitude) > 90
) {
  panelError("备用经纬度参数不正确。");
} else if (CONFIG.mode === "MANUAL") {
  fetchWeather(manualLocation());
} else if (CONFIG.mode === "AUTO") {
  detectLocation();
} else {
  panelError(
    "LOCATION_MODE 只能填写 AUTO 或 MANUAL。"
  );
}

// ================================
// 自动定位
// ================================

function detectLocation() {
  $httpClient.get(
    {
      url: GEO_API,
      policy: "DIRECT",
      timeout: 8,
      headers: {
        Accept: "application/json"
      }
    },
    function (error, response, body) {
      try {
        const data = parseResponse(
          error, response, body
        );

        if (
          data.success !== true ||
          !validNumber(data.latitude) ||
          !validNumber(data.longitude)
        ) {
          throw new Error("定位数据无效");
        }

        const city = [
          data.region,
          data.city
        ].filter(Boolean).join(" · ");

        fetchWeather({
          longitude: data.longitude,
          latitude: data.latitude,
          name: city || data.country || "当前位置",
          source: "IP 自动定位"
        });

      } catch (e) {
        console.log(
          "自动定位失败，使用备用坐标：" + e
        );

        const fallback = manualLocation();
        fallback.source = "备用坐标";

        fetchWeather(fallback);
      }
    }
  );
}

// ================================
// 彩云天气 API
// ================================

function fetchWeather(location) {
  const longitude = location.longitude;
  const latitude = location.latitude;

  const url =
    WEATHER_API +
    encodeURIComponent(CONFIG.token) + "/" +
    longitude + "," + latitude +
    "/realtime?lang=zh_CN&unit=metric:v2";

  $httpClient.get(
    {
      url: url,
      timeout: 12,
      headers: {
        Accept: "application/json"
      }
    },
    function (error, response, body) {
      try {
        const data = parseResponse(
          error, response, body
        );

        if (
          !data ||
          data.status !== "ok" ||
          !data.result ||
          !data.result.realtime
        ) {
          throw new Error(
            (data && (
              data.error ||
              data.message
            )) || "响应缺少实况数据"
          );
        }

        renderWeather(
          location,
          data.result.realtime
        );

      } catch (e) {
        panelError(
          "位置：" + location.name + "\n" +
          "天气请求失败：" + e.message + "\n" +
          "请检查 Token 和网络。"
        );
      }
    }
  );
}

// ================================
// 渲染天气面板
// ================================

function renderWeather(location, rt) {
  const sky = SKY[rt.skycon] || ["未知", "🌤️"];

  const temperature = fixed(rt.temperature);
  const apparent = fixed(rt.apparent_temperature);

  const humidity = validNumber(rt.humidity)
    ? Math.round(rt.humidity * 100) + "%"
    : "--";

  const intensity =
    rt.precipitation &&
    rt.precipitation.local
      ? rt.precipitation.local.intensity
      : null;

  const rain = validNumber(intensity)
    ? fixed(intensity, 2) + " mm/h"
    : "--";

  const wind = rt.wind || {};

  const windSpeed = validNumber(wind.speed)
    ? fixed(wind.speed) + " km/h"
    : "--";

  const windText = windDirection(wind.direction);

  const air = rt.air_quality || {};
  const aqi = air.aqi ? air.aqi.chn : null;

  const aqiText = validNumber(aqi)
    ? Math.round(aqi) + " · " + aqiLevel(aqi)
    : "--";

  const pm25 = validNumber(air.pm25)
    ? Math.round(air.pm25) + " μg/m³"
    : "--";

  const updated = new Date().toLocaleTimeString(
    "zh-CN",
    {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }
  );

  const content = [
    "🌡 气温：" + temperature + "°C",
    "🤗 体感：" + apparent + "°C",
    "💧 湿度：" + humidity,
    "🌧 降水：" + rain,
    "💨 风速：" + windSpeed + " · " + windText,
    "🍃 AQI：" + aqiText,
    "🌿 PM2.5：" + pm25,
    "📍 定位：" + location.source,
    "🕒 更新：" + updated
  ].join("\n");

  const title =
    sky[1] + " " +
    location.name + " · " +
    temperature + "°C " + sky[0];

  let style = "info";

  if (validNumber(aqi)) {
    if (aqi > 150) {
      style = "error";
    } else if (aqi > 100) {
      style = "alert";
    }
  }

  $done({
    title: title,
    content: content,
    style: style
  });
}
